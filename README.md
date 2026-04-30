# Monobase Application Platform

A vertical-neutral monorepo template for SaaS products. Ships identity,
billing, scheduling, communications, storage, and notification primitives
that any product domain can compose into its own workflows. Built on Bun for
~3× faster execution than Node.js.

## Overview

Monobase gives you a production-shaped starting point — not a finished app.
Out of the box you get:

- **Account app** - reference Vite + TanStack Router app with auth, profile,
  and settings flows; ships its own Radix-based component library inline
  under `apps/account/src/components`
- **API service** - Hono + Drizzle backend with nine vertical-neutral modules
- **Shared SDK** - typed API client with TanStack Query hooks
- **TypeSpec spec** - the source of truth for the API; OpenAPI and TS types
  are generated from it

Add your domain modules (e.g. `services/api-ts/src/handlers/tenant/`) and your
product apps (e.g. `apps/admin/`) on top of this base.

## Key Features

- **Real-time chat + video** - chat rooms with embedded WebRTC video calls
- **Identity** - Better-Auth integrated; person model is the PII safeguard
- **Compliance-friendly** - audit trails, JSONB consent fields, structured logs
- **Multi-channel notifications** - email and push (OneSignal)
- **File storage** - S3/MinIO with presigned URLs

## Spec-first, polyglot-ready

The OpenAPI document at `specs/api/dist/openapi/openapi.json` is the
single source of truth. Every server implementation and every client SDK
is generated from it. The TypeScript stack in this repo (`services/api-ts`,
`packages/sdk-ts`, `apps/account`) is the reference; any language can ship
its own sibling workspace and stay interchangeable behind the same
`$API_URL`. See [`specs/api/CONTRACT.md`](./specs/api/CONTRACT.md) for the
wire contract and [`specs/api/IMPLEMENTING.md`](./specs/api/IMPLEMENTING.md)
for the playbook to add a new impl/SDK in any language.

## Monorepo Structure

```
monobase/
├── apps/                      # Frontend applications
│   └── account/              # Reference app (Vite + TanStack Router)
├── packages/                  # Shared libraries
│   ├── eslint-config/        # Shared ESLint flat configs (base, react, next)
│   ├── sdk-ts/               # Reference TypeScript SDK (generated from OpenAPI)
│   └── typescript-config/    # Shared TypeScript configurations
├── services/                  # Backend services (per-language)
│   └── api-ts/               # Reference TypeScript impl (Hono + Bun)
├── specs/                     # API contract
│   └── api/                  # TypeSpec source + CONTRACT.md + IMPLEMENTING.md + tests/
├── scripts/                   # Repo-level scripts (contract test runner, etc.)
├── .github/workflows/         # CI (contract.yml runs Hurl + Schemathesis)
├── CLAUDE.md                 # AI assistant project guide
└── package.json              # Monorepo workspace configuration
```

Future Rust / Go / Python impls would live alongside `api-ts` (e.g.
`services/api-rs`) and the matching SDK alongside `sdk-ts`. They're
documented in `specs/api/IMPLEMENTING.md` but not yet scaffolded.

## Prerequisites

