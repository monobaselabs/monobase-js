# Monobase API Contract

This document describes the wire-level contract that every implementation
of the Monobase API must satisfy. The canonical machine-readable contract
is `dist/openapi/openapi.json` (compiled from `src/main.tsp`); this
document explains the conventions, custom extensions, and operational
expectations that aren't obvious from the schema alone.

If a downstream codegen, SDK, or test runner is written against the
OpenAPI bundle, **this is the document it should also respect**.

---

## Implementations

There can be many. Each one ships in a sibling workspace and is
interchangeable behind the same `$API_URL`:

| Workspace             | Status      | Language      | Stack                |
|-----------------------|-------------|---------------|----------------------|
| `services/api-ts`     | Reference   | TypeScript    | Hono + Drizzle       |
| `services/api-rs`     | Future      | Rust          | (see below)          |
| `services/api-go`     | Future      | Go            | (see below)          |

A new implementation is "compliant" when:

1. It serves the routes declared in `dist/openapi/openapi.json`.
2. The request/response shapes match the schemas in that file.
3. It honours the custom extensions documented below.
4. The full Hurl test suite under `tests/contract/` passes.
5. `schemathesis run --base-url $API_URL dist/openapi/openapi.json` reports
   no critical issues.

---

## SDKs

Every supported client language ships its own SDK package in `packages/`.
Each SDK is **generated from the same `openapi.json`** via the language's
preferred codegen tool:

| Workspace             | Status      | Language      | Generator              |
|-----------------------|-------------|---------------|------------------------|
| `packages/sdk-ts`     | Reference   | TypeScript    | `@hey-api/openapi-ts`  |
| `packages/sdk-rs`     | Future      | Rust          | `progenitor`           |
| `packages/sdk-go`     | Future      | Go            | `oapi-codegen`         |

SDKs may layer hand-written value-add on top of the generated client
(retry policies, framework hooks, multi-step flows). The generated layer
must always live in a clearly-labelled `generated/` directory and be
rebuildable from the OpenAPI bundle alone.

---

## Conventions

### Resource paths

- Plural nouns, lowercase, kebab-case for multi-word: `/booking/events`,
  `/persons`, `/storage/files`.
- Nested by relationship, not by feature: `/booking/events/{event}/exceptions`,
  not `/booking-event-exceptions/{event}`.
- A `me` segment is reserved for the authenticated principal:
  `/booking/events/me`, `/persons/me`.

### HTTP semantics

- `POST /collection` creates and returns `201 Created` with the new
  resource as the body. The new id is in `body.id`.
- `GET /collection` returns a paginated envelope (see below).
- `GET /collection/{id}` returns the resource or `404`.
- `PATCH /collection/{id}` performs partial update; `null` clears a
  nullable field, omitted means "no change".
- `DELETE /collection/{id}` returns `204 No Content` on success.
- Idempotent reads (`GET`) and deletes (`DELETE`) must be safe to retry.

### Pagination envelope

All list endpoints return `PaginatedResponse<T>`:

```json
{
  "data": [ ... ],
  "pagination": {
    "totalCount": 42,
    "totalPages": 5,
    "currentPage": 1,
    "limit": 10,
    "offset": 0,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

Cursor-based variants exist for log-style streams (audit, notifications);
they replace `offset/totalPages` with `cursor/nextCursor`. The schema
declares which envelope each operation returns.

### Error envelope

Errors return a JSON body with at minimum `code` and `message`:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Field-level validation failed",
  "fieldErrors": [
    { "field": "email", "message": "must be a valid email", "value": "not-an-email" }
  ]
}
```

Implementations must use HTTP status codes consistent with the schema:
`400` for validation, `401` unauthenticated, `403` authenticated but
forbidden, `404` not found, `409` conflict, `422` semantic (rare),
`500/503` server-side. The `code` string is stable across implementations
and is what clients should branch on, not the message.

### IDs

Always UUIDv4-shaped strings. Implementations may use any UUID
generator; clients treat them as opaque.

### Timestamps

All timestamps are ISO-8601 UTC strings with millisecond precision and a
`Z` suffix (`2026-04-30T14:25:31.000Z`). Implementations must accept
inputs with or without milliseconds and normalize on the way out.

### Authentication

Every authenticated endpoint accepts a session token via either:

