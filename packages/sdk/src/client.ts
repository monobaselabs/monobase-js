/**
 * Runtime configuration for the auto-generated SDK client.
 *
 * Wired into `@hey-api/client-fetch` via `runtimeConfigPath` in
 * `openapi-ts.config.ts`. Two responsibilities:
 *
 * 1. Provide the initial `baseUrl` so generated SDK functions can be called
 *    before the React provider mounts (e.g. from non-React contexts).
 * 2. Inject a custom fetch that routes through `getTransport()` when running
 *    inside Tauri's embedded mode, preserving IPC support without leaking
 *    Tauri concerns into the generated client.
 *
 * Kept independent of `./generated/*` so this file compiles before the very
 * first run of `bun run generate`.
 */

import { getTransport, isTauriEnvironment, isEmbeddedMode } from './transport';

const DEFAULT_BASE_URL = 'http://localhost:7213';

let baseUrl: string =
  (typeof process !== 'undefined' && process.env?.MONOBASE_API_BASE_URL) ||
  (typeof globalThis !== 'undefined' &&
    (globalThis as { __MONOBASE_API_BASE_URL__?: string }).__MONOBASE_API_BASE_URL__) ||
  DEFAULT_BASE_URL;

/**
 * Update the SDK's base URL at runtime. The provider calls this on mount.
 *
 * Note: `createClientConfig` runs once when the generated client module
 * loads, so after that the generated client has its own copy of `baseUrl`.
 * Use `client.setConfig({ baseUrl })` from `./generated/client.gen` for the
 * runtime override; this setter only affects the bootstrap default.
 */
export function setSdkBaseUrl(url: string): void {
  baseUrl = url;
}

export function getSdkBaseUrl(): string {
  return baseUrl;
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value;
  } else {
    Object.assign(out, headers);
  }
  return out;
}

function bodyToString(body: BodyInit | null | undefined): string | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string') return body;
  // The IPC transport only carries string bodies. Generated SDK calls send JSON,
  // so this is fine for the common path. Multipart/binary requests should stay
  // on HTTP transport (multi-step storage upload uses a separate code path).
  return undefined;
}

// Plain function type instead of `typeof fetch` — Bun's `typeof fetch` requires
// the `preconnect` static method which we don't (and shouldn't) implement.
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const customFetch: FetchFn = async (input, init) => {
  // HTTP path (default for browsers and non-embedded Tauri): native fetch with
  // credentials so Better-Auth session cookies ride along.
  if (!isTauriEnvironment() || !isEmbeddedMode()) {
    return fetch(input, { ...init, credentials: init?.credentials ?? 'include' });
  }

  // IPC path: bridge through the existing transport layer so requests reach
  // the embedded backend via Tauri commands.
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const path = url.startsWith(baseUrl) ? url.slice(baseUrl.length) : url;

  const transport = getTransport();
  const resp = await transport.request({
    method: (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase(),
    url: path,
    body: bodyToString(init?.body ?? null),
    headers: headersToRecord(init?.headers),
  });

  return new Response(resp.body || null, {
    status: resp.status,
    headers: resp.headers,
  });
};

/**
 * Canonical error type thrown by the auto-generated SDK.
 *
 * Hey-api's `throwOnError: true` throws the parsed response body, which on its
 * own loses the HTTP status. We register an error interceptor (below) that
 * wraps every non-2xx response in `SdkError` so consumers and the retry policy
 * can branch on `status` consistently across all generated calls.
 */
export class SdkError extends Error {
  readonly status: number;
  readonly url: string | undefined;
  readonly method: string | undefined;
  readonly body: unknown;

  constructor(args: {
    status: number;
    url?: string;
    method?: string;
    body?: unknown;
    message?: string;
  }) {
    super(args.message ?? `SDK request failed: ${args.method ?? '?'} ${args.url ?? ''} → ${args.status}`);
    this.name = 'SdkError';
    this.status = args.status;
    this.url = args.url;
    this.method = args.method;
    this.body = args.body;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message?.includes('aborted'))
  );
}

/**
 * Wrap whatever hey-api threw into a structured SdkError. Called for every
 * non-2xx response. `response` is the original Response; `error` is the parsed
 * body (could be JSON object, text string, or anything else).
 */
function wrapError(
  error: unknown,
  response: Response | undefined,
  request: Request | undefined,
): SdkError | unknown {
  if (error instanceof SdkError) return error;
  if (isAbortError(error)) return error;

  const status = response?.status ?? 0;
  const url = response?.url ?? request?.url;
  const method = request?.method;

  let message: string | undefined;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  return new SdkError({ status, url, method, body: error, message });
}

/**
 * The error interceptor signature compatible with `client.interceptors.error.use(...)`
 * from `@hey-api/client-fetch`. Exposed so the React provider (or any equivalent
 * bootstrap module) can install it after the generated client is loaded.
 */
export const errorInterceptor: (
  error: unknown,
  response: Response | undefined,
  request: Request | undefined,
) => unknown = wrapError;

/**
 * Loose-typed signature on purpose: `CreateClientConfig` lives in `./generated/`,
 * but this file must compile before the first generation. The generated client
 * accepts any function that takes its config and returns a compatible shape; the
 * cast at the end bridges the inferred `T` with our spread overrides without
 * pulling in the generated type.
 *
 * Wires the bootstrap `baseUrl` and a Tauri-aware fetch into the generated client.
 * The error interceptor is installed separately (see provider.tsx) because the
 * interceptor registry lives on the client *instance*, not the config object.
 */
export function createClientConfig<T>(config: T): T {
  return {
    ...config,
    baseUrl,
    fetch: customFetch,
  } as T;
}