- **Bun** >= 1.2.21 ([installation guide](https://bun.sh))
- **PostgreSQL** >= 14
- **Node.js** >= 18 (for some tooling compatibility)
- **Git** for version control

### Optional Services
- **AWS S3** or **MinIO** for file storage
- **SMTP** server or **Postmark** for email delivery
- **OneSignal** for push notifications

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd monobase
bun install
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb monobase

# Generate database schema
cd services/api-ts
bun run db:generate
```

### 3. Configure Environment

Create `.env` files in each service/app directory (see individual READMEs for required variables):

```bash
# services/api-ts/.env
DATABASE_URL=postgresql://user:password@localhost:5432/monobase
PORT=7213
AUTH_SECRET=your-secret-key-here
```

### 4. Start Development Servers

```bash
# Terminal 1 - API Service
cd services/api-ts
bun dev

# Terminal 2 - Account App
cd apps/account
bun dev
```

## Development Workflow

### API-First Development

1. **Define API** - Create/modify TypeSpec definitions in `specs/api/src/modules/`
2. **Generate** - Run `cd specs/api && bun run build`
3. **Implement** - Build Hono handlers in `services/api-ts/src/handlers/`
4. **Test** - Write tests and run `cd services/api-ts && bun test`
5. **Integrate** - Use generated TypeScript types in frontend apps

### Working with the Monorepo

```bash
# Install dependencies across all workspaces
bun install

# Build all packages
bun run --filter '*' build

# Clean build artifacts
bun run clean

# Run specific workspace command
cd apps/account && bun dev
```

## Available Commands

### Root Level

```bash
bun install                    # Install all workspace dependencies
bun run --filter '*' build    # Build all packages
bun run clean                  # Clean build artifacts
```

### API Service (`services/api-ts/`)

```bash
bun dev                        # Start development server (port 7213)
bun run build                  # Build production bundle
bun run generate               # Generate routes, validators, handlers from OpenAPI
bun test                       # Run test suite
bun run typecheck              # TypeScript type checking
bun run db:generate            # Generate Drizzle migrations
bun run db:studio              # Open Drizzle Studio
```

**⚠️ Code Generation**: The API service auto-generates routes, validators, and handler stubs from TypeSpec. See [CONTRIBUTING.md#code-generation](./CONTRIBUTING.md#code-generation---do-not-edit) for what files to never edit manually.

### API Specifications (`specs/api/`)

```bash
bun run build                  # Generate both OpenAPI and types
bun run build:openapi          # Generate OpenAPI specs only
bun run build:types            # Generate TypeScript types only
```

### Account App (`apps/account/`)

```bash
bun dev                        # Start dev server (port 3002)
bun run build                  # Build production bundle
bun run typecheck              # TypeScript type checking
bun run test:e2e               # Run Playwright E2E tests
```

## Applications

### Frontend Applications

| App | Stack | Port | Purpose |
|-----|-------|------|---------|
| `apps/account` | Vite + TanStack Router | 3002 | Reference app: auth + profile + settings |

The account app keeps its own components, hooks, and feature directories
under `apps/account/src/`. To scaffold a new app, copy `apps/account/` and
update `package.json` name and `vite.config.ts` port — each app owns its
UI; nothing is shared between apps except the SDK.

**Development**: `cd apps/<name> && bun dev`

## API Service

### Modules

The API service ships nine vertical-neutral handler modules. Build product
domains (e.g. `tenant`, `merchant`, `student`) as new modules under
`services/api-ts/src/handlers/` plus matching `specs/api/src/modules/*.tsp`.

1. **Person** - User profile management and PII safeguard
2. **Booking** - Generic time-based scheduling (hosts, slots, bookings, events)
3. **Billing** - Invoice-based payments via Stripe Connect
4. **Audit** - Compliance logging and activity tracking
5. **Comms** - Real-time chat rooms with embedded video calls (WebRTC)
6. **Notifs** - Multi-channel notifications (email, push via OneSignal)
7. **Storage** - File upload/download (S3/MinIO)
8. **Email** - Transactional email delivery
9. **Reviews** - NPS review system

**Authentication** is handled by Better-Auth (integrated, not a separate module).

### Key Architectural Patterns

**Person-Centric Design**: The Person module serves as the central PII safeguard for user data.

**Consent Management**: Consent is managed via JSONB fields on the Person model:
- marketing_consent: Marketing communications
- data_sharing_consent: Data sharing preferences
- sms_consent: SMS notifications
- email_consent: Email communications

### API Documentation

- **OpenAPI Spec**: `specs/api/dist/openapi/openapi.json`
- **TypeScript Types**: Generated to `@monobase/api-spec` package
- **Interactive Docs**: Scalar UI available at `/docs` endpoint

## Technology Stack

### Runtime & Build
- **Bun** 1.2.21+ - Fast JavaScript runtime and package manager
- **TypeScript** 5.9.2 - Type-safe development
- **ESM** - Modern module system

### Frontend
- **React** 19 - UI library
- **TanStack Router** - Type-safe routing
- **Radix UI** - Accessible component primitives
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Component library
- **React Hook Form** + **Zod** - Form validation

### Backend
- **Hono** - Fast web framework
- **Drizzle ORM** - Type-safe database queries
- **PostgreSQL** - Primary database
- **Better-Auth** - Authentication (no external service)
- **Pino** - Structured JSON logging
- **Zod** - Runtime validation

### API & Types
- **TypeSpec** - API-first specification language
- **OpenAPI** - REST API documentation
- **Type Generation** - Automatic TypeScript types from specs

### Infrastructure
- **AWS S3** / **MinIO** - Object storage
- **Postmark** / **SMTP** - Email delivery
- **OneSignal** - Push notifications

## Testing

### Contract tests (any implementation)

Black-box HTTP scenarios that target the OpenAPI contract, not any
specific impl. Same suite runs against the TS impl today and a Rust impl
tomorrow.

```bash
# Boot the impl in one terminal
cd services/api-ts && bun dev

# Run Hurl scenarios in another
bun run test:contract              # required check
bun run test:contract:fuzz         # Schemathesis fuzz; shadow check
```

Hurl files live under `specs/api/tests/contract/`. CI runs both layers
on every PR (`.github/workflows/contract.yml`).

### Unit & Integration Tests (TypeScript impl)
```bash
cd services/api-ts
bun test
```

### End-to-End Tests (account app)
```bash
cd apps/account
bun run test:e2e
```

### Type Checking
```bash
bun --filter '*' typecheck
```

## Documentation

- **CLAUDE.md** - Comprehensive project guide for AI assistants and developers
- **CONTRIBUTING.md** - Developer contribution guidelines

## Compliance Toolkit

- **Audit Trails** - All data access includes structured audit logging
- **Consent** - JSONB consent fields on the Person model for granular tracking
- **Security** - role-based access via Better-Auth, server-side input validation
- **Data Integrity** - ACID-compliant PostgreSQL transactions

## Performance

- **3x Faster Startup** - Bun vs Node.js
- **Native TypeScript** - No transpilation overhead
- **Connection Pooling** - Optimized database queries
- **JSONB Indexing** - Fast consent and config queries

## License

[Add your license here - e.g., MIT, Apache 2.0, Proprietary]

---

For detailed development guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).  
For AI assistant integration, see [CLAUDE.md](./CLAUDE.md).
