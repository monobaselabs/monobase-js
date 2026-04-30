# Account App Development Guide

This guide covers account app-specific development details. **For shared frontend patterns**, see [Root CONTRIBUTING.md > Frontend Development Patterns](../../CONTRIBUTING.md#frontend-development-patterns).

## Table of Contents

1. [App Overview](#app-overview)
2. [Tech Stack](#tech-stack)
3. [Directory Structure](#directory-structure)
4. [Routes](#routes)
5. [Development Workflow](#development-workflow)
6. [Quick Reference](#quick-reference)

---

## App Overview

**Purpose**: User-facing account management portal for Monobase Application Platform

**Current Features**:
- User authentication (Better-Auth with cookie sessions)
- Protected dashboard routes
- Push notifications (OneSignal integration)
- Responsive UI (shadcn/ui + Tailwind CSS)

**API Integration**: Uses `@monobase/sdk-ts` package for type-safe backend communication

**Port**: 3002 (development)

---

## Tech Stack

- **Framework**: TanStack Router (type-safe file-based routing)
- **Runtime**: Bun 1.2.21+
- **State**: TanStack Query v5, React Hook Form
- **UI**: shadcn/ui + Tailwind CSS + Radix UI
- **Auth**: Better-Auth (cookie-based sessions)
- **SDK**: `@monobase/sdk-ts` (type-safe API client)

**For detailed patterns and conventions**, see [Root CONTRIBUTING.md > Frontend Development Patterns](../../CONTRIBUTING.md#frontend-development-patterns).

---

## Directory Structure

```
src/
├── components/               # React components
│   ├── app-sidebar.tsx      # Dashboard sidebar navigation
│   ├── logo.tsx             # App logo component
│   ├── loading.tsx          # Loading state component
│   └── not-found.tsx        # 404 component
│
├── hooks/                    # Custom React hooks
│   └── use-onesignal.ts     # OneSignal push notifications hook
│
├── routes/                   # File-based routing (TanStack Router)
│   ├── __root.tsx           # Root layout with providers
│   ├── index.tsx            # Landing page
│   ├── auth/                # Auth pages
│   │   └── $authView.tsx    # Dynamic auth view (sign-in, sign-up, etc.)
│   ├── _dashboard/          # Protected routes (layout)
│   │   ├── _dashboard.tsx   # Dashboard layout
│   │   ├── dashboard.tsx    # Dashboard home
│   │   ├── notifications.tsx # Notifications view
│   │   └── settings/
│   │       ├── account.tsx  # Account settings
│   │       └── security.tsx # Security settings
│   ├── onboarding.tsx       # Onboarding flow
│   └── verify-email.tsx     # Email verification
│
├── services/                 # Business logic
│   └── onesignal.ts         # OneSignal service initialization
│
├── styles/                   # Global styles
│   └── globals.css          # Tailwind + custom styles
│
└── utils/                    # Utilities
    ├── config.ts            # App configuration (env vars)
    └── guards.ts            # Route guards (auth checks)
```

---

## Routes

### Public Routes

Routes accessible without authentication:

- `/` - Landing page
- `/auth/$authView` - Dynamic auth views
  - `/auth/sign-in` - Sign in page
  - `/auth/sign-up` - Sign up page
  - `/auth/forgot-password` - Password reset request
  - `/auth/reset-password` - Password reset confirmation
- `/verify-email` - Email verification page

### Protected Routes (Layout: `_dashboard`)

All dashboard routes require authentication and use the `_dashboard` layout.

**Dashboard**:
- `/dashboard` - Dashboard home

**Notifications**:
- `/dashboard/notifications` - Notification center

**Settings**:
- `/dashboard/settings/account` - Account settings
- `/dashboard/settings/security` - Security settings (password, 2FA)

### Special Routes

- `/onboarding` - Onboarding flow (requires auth without profile)
  - Uses `requireAuthWithoutProfile()` guard
  - Redirects to dashboard if profile exists

### Route Guards

Route guards are defined in `src/utils/guards.ts`:

- **`requireAuth()`** - Basic authentication check
- **`requireAuthWithProfile()`** - Requires auth + profile completion
- **`requireAuthWithoutProfile()`** - Requires auth but NO profile (onboarding)
- **`requireGuest()`** - Requires NO authentication (landing page)

**Guard Usage**:
```typescript
// In route file
import { requireAuthWithProfile } from '@/utils/guards'

export const Route = createFileRoute('/_dashboard/dashboard')({
  beforeLoad: requireAuthWithProfile,
  // ... component
})
```

**For complete guard patterns**, see [Root CONTRIBUTING.md > Routing](../../CONTRIBUTING.md#routing-tanstack-router).

---

## Development Workflow

### Starting Development

```bash
cd apps/account
bun dev              # Start dev server on port 3002
```

### Type Checking

```bash
bun run typecheck    # Run TypeScript checks
```

### Building

```bash
bun run build        # Build for production
bun run preview      # Preview production build
```

### Testing

```bash
bun run test:e2e        # Run E2E tests (Playwright)
bun run test:e2e:ui     # Open Playwright UI
bun run test:e2e:debug  # Debug tests
```

---

## API Integration

This app uses the `@monobase/sdk-ts` package for API communication.

### Using the SDK

```typescript
import { createClient } from '@monobase/sdk-ts'

// Create client instance
const client = createClient({
  baseURL: import.meta.env.VITE_API_URL
})

// Make type-safe API calls
const person = await client.persons.getPerson(personId)
const notifications = await client.notifs.listNotifications()
```

### Type Safety

All API types are automatically generated from the OpenAPI specification:
- Request/response types are inferred
- Parameters are type-checked
- Validation errors are caught at compile time

**For API integration patterns**, see [Root CONTRIBUTING.md > API Integration](../../CONTRIBUTING.md#api-integration).

---

## Adding shadcn/ui Components

shadcn components live inside this app at `apps/account/src/components/`:

```bash
cd apps/account
bunx shadcn@latest add [component-name]
```

Components are imported via the `@/components/*` path alias. Each app owns
its own copy — there is no shared UI package.

**For component patterns**, see [Root CONTRIBUTING.md > Component Patterns](../../CONTRIBUTING.md#component-patterns).

---

## Quick Reference

### Development Commands

```bash
cd apps/account

# Development
bun install          # Install dependencies
bun dev             # Start dev server (port 3002)
bun run build       # Build for production
bun run typecheck   # TypeScript checking

# Testing
bun run test:e2e        # E2E tests (Playwright)
bun run test:e2e:ui     # Playwright UI
bun run test:e2e:debug  # Debug tests
```

### Environment Variables

Required env vars in `.env`:

```bash
VITE_API_URL=http://localhost:7213        # API service URL
VITE_ONESIGNAL_APP_ID=your-app-id         # OneSignal app ID
VITE_ONESIGNAL_APP_TAG=account            # OneSignal app tag
```

### Path Aliases

```typescript
// ✅ Good - Use path aliases
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { config } from '@/utils/config'

// ❌ Bad - Relative paths
import { Button } from '../../../components/ui/button'
```

### Common Patterns

**Protected Route**:
```typescript
import { createFileRoute } from '@tanstack/react-router'
import { requireAuthWithProfile } from '@/utils/guards'

export const Route = createFileRoute('/_dashboard/settings/account')({
  beforeLoad: requireAuthWithProfile,
  component: AccountSettings,
})

function AccountSettings() {
  // Implementation
}
```

**Loading States**:
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['resource', id],
  queryFn: () => client.resource.get(id)
})

if (isLoading) return <LoadingSpinner />
if (error) return <ErrorAlert error={error} />
if (!data) return <EmptyState />
return <Content data={data} />
```

---

## Complete Development Patterns

For complete details on:
- Module architecture and file patterns
- API integration with SDK
- Form patterns and validation
- Component patterns (shadcn/ui)
- Query hooks with TanStack Query
- Type safety rules and conventions
- Error handling patterns

**See**: [Root CONTRIBUTING.md > Frontend Development Patterns](../../CONTRIBUTING.md#frontend-development-patterns)

---

## Useful Resources

- **TanStack Router Docs**: https://tanstack.com/router
- **TanStack Query Docs**: https://tanstack.com/query
- **shadcn/ui Docs**: https://ui.shadcn.com
- **Better-Auth Docs**: https://better-auth.com
- **OpenAPI Spec**: `../../specs/api/dist/openapi/openapi.json`
