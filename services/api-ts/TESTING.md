# Testing Guide — `services/api-ts`

This implementation has two testing layers, both intentionally narrow.

## 1. Unit tests (in-process)

Files: `src/**/*.test.ts`. Drive small, deterministic helpers and pure
modules — pagination parsing, CORS allow-list logic, date utilities.

```bash
bun test               # alias for test:unit
bun run test:unit
```

Anything that needs a database, a queue, or HTTP is **not** a unit test
here. It belongs in the contract suite below.

## 2. Contract tests (out-of-process, blackbox)

The contract layer is **not in this workspace**. It lives at
`specs/api/tests/contract/` and is driven by [Hurl](https://hurl.dev)
against whatever HTTP server is bound to `$API_URL`. Same suite, same
assertions, every implementation.

```bash
# In one terminal:
cd services/api-ts && bun run dev

# In another:
bun run test:contract                    # against http://localhost:7213
API_URL=https://stg.example.com \
  bun run test:contract                  # against a remote target
```

The runner is `scripts/run-contract-tests.ts` at the repo root. It
discovers every `.hurl` file under `specs/api/tests/contract/` and
injects a fresh `{{suffix}}` per run for unique fixture identifiers.

### What goes here

- Endpoint-level happy paths (sign-up to create person to patch).
- Auth boundary checks (401, 403, role gating).
- Response-envelope shape (pagination, error code, expand).
- Multi-step flows that span modules (booking flow with host + client).

### What does NOT go here

- Anything that needs to peek at internal state (DB rows, queue
  internals, log calls). The point of the layer is that it works
  against a Rust or Go reimplementation byte-for-byte.

## 3. Fuzz / schema conformance (optional)

[Schemathesis](https://schemathesis.readthedocs.io/) cross-checks the
running impl against the OpenAPI bundle. Run it the same way:

```bash
bun run test:contract:fuzz
```

It is a shadow layer; Hurl is the primary contract.

## Reference: backing infra

The reference impl needs Postgres, MinIO, and an SMTP catcher. See
`docker-compose.deps.yml` to spin them up locally:

```bash
bun run dev:deps:up
bun run dev
```
