---
name: frontend-module
description: Build a frontend feature in apps/account using the auto-generated @monobase/sdk-ts hooks. Use when implementing UI for an existing API module or a new feature spanning routes/components/forms.
---

# frontend-module

Build a complete frontend feature in `apps/account/` using the SDK hooks generated from the OpenAPI spec.

## Triggers

- Implementing UI for an API endpoint (existing or just added via `/typespec` + `/handler`)
- Adding a new page, dashboard tab, or feature flow
- Building forms backed by a typed mutation

## How the SDK works now

The SDK at `packages/sdk-ts/` is **auto-generated** from `specs/api/dist/openapi/openapi.json` via `@hey-api/openapi-ts`. Generated output lives in `packages/sdk-ts/src/generated/` and is re-built by `cd packages/sdk-ts && bun run generate`. Do not write hand-rolled service files or query-key tables — import from the generated barrel:

```typescript
import {
  listBookings,                      // raw fetch
  listBookingsOptions,               // TanStack Query options factory
  useListBookingsQuery,              // pre-bound hook
  useCreateBookingMutation,          // mutation hook with typed args
} from '@monobase/sdk-ts/generated'
```

Hand-written extras live alongside the generated code:

- `@monobase/sdk-ts/client` — `createClient`, `SdkError`, Tauri-aware fetch transport
- `@monobase/sdk-ts/flows/file-upload` — multi-step presign + upload + commit
- `@monobase/sdk-ts/flows/billing-onboarding` — Stripe Connect orchestration
- `@monobase/sdk-ts/utils/patch` — `buildPatch(current, update, { nullable: [...] })` typed PATCH builder
- `@monobase/sdk-ts/react/use-optimistic-mutation` — toast convention via `MutationCache`

## Workflow

### 1. Confirm the endpoint exists in the SDK

```bash
grep -rn 'useFooBarQuery\|fooBar' packages/sdk-ts/src/generated/ | head -5
```

If the endpoint is missing, the spec hasn't been regenerated — run `cd specs/api && bun run build && cd ../../packages/sdk-ts && bun run generate`. If the endpoint isn't in the spec at all, run `/typespec` and `/handler` first.

### 2. Add the feature folder

`apps/account/src/features/{feature}/` contains the page-specific logic. Larger features get split:

```
apps/account/src/features/{feature}/
├── components/{form, list, detail}.tsx   # Feature-specific React components
├── hooks/use-{thing}.ts                  # Wrappers around SDK hooks (only if needed)
└── schema.ts                             # Zod schemas for forms
```

Reference existing features under `apps/account/src/features/` (booking, billing, person) for the pattern.

### 3. Zod schema for the form

`apps/account/src/features/{feature}/schema.ts`:

```typescript
import { z } from 'zod'

export const createFooSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
})

export type CreateFooFormValues = z.infer<typeof createFooSchema>
```

### 4. Form component (react-hook-form + Zod)

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCreateFooMutation } from '@monobase/sdk-ts/generated'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/form'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
import { createFooSchema, type CreateFooFormValues } from '../schema'

export function FooForm({ defaultValues, onSuccess }: {
  defaultValues?: Partial<CreateFooFormValues>
  onSuccess?: () => void
}) {
  const form = useForm<CreateFooFormValues>({
    resolver: zodResolver(createFooSchema),
    defaultValues,
  })

  const create = useCreateFooMutation({
    onSuccess: () => { form.reset(); onSuccess?.() },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => create.mutate({ body: values }))}>
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" disabled={create.isPending}>Save</Button>
      </form>
    </Form>
  )
}
```

For PATCH endpoints: use `buildPatch` from `@monobase/sdk-ts/utils/patch` to compute the diff and pass `{ nullable: [...] }` for fields that send `null` to clear.

### 5. Route

`apps/account/src/routes/_dashboard/{feature}.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { useListFoosQuery } from '@monobase/sdk-ts/generated'
import { Skeleton } from '@/components/skeleton'

export const Route = createFileRoute('/_dashboard/foos')({
  component: FoosPage,
})

function FoosPage() {
  const { data, isLoading, error } = useListFoosQuery({})

  if (isLoading) return <Skeleton />
  if (error) return <div role="alert">{error.message}</div>
  if (!data?.length) return <div>No foos yet</div>

  return <ul>{data.map(foo => <li key={foo.id}>{foo.name}</li>)}</ul>
}
```

### 6. Typecheck + build

```bash
cd apps/account && bun run typecheck && bun run build
```

## Conventions

- File names: **kebab-case** (`foo-form.tsx`, not `FooForm.tsx`).
- Component exports: **PascalCase** (`export function FooForm`).
- Imports: use `@/` for everything inside `apps/account/src/`. SDK as `@monobase/sdk-ts/...`.
- Routes never import from generated SDK directly when the data needs derivation — wrap in a feature hook.
- shadcn/ui primitives live at `apps/account/src/components/` (inlined, not from a shared package). Add new ones with `bunx shadcn@latest add {component}`.
- Date display: `formatDate` from `@/lib/format-date`. Date math: `date-fns`.
- Country codes: uppercase. Language codes: lowercase. Timezones: IANA (e.g., `Asia/Manila`).
