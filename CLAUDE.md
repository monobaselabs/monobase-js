# CLAUDE.md

This file provides AI-specific guidance for Claude Code when working with the Monobase Application Platform.

## Documentation Map

For detailed information, refer to:
- **[README.md](./README.md)** - Project overview, installation, commands, technology stack
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Development workflows, coding standards, testing guidelines
- **[specs/api/CONTRACT.md](./specs/api/CONTRACT.md)** - Wire-level API contract every implementation must satisfy
- **[specs/api/IMPLEMENTING.md](./specs/api/IMPLEMENTING.md)** - Playbook for adding a new server impl or client SDK in any language

## Repository Overview

**Monobase Application Platform** — a vertical-neutral monorepo template for SaaS products. Provides identity, billing, scheduling, communications, storage, and notifications as composable primitives. Built on Bun for ~3× faster execution than Node.js.

**Key Technologies**: Bun, PostgreSQL, Drizzle ORM, Hono API, TypeSpec, TanStack Router, Better-Auth, OneSignal, S3/MinIO

**Spec-first, polyglot-ready monorepo.** The OpenAPI document at
`specs/api/dist/openapi/openapi.json` is the single source of truth.
Every server implementation and every client SDK is generated from it,
and any language can have its own (`-ts`, `-rs`, `-go`, …) sibling
workspace.

**Monorepo Structure**:
- `apps/` - Frontend applications:
  - `account/` - Vite + TanStack Router reference app (auth, profile, settings)
- `services/api-ts/` - Reference TypeScript API impl (Hono + Drizzle)
  - `services/api-rs/`, `services/api-go/` etc. would be siblings; documented in `specs/api/IMPLEMENTING.md` but not yet present
- `specs/api/` - TypeSpec API definitions; compiled to OpenAPI + TypeScript types. Also home of the contract docs and Hurl contract tests under `tests/contract/`
- `packages/` - Shared packages:
  - `eslint-config/` - Shared ESLint flat configs (`base`, `react`, `next`)
  - `sdk-ts/` - Reference TypeScript client SDK (generated from OpenAPI via `@hey-api/openapi-ts`)
  - `typescript-config/` - Shared TypeScript configs
- `scripts/run-contract-tests.ts` - Runs the Hurl contract suite against `$API_URL`
- `.github/workflows/contract.yml` - CI: boots the impl, runs Hurl + Schemathesis

## Business Domain Modules

The API service ships nine vertical-neutral handler modules. Build your product
on top of these — add a `patient`, `tenant`, `student`, `merchant`, etc. module
under `services/api-ts/src/handlers/` for each domain you need.

1. **person** - User profile management and central PII safeguard
2. **booking** - Generic time-based scheduling (hosts, slots, bookings, events)
3. **billing** - Invoice-based payments via Stripe Connect
4. **audit** - Compliance logging (Pino structured logging)
5. **notifs** - Multi-channel notifications (email, push via OneSignal)
6. **comms** - Real-time chat rooms with embedded video calls (WebRTC)
7. **storage** - File upload/download (S3/MinIO)
8. **email** - Transactional emails (SMTP/Postmark)
9. **reviews** - NPS review system

All nine have matching TypeSpec definitions under `specs/api/src/modules/`.

**Note**: Authentication is handled by Better-Auth (integrated, not a separate module). Consent management is implemented as JSONB fields on the Person model (not a standalone module).

## Key Architectural Patterns

### Person-Centric Design
The Person module is the central PII safeguard for user data.

### Consent Management
Consent is embedded in the Person model as JSONB fields rather than a standalone module:
```typescript
{
  granted: boolean,
  granted_at: timestamp,
  ip_address: string,
  updated_at: timestamp,
  updated_by: string
}
```

Consent types on Person:
- **marketing_consent**: Marketing communications
- **data_sharing_consent**: Data sharing preferences
- **sms_consent**: SMS notifications
- **email_consent**: Email communications

### API-First Development
Always follow this workflow:
1. Define APIs in TypeSpec (`specs/api/src/modules/`)
2. Generate OpenAPI + TypeScript types (`cd specs/api && bun run build`)
3. Generate routes/validators/handlers (`cd services/api-ts && bun run generate`)
4. Implement handler business logic (`services/api-ts/src/handlers/`)
5. Use generated types from `@monobase/api-spec` in frontends

**Why**: Type safety across frontend/backend, single source of truth, auto-generated docs

**⚠️ CRITICAL - Never Edit Generated Files**:
- `services/api-ts/src/generated/openapi/*` - Routes, validators, registry (regenerated every time)
- `services/api-ts/src/generated/better-auth/*` - Auth schema and specs
- `services/api-ts/src/generated/migrations/*` - Database migrations

**✅ Only Edit**:
- TypeSpec files (`specs/api/src/modules/*.tsp`)
- Handler implementations (`services/api-ts/src/handlers/{module}/*.ts`)
- Database schemas (`services/api-ts/src/handlers/{module}/repos/*.schema.ts`)

