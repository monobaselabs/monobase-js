# `@monobase/sdk`

Type-safe frontend SDK for the Monobase Application Platform. The bulk of the SDK is auto-generated from `@monobase/api-spec` (TypeSpec → OpenAPI). On top of that we ship a thin layer for cross-cutting concerns: a Tauri-aware fetch, a `MutationCache`-backed toast convention, an optimistic-mutation helper, a typed PATCH builder, and named multi-step workflows.

## Architecture

```
packages/sdk/src/
├── client.ts                       Runtime config for the generated client
│                                   - bootstraps baseUrl + custom fetch
│                                   - exports SdkError + errorInterceptor
│                                   - HTTP by default, Tauri IPC in embedded mode
├── transport.ts                    HTTP / Tauri IPC dual transport (used by client.ts)
├── generated/                      ⚠️ auto-generated. Do not edit.
│   ├── client.gen.ts               Configured fetch client (calls createClientConfig)
│   ├── sdk.gen.ts                  One function per operationId
│   ├── types.gen.ts                Schemas + operation envelopes (Date for date fields)
│   ├── transformers.gen.ts         Auto Date conversion via @hey-api/transformers
│   └── @tanstack/react-query.gen.ts queryOptions / mutationOptions / queryKey per op
├── flows/                          Named multi-step workflows over generated SDK
│   ├── file-upload.ts              4-step S3 upload + useFileUpload hook
│   └── billing-onboarding.ts       Stripe Connect onboarding decision tree
├── utils/
│   ├── patch.ts                    buildPatch, useDirtyPatch, useDirtyValues
│   └── webrtc/                     Signaling + RTCPeerConnection wrapper
└── react/
    ├── provider.tsx                ApiProvider — QueryClient defaults, MutationCache,
    │                               error-interceptor install, base URL wiring
    ├── auth.ts                     Better-Auth client factory + context
    ├── use-optimistic-mutation.ts  Generic optimistic update helper
    └── hooks/
        └── use-auth.ts             Better-Auth hooks (useSession, useSignOut, …)
```

The generated layer is regenerated whenever the OpenAPI spec changes. Everything outside `generated/` is hand-written and small (~10 files including tests).

## Setup

```tsx
import { ApiProvider } from '@monobase/sdk/react/provider'
import { toast } from 'sonner'

function App() {
  return (
    <ApiProvider apiBaseUrl="http://localhost:7213" notifier={toast}>
      <YourApp />
    </ApiProvider>
  )
}
```

`ApiProvider` does five things on mount:

1. Installs an error interceptor on the generated client that wraps every non-2xx response in `SdkError` (uniform `status` / `body` / `url`).
2. Sets the generated client's `baseUrl`.
3. Initializes the Better-Auth client and exposes it via context.
4. Builds a `QueryClient` with smart retry (no 4xx, retry 5xx + network) and shared `staleTime`/`gcTime` defaults.
5. Installs a `MutationCache` that forwards `mutation.meta.toast` to the optional `notifier` (typically `sonner`'s `toast` namespace). The SDK has no direct dependency on any toast library.

## Generating the SDK

```bash
cd specs/api && bun run build              # TypeSpec → openapi.json
cd ../../packages/sdk && bun run generate  # OpenAPI → src/generated/
```

Output (gitignored, regenerate per branch):

- `sdk.gen.ts` — typed function per operationId. e.g. `getPerson({ path: { person: 'me' } })` returns `{ data, error }`. The `@hey-api/transformers` plugin auto-converts `format: date-time` / `date` fields to `Date` instances.
- `types.gen.ts` — every schema (`Person`, `Booking`, …) and operation envelope (`GetPersonData`, `GetPersonResponse`, `GetPersonError`).
- `@tanstack/react-query.gen.ts` — `xxxQueryKey()`, `xxxOptions()`, `xxxMutation()`, `xxxInfiniteOptions()`. These already throw on error and unwrap `data`, so they spread directly into `useQuery` / `useMutation`.
- `client.gen.ts` — the configured fetch client; calls our `createClientConfig` from `src/client.ts`.

## Using the generated SDK

### Direct calls

```ts
import { getPerson, listBookings } from '@monobase/sdk/generated'

const { data: me } = await getPerson({ path: { person: 'me' }, throwOnError: true })
const { data: bookings } = await listBookings({ query: { status: 'confirmed' }, throwOnError: true })
```

### Queries

```tsx
import { useQuery } from '@tanstack/react-query'
import { listNotificationsOptions } from '@monobase/sdk/generated/@tanstack/react-query.gen'

function Bell() {
  const { data } = useQuery({
    ...listNotificationsOptions({ query: { status: 'unread' } }),
    refetchInterval: 60_000,
  })
  return <span>{data?.pagination.totalCount ?? 0} unread</span>
}
```

### Mutations with toast UX

```tsx
import { useMutation } from '@tanstack/react-query'
import { createPersonMutation } from '@monobase/sdk/generated/@tanstack/react-query.gen'

const create = useMutation({
  ...createPersonMutation(),
  meta: {
    toast: {
      success: 'Profile created',
      error: (err: unknown) => err instanceof Error ? err.message : 'Failed',
    },
  },
})
```

`meta.toast.success` / `meta.toast.error` is read by `MutationCache` in the provider and dispatched to whatever `notifier` you passed in. Set either to `false` to suppress.

### Optimistic updates

```tsx
import {
  markNotificationAsReadMutation,
  listNotificationsQueryKey,
} from '@monobase/sdk/generated/@tanstack/react-query.gen'
import { useOptimisticMutation } from '@monobase/sdk/react/use-optimistic-mutation'

const markRead = useOptimisticMutation(markNotificationAsReadMutation(), {
  optimistic: {
    queryKey: () => listNotificationsQueryKey({ query: { limit: 100 } }),
    updater: (current: ListNotificationsResponse | undefined, vars) => {
      if (!current) return current
      return {
        ...current,
        data: current.data.map((n) =>
          n.id === vars.path.notif ? { ...n, status: 'read', readAt: new Date() } : n,
        ),
      }
    },
  },
})

markRead.mutate({ path: { notif: 'abc' } })
```

The helper handles snapshot, rollback on error, and post-settle invalidation.

### Type-safe partial updates

```ts
import { buildPatch } from '@monobase/sdk/utils/patch'
import type { PersonUpdateRequest } from '@monobase/sdk/generated/types.gen'

// `lastName` is `string | null` in the schema → null is allowed.
// `firstName` is `string` → null is a compile error.
const patch = buildPatch<PersonUpdateRequest>({
  firstName: 'Ada',
  lastName: null,
})
```

For React Hook Form: `useDirtyPatch` reads `formState.dirtyFields` and produces a patch via a transform you supply. `useDirtyValues` is a shortcut for the case where form field names match schema field names exactly.

### Multi-step workflows

```tsx
import { useFileUpload, startBillingOnboarding } from '@monobase/sdk/flows'

// File upload (4-step S3 flow with progress)
const { upload, isUploading, progress } = useFileUpload()
await upload(file)

// Stripe Connect onboarding (decides which redirect URL the user needs)
const { step, url, account } = await startBillingOnboarding({
  refreshUrl: window.location.href,
  returnUrl: '/dashboard',
})
window.location.href = url
```

Each flow composes 2–4 generated calls plus (occasionally) a non-API side effect like an S3 PUT or a Stripe redirect. They're not in the OpenAPI spec — they're product workflows over the spec.

### Better-Auth

Authentication still uses Better-Auth (separate from the generated SDK).

```tsx
import { useSession, useSignOut, useEmailVerification } from '@monobase/sdk/react/hooks/use-auth'
```

## Errors

Every non-2xx response is wrapped in an `SdkError` by the error interceptor:

```ts
import { SdkError } from '@monobase/sdk/client'

try {
  await getPerson({ path: { person: 'me' }, throwOnError: true })
} catch (err) {
  if (err instanceof SdkError) {
    console.log(err.status, err.url, err.body)
  }
}
```

The provider's retry policy and `MutationCache` toast handler both branch on `SdkError` for status-aware behavior.

## Testing

```bash
bun run typecheck
bun test
```

Tests cover `transport.ts`. Generated code is not unit-tested — its correctness comes from the OpenAPI spec.

## License

PROPRIETARY
