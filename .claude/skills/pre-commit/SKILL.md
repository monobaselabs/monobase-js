---
name: pre-commit
description: Run the full pre-commit verification checklist (typecheck + tests + build). Use before committing any changes to ensure everything passes.
---

# pre-commit

Full pre-commit verification checklist.

## Triggers

- Before committing changes
- Before creating a PR
- After completing a feature implementation

## Workflow

Run all checks in order. Stop on first failure.

### 1. Type Check API

```bash
cd services/api-ts && bun run typecheck
```

### 2. Type Check Account App

```bash
cd apps/account && bun run typecheck
```

### 3. Run API Tests

```bash
cd services/api-ts && bun test
```

### 4. Type Check SDK

```bash
cd packages/sdk-ts && bun run typecheck
```

### 5. Build API

```bash
cd services/api-ts && bun run build
```

### 6. Build Account App

```bash
cd apps/account && bun run build
```

### 7. Lint per workspace

```bash
bun run --filter '*' lint
```

### 8. Contract Suite (if API surface touched)

If you modified handlers or TypeSpec:

```bash
cd services/api-ts && bun dev &       # boot in background
sleep 3
bun run test:contract                  # 22 scenarios in ~5s
kill %1                                # stop dev server
```

## On Failure

- **Type errors**: Fix the types, then re-run from step 1
- **Test failures**: Fix the failing test or handler, then re-run from step 3
- **Build errors**: Usually a type error or missing import — fix and re-run
