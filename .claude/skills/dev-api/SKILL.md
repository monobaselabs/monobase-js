---
name: dev-api
description: Start the API development server on port 7213. Use when you need the backend running for development or testing.
---

# dev-api

Start the API development server.

## Workflow

### Start Server

```bash
cd services/api-ts && bun dev
```

- **Port**: 7213
- **Health check**: `curl http://localhost:7213/health`
- **API docs**: `http://localhost:7213/docs`

### Troubleshooting

**Port already in use**:
```bash
lsof -i :7213
kill -9 {PID}
```

**Database connection failed**:
```bash
pg_isready
echo $DATABASE_URL
```

**Missing environment variables**:
Check `services/api-ts/.env` exists with:
```
DATABASE_URL=postgresql://user:password@localhost:5432/monobase
PORT=7213
AUTH_SECRET=your-secret-key-here
```

**Module not found**:
```bash
rm -rf node_modules && bun install
```
