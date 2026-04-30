---
name: typespec
description: Author TypeSpec API definitions and run the full code generation pipeline (OpenAPI + types + routes + validators + handler stubs). Use when creating new API endpoints or modifying existing ones.
---

# typespec

Create or update TypeSpec definitions and run code generation.

## Triggers

- Creating a new API module or endpoints
- Modifying existing API contracts
- After `/prd` produces a plan that includes new endpoints

## Workflow

### 1. Study Existing Patterns

Before writing any TypeSpec, read these reference files:
- `specs/api/src/modules/person.tsp` — full module example
- `specs/api/src/common/models.tsp` — shared models (BaseEntity, Address, etc.)
- `specs/api/src/common/errors.tsp` — error responses
- `specs/api/src/common/pagination.tsp` — pagination patterns
- `specs/api/src/common/security.tsp` — auth decorators

### 2. Write TypeSpec Definition

Create or edit `specs/api/src/modules/{module}.tsp`:

```typespec
import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "../common/models.tsp";
import "../common/errors.tsp";
import "../common/pagination.tsp";
import "../common/security.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

// Models extend BaseEntity for id + timestamps
model MyEntity extends BaseEntity {
  @doc("Field description")
  @minLength(1)
  @maxLength(100)
  fieldName: string;

  @doc("Optional field")
  optionalField?: string;
}

// Create/Update request models (no BaseEntity)
model CreateMyEntityRequest {
  fieldName: string;
  optionalField?: string;
}

// Operations interface
@route("/my-entities")
interface MyEntityOperations {
  @get
  @summary("List entities")
  listMyEntities(): MyEntity[];

  @post
  @summary("Create entity")
  createMyEntity(@body body: CreateMyEntityRequest): MyEntity;

  @get
  @route("/{id}")
  @summary("Get entity by ID")
  getMyEntity(@path id: string): MyEntity;
}
```

Conventions:
- Validation decorators: `@minLength`, `@maxLength`, `@pattern`, `@minValue`, `@maxValue`
- Country codes: `@pattern("^[A-Z]{2}$")`
- Language codes: `@pattern("^[a-z]{2}$")`
- Timezones: `@pattern("^[A-Za-z_]+\/[A-Za-z_]+$")`
- Use `@doc()` on all fields

### 3. Build OpenAPI + Types

```bash
cd specs/api && bun run build
```

This generates:
- `dist/openapi/openapi.json` — OpenAPI 3.0 spec
- `dist/typescript-types/api.d.ts` — TypeScript type definitions

If errors: check imports, namespace references, circular dependencies.

### 4. Generate API Code

```bash
cd services/api-ts && bun run generate
```

This generates:
- `src/generated/openapi/types.ts` — type re-exports
- `src/generated/openapi/validators.ts` — Zod schemas
- `src/generated/openapi/routes.ts` — Hono routes with validation
- `src/generated/openapi/registry.ts` — handler registry
- `src/handlers/{module}/{operationId}.ts` — handler stubs (only if file doesn't exist)

### 5. Verify

- No compilation errors from either command
- Handler stubs created in `services/api-ts/src/handlers/{module}/`
- Check generated OpenAPI: `cat specs/api/dist/openapi/openapi.json | jq '.paths'`

## Troubleshooting

- **Missing imports**: Add `import "@typespec/http"` etc. at top of file
- **Type not found**: Check namespace imports and common model imports
- **Routes not updating**: Run both `bun run build` (specs) AND `bun run generate` (api)
- **Handler not found error**: Handler filename must match the `operationId` in TypeSpec

## Critical Rules

- NEVER edit files in `services/api-ts/src/generated/` — they are regenerated every time
- Handler stubs are only created if the file doesn't already exist
- Always build specs before generating API code
