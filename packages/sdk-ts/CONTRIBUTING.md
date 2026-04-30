# Contributing to `@monobase/sdk-ts`

Specific to this package. For general repo guidelines see the [main CONTRIBUTING.md](../../CONTRIBUTING.md).

## Architecture in one paragraph

The SDK is auto-generated from `@monobase/api-spec` (TypeSpec → OpenAPI) by `@hey-api/openapi-ts`. Hand-written code is intentionally minimal and lives outside `src/generated/`: a Tauri-aware fetch + `SdkError` (`client.ts`), a React provider with a `MutationCache`-based toast convention and unified retry policy (`react/provider.tsx`), an optimistic-mutation helper (`react/use-optimistic-mutation.ts`), a typed PATCH builder (`utils/patch.ts`), Better-Auth bindings (`react/auth.ts`, `react/hooks/use-auth.ts`), and named multi-step workflows (`flows/`). When deciding where new code goes, prefer pushing it upstream into TypeSpec; if it can't go there, add a flow; only if neither fits should you add to the SDK.

## API-first workflow

Every endpoint change goes through TypeSpec.

```bash
# 1. Edit the spec
$EDITOR specs/api/src/modules/<module>.tsp

# 2. Build the spec
cd specs/api && bun run build

# 3. Regenerate the backend
cd ../../services/api-ts && bun run generate

# 4. Regenerate the SDK
cd ../../packages/sdk-ts && bun run generate
```

Generated artifacts in `src/generated/` are gitignored — regenerate after pulling.

## Where new code goes

| If you need to… | Put it… |
|---|---|
| Add or change an endpoint | TypeSpec, then regenerate. Don't hand-write a wrapper. |
| Make a field nullable on PATCH | TypeSpec: `field?: T \| null`. Then `buildPatch<T>` enforces it. |
| Convert a date string to `Date` | The generator does this automatically for `format: date-time` and `format: date`. Use `utcDateTime` / `plainDate` scalars in TypeSpec. |
| Combine 2+ operations into one workflow (file upload, onboarding, …) | `src/flows/`. Plain async function over the generated SDK + an optional thin React hook. |
| Add toast UX to a mutation | `meta.toast` — `{ success?: string \| false, error?: string \| ((err) => string) \| false }`. The provider's `MutationCache` reads it. |
| Add an optimistic update | `useOptimisticMutation(generatedMutation, { optimistic, invalidates })`. |
| Customize retry per query | Override `retry` on the `useQuery`. The default policy (`shouldRetry` in `provider.tsx`) is `SdkError`-aware. |
| Add an auth hook | Better-Auth client lives in `react/auth.ts`. Add wrappers in `react/hooks/use-auth.ts`. |

## When to break the rules

The generic helpers cover the 80% case. For the 20%:

- **Cross-resource optimistic updates** (mutation invalidates 3+ caches with custom rollback). Use TanStack's `useMutation` with `onMutate`/`onError`/`onSettled` directly instead of `useOptimisticMutation`.
- **A workflow that's actually one operation** (no orchestration, just a generated call with custom retry). Don't put it in `flows/` — call the generated function directly from the consumer.
- **Toast logic that depends on response data** (e.g. "show success only if invoice was new"). Use mutation `onSuccess` directly; don't try to express it in `meta.toast`.

## Testing

`transport.ts` has unit tests. Generated code is not unit-tested — its correctness comes from the OpenAPI spec.

```bash
bun run typecheck    # TypeScript across the whole SDK
bun test             # unit tests
```

Smoke-test consumer changes by typechecking and running `apps/account`:

```bash
cd ../../apps/account
bun run typecheck && bun run build
bun dev   # http://localhost:3002
```

## Common pitfalls

- **Never edit `src/generated/`.** Regenerate from the spec.
- **Never import a toast library inside the SDK.** The provider's `notifier` slot is the only correct hook.
- **Always pass `throwOnError: true`** to direct generated SDK calls — otherwise errors are returned in the result envelope and the error interceptor doesn't fire.
- **Don't reinvent `apiGet/apiPost/apiPatch`.** They were removed because the generated client covers every operation with proper types.
- **Path parameter names match the spec exactly.** `markNotificationAsRead({ path: { notif: id } })`, not `notification`.

## Adding a new flow

```ts
// src/flows/my-flow.ts
import { stepOne, stepTwo } from '../generated/sdk.gen'
import { SdkError } from '../client'

export async function myFlow(input: MyInput): Promise<MyResult> {
  const { data: a } = await stepOne({ body: input.something, throwOnError: true })
  const { data: b } = await stepTwo({ path: { id: a.id }, throwOnError: true })
  return { /* ... */ }
}

// Re-export from src/flows/index.ts
```

Add a hook only if the flow has React-side state (progress, lifecycle). Otherwise consumers can use the bare async function from any context.
