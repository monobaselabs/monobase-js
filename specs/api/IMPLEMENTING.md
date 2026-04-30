# Implementing the Monobase API in another language

Monobase is **spec-first**. The OpenAPI document at
`specs/api/dist/openapi/openapi.json` is the single source of truth for
the API; every implementation and every client SDK is generated from it.
There can be many implementations of the same contract, written in any
language, and they're all interchangeable behind the same `$API_URL`.

This document is the playbook for adding a new implementation (Rust, Go,
Python, Elixir, …) and/or a new client SDK in any language.

> **Conformance**: an implementation is "compliant" when the full Hurl
> suite under `specs/api/tests/contract/` passes against it and
> `schemathesis run --base-url $API_URL specs/api/dist/openapi/openapi.json`
> reports no critical drift. See [`CONTRACT.md`](./CONTRACT.md) for the
> wire-level contract details.

---

## Workspace layout

```
services/
├── api-ts/   ← reference TypeScript impl (Hono + Drizzle + Bun)
├── api-rs/   ← future Rust impl (axum or actix; Drizzle replaced by sqlx/diesel)
├── api-go/   ← future Go impl (chi or echo; sqlc + pgx)
└── ...

packages/
├── sdk-ts/   ← reference TypeScript client (@hey-api/openapi-ts)
├── sdk-rs/   ← future Rust client (progenitor)
├── sdk-go/   ← future Go client (oapi-codegen)
└── ...
```

Each implementation/SDK is **self-contained** in its own workspace. Per-language
codegen tooling lives inside that workspace; nothing is shared across languages
except the OpenAPI bundle. A Rust contributor never has to touch the TS
toolchain to ship `services/api-rs`.

---

## Building a server implementation

The reference TS impl (`services/api-ts`) is the worked example. Reading
its `scripts/generate.ts` is the fastest way to understand the
codegen-driven server pattern.

The pipeline any server implementation follows:

```
specs/api/dist/openapi/openapi.json
        │
        ▼ (codegen)
  generated routes, validators, models, handler stubs
        │
        ▼ (hand-fill)
  src/handlers/{module}/*.{ts,rs,go}   ← business logic
        │
        ▼ (runtime)
  HTTP server bound to $PORT, deps configured via env
```

What "codegen" produces:

- A typed router that maps HTTP routes to handler functions keyed by
  `operationId`. The router enforces request validation (status, headers,
  body, query, path) against the schema before calling the handler.
- A row of stub handler files that throw `not implemented` until you fill
  them in. Re-running codegen never overwrites existing handlers — only
  adds new ones for new operations.
- Models / DTOs derived from `components/schemas`.
- Auth middleware bound to the `x-security-required-roles` extension on
  each operation.
- Expand middleware bound to the `x-expandable-field` extensions in the
  schemas.

What you write by hand:

- The handler bodies (business logic).
- The DB schema (Drizzle / sqlx / sqlc / etc.) — **kept aligned with the
  spec by code review**, since neither TypeSpec nor OpenAPI knows how
  your DB is laid out.
- Auth provider integration (Better-Auth in the TS impl; the Rust impl
  could use a different provider as long as it serves the same `/auth/*`
  endpoints).

### Per-language tooling

#### Rust

| Concern              | Recommended tool                                                |
|----------------------|-----------------------------------------------------------------|
| Server stubs         | `openapi-generator-cli generate -g rust-server -i openapi.json` |
| Models + validation  | `progenitor` types crate (also serves the SDK), or hand-rolled `serde` structs + `jsonschema` |
| HTTP framework       | `axum` (recommended) or `actix-web`                             |
| ORM                  | `sqlx` or `diesel` (DB schema authored separately)              |
| Migrations           | `sqlx-cli` or `refinery`                                        |
| Auth integration     | Implement `/auth/*` against the same Better-Auth-shaped contract, or swap in a Rust-native provider that serves the same endpoints |

`openapi-generator`'s rust-server output is verbose; an idiomatic
alternative is to hand-roll the `axum::Router` per operation but use
`progenitor`-generated types for the request/response models.

#### Go