See [CONTRIBUTING.md#code-generation](./CONTRIBUTING.md#code-generation---do-not-edit) for complete details.

### Configuration Approach
Environment variables are parsed into typed configuration objects (see `services/api-ts/src/core/config.ts`). Not file-based configuration.

### OneSignal Multi-App Architecture
OneSignal follows an **app-agnostic pattern** like other services (Storage, Email, Billing):

**Single App ID Approach**:
- Use the **same** `ONESIGNAL_APP_ID` across all frontends
- Frontend apps: Set `VITE_ONESIGNAL_APP_ID` to the same value
- Backend API: Uses same app ID to send notifications

**Optional App Tagging**:
- Set `VITE_ONESIGNAL_APP_TAG=web` (or `mobile`, etc.) in frontend `.env` (optional)
- Apps auto-tag themselves on initialization
- Most notifications ignore tags (app-agnostic)
- Use `targetApp` parameter only for app-specific announcements

**Why This Works**:
- OneSignal uses `external_id` (person ID) to target users across devices/apps
- Users with multiple roles receive notifications in whichever app they're using

**API Pattern**:
```typescript
// Send to user (app-agnostic - default)
notificationRepo.createNotificationForModule({
  recipient: personId,
  type: 'booking.confirmed',
  channel: 'push',
  // No targetApp - reaches user in any app
});

// Send only to a specific app (rare)
notificationRepo.createNotificationForModule({
  recipient: personId,
  type: 'system',
  channel: 'push',
  targetApp: 'web', // Only if VITE_ONESIGNAL_APP_TAG is configured
});
```

### Module Structure Pattern
Backend handlers follow: **Router → Validators → Service → Handlers**

Each handler directory contains:
- Handler files (CRUD operations)
- `repos/` - Database repositories + schema
- `jobs/` - Background job definitions
- `utils/` - Module-specific utilities

## Compliance Considerations

When working with regulated data:

### Data Privacy
- **Audit Trails**: All user data access is logged with Pino
- **Consent Validation**: Check JSONB consent fields before processing
- **Role-Based Access**: Verify user roles via Better-Auth
- **Correlation IDs**: Include in all log entries for traceability

### Data Security
- Use Drizzle ORM for type-safe, SQL-injection-proof queries
- Validate all inputs with Zod schemas
- Never log sensitive personal information (PII) in plain text
- Follow secure patterns in existing handlers

## OpenAPI Specification

The canonical API reference is at: `specs/api/dist/openapi/openapi.json`

**Before implementing frontend features**:
1. Check the OpenAPI spec for endpoint definitions
2. Import TypeScript types from `@monobase/api-spec/types`
3. Validate your implementation matches the schema

**Helpful commands**: See [README.md#api-schema-reference](./README.md#api-schema-reference)

## Database Patterns

### Drizzle ORM Usage
- Use prepared statements for performance
- Leverage type inference from schema definitions
- Use transactions for multi-table operations
- Reference existing patterns in `services/api-ts/src/handlers/*/repos/`

### Migration Workflow
1. Modify schema in `services/api-ts/src/handlers/{module}/repos/*.schema.ts`
2. Generate migration: `cd services/api-ts && bun run db:generate`
3. Review generated SQL in `src/generated/migrations/`
4. Migrations run automatically on server start

**Details**: See [CONTRIBUTING.md#database-workflow](./CONTRIBUTING.md#database-workflow)

## Frontend Development

### Account App (Vite + TanStack Router)
- **Port**: 3002
- **Routing**: File-based in `src/routes/`
- **Auth**: Better-Auth with TanStack integration
- **Data Fetching**: TanStack Query
- **UI Components**: Radix UI primitives via `@/components` (shadcn/ui patterns)

To scaffold a new app, copy `apps/account/` and update `package.json` name + `vite.config.ts` port.

**Standards**: See [CONTRIBUTING.md#coding-standards](./CONTRIBUTING.md#coding-standards)

## Testing Approach

- **API**: Bun test framework (`cd services/api-ts && bun test`)
- **Frontend**: Playwright E2E tests (`cd apps/account && bun run test:e2e`)
- **Type Safety**: TypeScript checking across all workspaces

**Details**: See [CONTRIBUTING.md#testing-requirements](./CONTRIBUTING.md#testing-requirements)

## Common Commands Quick Reference

**Full command reference**: See [README.md#available-commands](./README.md#available-commands)

Essential commands:
```bash
# Install dependencies
bun install

# API-first workflow
cd specs/api && bun run build              # Generate OpenAPI + types
cd ../../services/api-ts && bun run generate  # Generate routes/validators

# Start development
cd services/api-ts && bun dev        # API on port 7213
cd apps/account && bun dev        # Account app on port 3002

# Database
cd services/api-ts && bun run db:generate  # Generate migration
cd services/api-ts && bun run db:studio    # Open Drizzle Studio

# Testing
cd services/api-ts && bun test             # API tests
cd apps/account && bun run test:e2e     # E2E tests
```

## Important Notes

### What Exists
- ✅ **apps/account** - Reference Vite + TanStack Router app
- ✅ **apps/account/src/components/** - Shared UI component library
- ✅ **packages/sdk-ts/** - Type-safe API client + TanStack Query hooks
- ✅ **packages/eslint-config/** - Shared ESLint flat configs
- ✅ **Authentication** via Better-Auth (integrated, not a separate module)
- ✅ **Consent** as JSONB fields on Person model (not a separate module)
- ✅ **9 API handler modules** (person, booking, billing, audit, notifs, comms, storage, email, reviews)

### What's Intentionally Absent
- This template ships **no domain-vertical apps or modules**. Add your own
  (e.g., `apps/admin`, `services/api-ts/src/handlers/tenant/`) on top of the base.

## When in Doubt

1. Check [README.md](./README.md) for commands and setup
2. Check [CONTRIBUTING.md](./CONTRIBUTING.md) for development patterns
3. Reference existing handlers in `services/api-ts/src/handlers/` for implementation patterns
4. Check OpenAPI spec at `specs/api/dist/openapi/openapi.json` for API contracts
