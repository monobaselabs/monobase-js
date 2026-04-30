---
name: prd
description: Analyze a PRD (Product Requirements Document) and produce a structured technical implementation plan mapped to the Monobase monorepo patterns. Use when given a PRD file, pasted requirements, or feature description that needs to be broken down into implementation tasks.
---

# prd

Analyze a PRD and produce an actionable implementation plan for the Monobase monorepo.

## Triggers

- User provides a PRD (file path, pasted text, or URL)
- User describes a new feature or app to build
- User asks to plan implementation of requirements

## Workflow

### 1. Read the PRD

- If file path: read the file
- If pasted text: parse inline
- If URL: fetch and parse

### 2. Extract Requirements

Identify and list:
- **Entities/Models**: data objects, their fields, relationships
- **Endpoints**: CRUD operations, custom actions, queries
- **User Flows**: step-by-step user interactions
- **Business Rules**: validation, authorization, constraints
- **Integration Points**: external services (Stripe, S3, OneSignal, etc.)

### 3. Map to Repo Patterns

Reference existing modules in `services/api-ts/src/handlers/` to understand what already exists. For each requirement:

- **New module?** → needs TypeSpec + DB schema + handlers + frontend
- **Extends existing module?** → identify which files to modify
- **Uses existing infrastructure?** → map to existing services (storage, email, notifs, billing)

Key architectural patterns to apply:
- **Person-centric design**: all PII goes through the Person model
- **Consent fields**: JSONB consent on sensitive data (`{ granted, granted_at, ip_address, updated_at, updated_by }`)
- **Module structure**: handler files + `repos/` + `utils/` per module
- **API-first**: TypeSpec definition before any implementation

### 4. Output Structured Plan

```
## Modules
- [module-name]: new | modified
  - Entities: [list]
  - Endpoints: [list with HTTP method + path]

## Implementation Order
1. TypeSpec definitions (specs/api/src/modules/{module}.tsp)
2. Database schema (services/api-ts/src/core/database.schema.ts)
3. Handler implementations (services/api-ts/src/handlers/{module}/)
4. Frontend module (apps/{app}/src/)
5. Tests

## DB Schema Changes
- Table: [name]
  - Fields: [field: type, ...]
  - Indexes: [...]
  - Foreign keys: [...]
  - Consent fields: [if applicable]

## Frontend Routes
- /path → component → hook → API function

## Decisions Needed
- [question requiring human input]
```

### 5. Flag Unknowns

Always surface:
- Ambiguous requirements that could go multiple ways
- Missing details (auth rules, validation constraints, error handling)
- Scope questions (MVP vs full feature)
- Third-party service configuration needed
