---
name: dev-app
description: Start the account app development server on port 3002. Use when you need the frontend running for development or testing.
---

# dev-app

Start the account app development server.

## Workflow

### Start Server

```bash
cd apps/account && bun dev
```

- **Port**: 3002

### Troubleshooting

**API connection failed**:
Check `apps/account/.env`:
```
VITE_API_URL=http://localhost:7213
```
Ensure the API server is running first (`/dev-api`).

**Stale Vite cache**:
```bash
rm -rf node_modules/.vite && bun dev
```

**TypeScript errors after API changes**:
```bash
cd specs/api && bun run build
cd ../../apps/account && bun dev
```
