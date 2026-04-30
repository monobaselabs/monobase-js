---
name: debug
description: Troubleshooting procedures for common development issues. Use when encountering errors with ports, database, types, builds, or dependencies.
---

# debug

Common debugging procedures.

## Triggers

- Build or runtime errors
- Database connection issues
- Type errors after code generation
- Port conflicts
- Dependency issues

## Procedures

### Port In Use

```bash
lsof -i :{port}
kill -9 {PID}
```

Common ports: API = 7213, Account app = 3002, Drizzle Studio = 4983

### Database Connection Failed

```bash
pg_isready
echo $DATABASE_URL
```

If PostgreSQL is not running, start it. If `DATABASE_URL` is wrong, fix `services/api-ts/.env`.

### Stale Types After TypeSpec Changes

```bash
cd specs/api && bun run build
cd ../../services/api-ts && bun run generate
```

Then restart dev servers.

### Module Not Found / Dependency Issues

```bash
rm -rf node_modules && bun install
```

### Vite Cache Issues

```bash
rm -rf node_modules/.vite
cd apps/account && bun dev
```

### View OpenAPI Spec

```bash
cat specs/api/dist/openapi/openapi.json | jq
```

View specific schema:
```bash
cat specs/api/dist/openapi/openapi.json | jq '.components.schemas.{ModelName}'
```

View paths:
```bash
cat specs/api/dist/openapi/openapi.json | jq '.paths'
```

### Database Inspection

```bash
cd services/api-ts && bun run db:studio
# Opens http://localhost:4983
```

Manual SQL:
```bash
psql $DATABASE_URL
\dt              # List tables
\d {table_name}  # Describe table
```

### Reset Database (DESTRUCTIVE)

```bash
dropdb monobase
createdb monobase
cd services/api-ts && bun run db:generate
```

### Enable Debug Logging

Set `LOG_LEVEL=debug` in `services/api-ts/.env`, then restart the server.

### TypeSpec Compilation Errors

```bash
cd specs/api && bun run build
```

Common issues:
- Missing imports: add `import "@typespec/http"` etc.
- Type not found: check namespace and common model imports
- Circular references: restructure type dependencies
