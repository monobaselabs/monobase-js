# Contract Tests

Black-box HTTP tests that target the OpenAPI contract, not any specific
implementation. Each `.hurl` file describes a scenario by hitting endpoints
and asserting on the wire format.

These tests must pass against **any** implementation that claims to
implement the contract — TypeScript today, Rust tomorrow, etc.

## Running

```bash
# Boot the implementation under test (in another terminal)
cd services/api-ts && bun dev

# Run all contract scenarios against it
hurl --variable api=http://localhost:7213 specs/api/tests/contract/*.hurl

# Or via the workspace script
bun run test:contract
```

## Variables

Each test expects:

- `api` — base URL of the implementation (default in CI: `http://localhost:7213`)

Tests that need a logged-in session use `[Captures]` to grab a token from
sign-in and pass it on. They start from a clean DB; they don't assume any
fixtures.

## Adding a scenario

- One `.hurl` file per user journey or feature flow
- Keep them implementation-agnostic — no assumptions about handler internals,
  log lines, or DB row counts. Only the wire format matters.
- Every assertion should be derivable from the OpenAPI spec.

## Companion: Schemathesis

`hurl` covers known happy paths. Schemathesis fuzzes the contract by
generating inputs from the OpenAPI schema and asserting the responses still
conform. Run:

```bash
schemathesis run --base-url http://localhost:7213 specs/api/dist/openapi/openapi.json
```

CI runs both: hurl as a required check, schemathesis as a shadow check that
surfaces drift without blocking.
