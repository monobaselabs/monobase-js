---
name: test-contract
description: Run the Hurl contract suite against any running API impl on $API_URL. Use after handler changes, before shipping API work, or to verify a new server impl is contract-compliant.
---

# test-contract

Black-box wire-shape tests that any implementation of the Monobase API must pass — the source of truth for API behavior. The suite is implementation-agnostic: it runs against whatever HTTP server is on `$API_URL`.

## Triggers

- After implementing or modifying a handler (verify wire shape unchanged)
- Before shipping any API change
- Verifying a new server impl (Rust, Go, Python, …) is contract-compliant
- Catching regressions in the auto-expand contract, error envelope, or pagination shape

## Workflow

### 1. Boot the impl under test

In one terminal:

```bash
cd services/api-ts && bun dev   # listens on 7213
```

For a remote target, just have it reachable at `$API_URL`.

### 2. Run the suite

```bash
bun run test:contract                              # default API_URL=http://localhost:7213
API_URL=https://stg.example.com bun run test:contract
```

The runner is `scripts/run-contract-tests.ts`. It iterates every `*.hurl` file under `specs/api/tests/contract/` and prints a per-scenario pass/fail summary plus aggregate request count.

### 3. Property-based fuzz (optional)

The contract suite hand-crafts scenarios. To fuzz the OpenAPI spec with random inputs:

```bash
bun run test:contract:fuzz   # runs Schemathesis against $API_URL
```

Schemathesis must be installed locally (`pipx install schemathesis` or `uv tool install schemathesis`).

## Adding a new scenario

1. Pick the right `.hurl` file under `specs/api/tests/contract/` — one per module (`booking.hurl`, `billing.hurl`, …) or per concern (`error-envelope.hurl`, `expand.hurl`).
2. Append the scenario using the existing patterns: `POST /auth/sign-in` to get a session cookie → exercise the endpoint → `[Asserts]` block on status, headers, and `jsonpath`.
3. Verify locally: `bun run test:contract`. The runner is fast (~5s for the full 22-scenario suite), so re-run after every edit.
4. Update `specs/api/tests/contract/COVERAGE.md` if the scenario covers a previously deferred area.

## When NOT to use this skill

- For browser/UI flows → `/test-e2e` (Playwright in `apps/account/tests/e2e/`).
- For TypeScript-only handler unit tests → `/test-api` (Bun test runner).
- For schema-only changes that don't affect the wire format → no test needed; just regenerate types and rebuild.

## Reference

- Suite root: `specs/api/tests/contract/`
- Coverage doc: `specs/api/tests/contract/COVERAGE.md`
- Wire contract: `specs/api/CONTRACT.md`
- Implementor playbook: `specs/api/IMPLEMENTING.md`
- CI: `.github/workflows/contract.yml` (boots Postgres + MinIO, runs Hurl + Schemathesis)
