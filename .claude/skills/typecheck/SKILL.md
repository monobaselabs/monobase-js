---
name: typecheck
description: Run TypeScript type checking across all workspaces (API service and frontend apps). Use before committing or when diagnosing type errors.
---

# typecheck

Run TypeScript type checking.

## Triggers

- Before committing changes
- After modifying types, interfaces, or schemas
- After TypeSpec code generation
- When diagnosing type errors

## Workflow

### Check API Service

```bash
cd services/api-ts && bun run typecheck
```

### Check Account App

```bash
cd apps/account && bun run typecheck
```

### Check Both (Pre-Commit)

```bash
cd services/api-ts && bun run typecheck && cd ../../apps/account && bun run typecheck
```

## Troubleshooting

- **Type errors after TypeSpec changes**: Regenerate types first:
  ```bash
  cd specs/api && bun run build
  cd ../../services/api-ts && bun run generate
  ```
  Then restart the dev server.

- **Missing type from `@monobase/api-spec`**: Ensure `cd specs/api && bun run build` was run after TypeSpec changes.

- **Stale types**: Restart the dev server to pick up new type definitions.
