import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { AuthQueryProvider } from '@daveyplate/better-auth-tanstack'
import { setSdkBaseUrl, errorInterceptor, SdkError } from '../client'
import { client as generatedClient } from '../generated/client.gen'
import { initAuthClient, AuthClientContext } from './auth'
import type { ReactNode } from 'react'
import { useMemo, useRef } from 'react'

/**
 * Optional notifier interface — the SDK no longer ships a hard dependency on
 * `sonner` (or any other toast library). The consuming app passes a notifier
 * (typically `sonner`'s `toast` namespace) and the SDK's `MutationCache`
 * handlers route mutation success/error toasts through it based on
 * `mutation.meta.toast`.
 */
export interface SdkNotifier {
  success: (message: string) => void
  error: (message: string) => void
}

/**
 * Convention for declaring toast UX on a mutation:
 *
 * ```ts
 * useMutation({
 *   ...createPersonMutation(),
 *   meta: { toast: { success: 'Profile created', error: 'Could not create profile' } },
 * })
 * ```
 *
 * Set a value to `false` to suppress that side; provide a function for the
 * error case to derive the message from the thrown error.
 */
export interface MutationToastMeta {
  success?: string | false
  error?: string | ((error: unknown) => string) | false
}

export interface ApiProviderProps {
  apiBaseUrl: string
  /** Optional pre-built QueryClient. One is created if you don't pass one. */
  queryClient?: QueryClient
  /** Optional notifier — without it, mutations meta.toast is silently ignored. */
  notifier?: SdkNotifier
  children: ReactNode
}

/**
 * Centralized retry policy used by both queries and mutations. After the error
 * interceptor in `client.ts`, every non-2xx error is an `SdkError`, so the
 * status check is uniform — no need to maintain two retry helpers.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false
  if (error instanceof SdkError) {
    if (error.status >= 400 && error.status < 500 && error.status !== 408) return false
    return true
  }
  // TypeError, AbortError, network failures — retry by default.
  return true
}

function readToastMeta(meta: unknown): MutationToastMeta | undefined {
  if (!meta || typeof meta !== 'object') return undefined
  const toast = (meta as { toast?: unknown }).toast
  if (!toast || typeof toast !== 'object') return undefined
  return toast as MutationToastMeta
}

function createDefaultQueryClient(notifier?: SdkNotifier): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
        retry: shouldRetry,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: shouldRetry,
        gcTime: 1000 * 5,
      },
    },
    mutationCache: new MutationCache({
      onSuccess: (_data, _vars, _ctx, mutation) => {
        if (!notifier) return
        const meta = readToastMeta(mutation.meta)
        if (meta?.success) notifier.success(meta.success)
      },
      onError: (error, _vars, _ctx, mutation) => {
        if (!notifier) return
        const meta = readToastMeta(mutation.meta)
        const message =
          typeof meta?.error === 'function'
            ? meta.error(error)
            : meta?.error
        if (message) notifier.error(message)
      },
    }),
  })
}

export function ApiProvider({
  queryClient: providedQueryClient,
  apiBaseUrl,
  notifier,
  children,
}: ApiProviderProps) {
  const queryClient = useMemo(
    () => providedQueryClient ?? createDefaultQueryClient(notifier),
    [providedQueryClient, notifier],
  )

  // Install the error interceptor exactly once across the app's lifetime.
  // Hey-api's `interceptors.error.use(...)` registers globally on the client
  // instance, so re-running on every render would stack duplicate handlers.
  const interceptorInstalledRef = useRef(false)
  if (!interceptorInstalledRef.current) {
    generatedClient.interceptors.error.use(errorInterceptor)
    interceptorInstalledRef.current = true
  }

  const authClient = useMemo(() => {
    setSdkBaseUrl(apiBaseUrl)
    generatedClient.setConfig({ baseUrl: apiBaseUrl })
    return initAuthClient(apiBaseUrl)
  }, [apiBaseUrl])

  return (
    <QueryClientProvider client={queryClient}>
      <AuthQueryProvider>
        <AuthClientContext.Provider value={authClient}>
          {children}
        </AuthClientContext.Provider>
      </AuthQueryProvider>
    </QueryClientProvider>
  )
}