- **Cookie** (`monobase.session_token=…` or the configured session cookie
  name). Better-Auth–style.
- **Authorization header** (`Authorization: Bearer …`).

Implementations must accept both. Sessions are issued by the `/auth/*`
namespace, which is reserved for the auth provider (Better-Auth in the
reference TS impl).

---

## Custom OpenAPI extensions

The contract uses a small set of `x-` extensions to communicate
implementation requirements that OpenAPI doesn't model natively. Every
generator and runtime that consumes the spec must honour these.

### `x-security-required-roles`

Per-operation extension declaring the roles that may invoke an endpoint.
Roles are strings; a `role:permission` form expresses ownership-scoped
checks that the implementation enforces in handlers.

Example (from `booking.tsp`):

```yaml
paths:
  /booking/bookings:
    get:
      x-security-required-roles:
        - client:owner
        - host:owner
        - admin
        - support
```

Role tokens currently in use:

| Token            | Meaning                                                     |
|------------------|-------------------------------------------------------------|
| `admin`          | Platform administrator (all access)                         |
| `support`        | Read access for support staff                               |
| `user`           | Any authenticated user (Better-Auth default role)           |
| `client`         | Person acting as the client side of a booking               |
| `host`           | Person acting as the host side of a booking                 |
| `<role>:owner`   | Same role plus an ownership check on the resource           |

A compliant implementation MUST refuse a request whose authenticated
caller does not satisfy at least one of the listed roles. The TS impl
threads this into Hono middleware via `authMiddleware({ roles: [...] })`.
A Rust impl should do the equivalent in tower middleware. Codegen MAY
emit this as a guard helper.

### `x-expandable-field`

Per-field extension flagging that a relationship can be expanded inline
via the `?expand=` query parameter. The extension carries the
operation-id of the loader for the expanded entity.

Example:

```yaml
properties:
  owner:
    type: string
    x-expandable-field:
      opId: getPerson
```

Clients calling `GET /booking/events/{id}?expand=owner` receive the
expanded person object inline at `response.owner` instead of just the
person id. Implementations must:

1. Accept `expand` as a comma-separated query parameter.
2. Resolve each named field by invoking the referenced `opId`.
3. Return the field as either the id (default) or the full object
   (when expanded).

The TS impl auto-wires this via `createExpandMiddleware()` based on the
extension; another impl is free to do it differently as long as the wire
behavior matches.

---

## Versioning

The OpenAPI doc carries a `info.version` field driven by the TypeSpec
`@versioned(Versions)` annotation on the `MonobaseAPI` namespace. Semver
applies:

- Patch: doc-only, additive header changes.
- Minor: new endpoints, new optional fields, new optional query params.
  Existing clients unaffected.
- Major: breaking — removal, type narrowing, required field added,
  status code change. Bumping major requires a deprecation cycle (mark
  old field, ship new field side-by-side for at least one minor, then
  drop in the next major).

Implementations advertise the version they implement at `GET /livez?verbose=true`.

---

## Operational endpoints

Not part of business surface, but every implementation must expose:

- `GET /livez` — liveness probe. Returns `200` with `text/plain` body `ok`
  by default. Must NOT depend on database connectivity.
- `GET /readyz` — readiness probe. Returns `200` with `ok` if upstream
  dependencies (DB, storage, auth provider) are healthy; `503` with `error`
  otherwise.
- `GET /livez?verbose=true` / `GET /readyz?verbose=true` — return
  `application/health+json` (RFC-draft "Health Check Response Format")
  with `{ status: "pass" | "fail", timestamp, checks: { … } }`. The
  `checks` map carries per-dependency state for readiness; just
  `{ ping: "pass" }` for liveness.

These endpoints are followed by container orchestrators and the
contract test runner; their shape is part of the contract.

---

## Test target

The `specs/api/tests/contract/` Hurl scenarios drive against a single
`API_URL` env var. Implementations must:

1. Boot on a configurable port (`PORT` env var; default `7213`).
2. Connect to the dependencies in `services/api-ts/docker-compose.deps.yml`
   (or equivalents) using the documented env vars.
3. Idempotently run any required migrations on startup (or via a separate
   command — both patterns are acceptable, the test runner doesn't care).

`bun run test:contract` runs Hurl; `bun run test:contract:fuzz` runs
schemathesis. CI runs both against the TS impl on every PR.