| Concern              | Recommended tool                            |
|----------------------|---------------------------------------------|
| Codegen              | `oapi-codegen` (server + types + validators)|
| HTTP framework       | `chi` or `echo`                             |
| ORM / DB             | `sqlc` (recommended) or `bun`/`gorm`        |
| Auth                 | Same shape as the TS impl; pick a Go session library or proxy to a shared auth service |

#### Python

| Concern              | Recommended tool                            |
|----------------------|---------------------------------------------|
| Codegen              | `fastapi-code-generator` or `openapi-python-client` |
| HTTP framework       | `FastAPI` (which integrates with OpenAPI natively, so codegen is light) |
| ORM                  | `SQLAlchemy` or `SQLModel`                  |
| Auth                 | Same shape; `fastapi-users` or custom       |

---

## Building a client SDK

The TS SDK (`packages/sdk-ts`) is the reference. Codegen runs from the
package's own `openapi-ts.config.ts` and emits to `src/generated/`;
hand-written code (multi-step flows, framework hooks, retry policy) lives
above the generated layer.

Replicate the pattern in any language: a slim `generated/` directory that
the codegen tool owns, plus optional ergonomic helpers above it.

### Per-language tooling

| Language    | Generator                                       | Notes |
|-------------|-------------------------------------------------|-------|
| TypeScript  | `@hey-api/openapi-ts`                           | Already in `packages/sdk-ts` |
| Rust        | `progenitor` (build script integration)         | Produces a typed `Client` with one method per operationId |
| Go          | `oapi-codegen --generate types,client`          | Idiomatic; ships in a single file |
| Python      | `openapi-python-client`                         | Async + sync variants |
| Swift / Kotlin | `openapi-generator-cli`                      | Useful for mobile clients |

A new SDK package is "compliant" when the generated client can hit a
running compliant server and round-trip every operation in the schema.

---

## Testing a new implementation

Black-box only — no implementation may import from another's source.

Required steps for a new impl:

1. `bun --filter @monobase/api-spec run build` — refresh the OpenAPI bundle.
2. Boot the impl on a known port (default `7213`).
3. `API_URL=http://localhost:7213 bun run test:contract` — Hurl scenarios.
4. `API_URL=http://localhost:7213 bun run test:contract:fuzz` — Schemathesis.

Both must pass before the impl can be advertised as compliant.

The CI workflow at `.github/workflows/contract.yml` runs both layers
against the TS impl on every push. To add a CI job for another impl,
copy that workflow and replace the "Implementation under test" steps;
the test layers stay identical.

---

## Adding a new endpoint

1. Edit a `.tsp` file under `specs/api/src/modules/`.
2. `bun --filter @monobase/api-spec run build` — regenerates the OpenAPI bundle.
3. In every implementation workspace: run that workspace's codegen (e.g.
   `bun --filter @monobase/api-ts run generate`). The codegen tool
   produces new handler stubs / routes; old ones are untouched.
4. In every SDK workspace: run that workspace's codegen. The new method
   appears on the typed client.
5. Add or update a contract scenario under `specs/api/tests/contract/`.
6. Implement business logic in each impl's new handler stub.

Step 3 onwards happens per language. The contract changes once, in one
place, in TypeSpec.

---

## When to add a new implementation

You probably don't need one yet. The TS reference covers the full
contract and is the simplest path to a working stack. Add a Rust /
Go / etc. impl when you have a specific reason:

- Throughput or latency targets the TS impl can't meet.
- A team or service that has to live in a different runtime.
- A platform constraint (embedded, edge, on-device).

If the answer is "to learn", just write a small one for one module — you
get the spec-first benefit without forcing yourself to maintain two
production servers.

---

## What's intentionally not generated

- Database schemas. TypeSpec models are HTTP shapes; DB shapes can drift
  intentionally (different table layouts, denormalisation, sharding).
  Keep them aligned via code review and contract tests.
- Auth provider internals. Better-Auth in the TS impl is a library
  choice; another impl is free to use a different provider as long as
  the `/auth/*` HTTP surface matches.
- Background jobs / cron / queue handlers. They consume the API
  internally and aren't part of the public contract.
- App-level UI. Each `apps/` workspace owns its own components and
  flows. There is no shared UI package.
