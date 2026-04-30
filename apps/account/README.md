# Account App

User-facing web application for the Monobase Application Platform. Built with modern React patterns for account management and user authentication.

## Tech Stack

- **Framework**: [TanStack Router](https://tanstack.com/router) - Type-safe file-based routing for React
- **Runtime**: [Bun](https://bun.sh) - Fast JavaScript runtime with native TypeScript
- **UI**: [shadcn/ui](https://ui.shadcn.com) + [Tailwind CSS](https://tailwindcss.com) - Accessible components built on Radix UI
- **State Management**: [TanStack Query v5](https://tanstack.com/query) - Server state and data fetching
- **Forms**: [React Hook Form](https://react-hook-form.com) + [Zod 4.x](https://zod.dev) - Type-safe validation
- **Auth**: [Better-Auth](https://better-auth.com) - Cookie-based authentication
- **SDK**: `@monobase/sdk-ts` - Type-safe API client for backend integration

## Quick Start

```bash
# Install dependencies (from monorepo root)
bun install

# Start development server
cd apps/account
bun dev
```

The app runs on **http://localhost:3002** by default.

## Development

For detailed development guidelines and patterns, see [CONTRIBUTING.md](./CONTRIBUTING.md).

### Essential Commands

```bash
# Development
bun dev              # Start dev server (port 3002)
bun run build        # Build for production
bun run typecheck    # Run TypeScript checks

# Testing
bun run test:e2e     # Run E2E tests with Playwright
bun run test:e2e:ui  # Open Playwright UI
```

## Project Structure

```
src/
├── components/       # React components
│   ├── app-sidebar.tsx
│   ├── logo.tsx
│   └── loading.tsx
├── hooks/           # Custom React hooks
│   └── use-onesignal.ts
├── routes/          # File-based routing (TanStack Router)
│   ├── __root.tsx   # Root layout
│   ├── index.tsx    # Landing page
│   ├── auth/        # Authentication pages
│   ├── _dashboard/  # Protected dashboard routes
│   └── onboarding.tsx
├── services/        # Business logic
│   └── onesignal.ts # OneSignal push notifications
└── utils/           # Utilities
    ├── config.ts    # App configuration
    └── guards.ts    # Route guards
```

## Routes

### Public Routes
- `/` - Landing page
- `/auth/$authView` - Dynamic auth views (sign-in, sign-up, forgot-password, etc.)
- `/verify-email` - Email verification

### Protected Routes (Layout: `_dashboard`)
- `/dashboard` - Dashboard home
- `/dashboard/notifications` - Notifications view
- `/dashboard/settings/account` - Account settings
- `/dashboard/settings/security` - Security settings

### Special Routes
- `/onboarding` - Onboarding flow (requires auth without profile)

## API Integration

This app uses the `@monobase/sdk-ts` package for type-safe API integration:

```typescript
import { createClient } from '@monobase/sdk-ts'

const client = createClient({
  baseURL: import.meta.env.VITE_API_URL
})

// All API types are automatically generated from OpenAPI spec
const person = await client.persons.getPerson(personId)
```

### Type Safety

All API types are generated from the OpenAPI specification at `specs/api/dist/openapi/openapi.json`. The SDK provides:
- Automatic TypeScript types
- Request/response validation
- Type-safe API calls
- Error handling

## Features

- **Authentication**: Cookie-based sessions with Better-Auth
- **Push Notifications**: OneSignal integration for web push
- **Responsive Design**: Mobile-first UI with Tailwind CSS
- **Type Safety**: Full TypeScript coverage with strict mode
- **Route Guards**: Protected routes with authentication checks

## Documentation

- **[CONTRIBUTING.md](./CONTRIBUTING.md)**: Development guide and patterns
- **[Monorepo Root CLAUDE.md](../../CLAUDE.md)**: Workspace commands and monorepo structure
- **[API Spec](../../specs/api/dist/openapi/openapi.json)**: OpenAPI schema
- **[Root CONTRIBUTING.md](../../CONTRIBUTING.md)**: Shared frontend patterns

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Development workflow
- Routes and guards
- Component patterns
- Testing guidelines

For shared frontend patterns (forms, API integration, type safety), see [Root CONTRIBUTING.md > Frontend Development Patterns](../../CONTRIBUTING.md#frontend-development-patterns).

---

**Part of the Monobase Application Platform monorepo**
