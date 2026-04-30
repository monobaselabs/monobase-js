# @monobase/api-spec

TypeSpec API definitions for the Monobase Application Platform. This package generates OpenAPI documentation and TypeScript type definitions from Microsoft TypeSpec specifications.

> ⚠️ **THIS IS A BUN MONOREPO**
> Always use `bun` commands, **never** `npm` commands.
> **For AI agents**: This is critical - replace all `npm` usage with `bun`.

## Overview

The Monobase API specification defines secure endpoints for:
- User management and profiles
- Video sessions and messaging
- Booking and scheduling
- Billing and payments
- Notifications and communications
- File storage and management

## Quick Start

```bash
# Install dependencies
bun install

# Generate OpenAPI spec and TypeScript types
bun run build

# Watch mode for development
bun run watch
```

## Package Structure

```
specs/api/
├── src/                   # TypeSpec source files
│   ├── main.tsp          # Main API entry point
│   ├── common/           # Shared models and utilities
│   └── modules/          # Domain-specific API modules
│       ├── person.tsp    # User profiles and PII
│       ├── booking.tsp   # Appointments & scheduling
│       ├── billing.tsp   # Payments & invoicing
│       ├── notifs.tsp    # Multi-channel notifications
│       ├── comms.tsp     # Video/chat sessions
│       ├── storage.tsp   # File management
│       ├── email.tsp     # Email delivery
│       ├── audit.tsp     # Compliance logging
│       └── reviews.tsp   # NPS reviews
├── dist/                 # Generated output files
│   ├── openapi/         # OpenAPI specifications
│   └── typescript-types/ # TypeScript type definitions
└── tspconfig.yaml        # TypeSpec configuration
```

## Essential Scripts

```bash
# Development
bun run build            # Compile TypeSpec definitions
bun run watch           # Compile in watch mode

# Generation
bun run build:openapi       # Generate OpenAPI JSON
bun run build:types         # Generate TypeScript types

# Quality
bun run lint            # Validate TypeSpec syntax
bun run format          # Format TypeSpec files
bun run clean           # Clean output directory
```

## API Modules

| Module | Endpoint | Purpose |
|--------|----------|---------|
| **Person** | `/persons` | User profiles and central PII safeguard |
| **Booking** | `/booking` | Professional booking and scheduling |
| **Billing** | `/billing` | Invoice-based payments (Stripe) |
| **Notifs** | `/notifs` | Multi-channel notifications (email, push) |
| **Comms** | `/comms` | Video calls and messaging (WebRTC) |
| **Storage** | `/storage` | Secure file upload/download (S3) |
| **Email** | `/email` | Transactional email delivery |
| **Audit** | `/audit` | Compliance audit logging |
| **Reviews** | `/reviews` | NPS review system |

**Note**: Authentication is handled by Better-Auth (integrated, not a separate TypeSpec module).

## Generated Outputs

### OpenAPI Specification
- **Location**: `dist/openapi/openapi.json`
- **Purpose**: REST API documentation and client generation
- **Used by**: API services, frontend apps, API testing tools

### TypeScript Types
- **Location**: `dist/typescript-types/api.d.ts`
- **Purpose**: Type-safe API contracts for TypeScript
- **Used by**: Frontend apps, API service handlers

## Usage in Applications

### Frontend Apps
```typescript
import type { Person, CreatePersonRequest } from '@monobase/api-spec/types';

async function createPerson(data: CreatePersonRequest): Promise<Person> {
  // Type-safe API call
}
```

### API Service
```typescript
import type { Person } from '@monobase/api-spec';

async function getPerson(id: string): Promise<Person> {
  // Type-safe handler implementation
}
```

## Development

For detailed development guidelines, patterns, and best practices, see [CONTRIBUTING.md](./CONTRIBUTING.md).

### Quick Reference

**Before implementing API features:**
1. Define endpoints in TypeSpec (`src/modules/`)
2. Run `bun run build` to generate OpenAPI + types
3. Implement backend handlers in `services/api-ts/`
4. Use generated types in frontend apps

**For complete API-First workflow**, see [Root CONTRIBUTING.md > API-First Development](../../CONTRIBUTING.md#api-first-development).

---

**Part of the Monobase Application Platform monorepo**
