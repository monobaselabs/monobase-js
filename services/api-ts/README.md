# Monobase API Service

High-performance API service built with **Bun** runtime and **Hono** web framework. Provides comprehensive platform functionality including user management, video sessions, notifications, communications, file storage, and email services.

## 🚀 Technology Stack

- **Runtime**: [Bun](https://bun.sh) - 3× faster than Node.js with native TypeScript
- **Framework**: [Hono](https://hono.dev) - Fast, lightweight web framework
- **Database**: PostgreSQL with [Drizzle ORM](https://orm.drizzle.team)
- **Storage**: S3-compatible storage (AWS S3 or MinIO)
- **Auth**: [Better-Auth](https://better-auth.com) - Embedded authentication
- **API Spec**: TypeSpec for API-first development
- **Logging**: Pino structured logging

## 📋 Prerequisites

### PostgreSQL Database (Required)

**Essential Environment Variable:**
```bash
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
```

### S3-Compatible Storage (Required)

**Essential Environment Variables:**
```bash
STORAGE_PROVIDER="minio"  # or "s3" for AWS S3
STORAGE_ENDPOINT="http://localhost:9000"
STORAGE_BUCKET="monobase-files"
STORAGE_ACCESS_KEY_ID="minioadmin"
STORAGE_SECRET_ACCESS_KEY="minioadmin"
```

💡 **We recommend MinIO for development** - S3-compatible and runs locally.

## 🛠️ Development Setup

### Recommended: Local Development with Docker Dependencies

Run PostgreSQL + MinIO + Mailpit in containers while developing the API locally with hot reload:

```bash
# Start dependencies
bun run dev:deps:up

# Run API in development mode
bun run dev

# Clean up
bun run dev:deps:down
```

### Alternative: Individual Docker Commands

**PostgreSQL:**
```bash
docker run -d \
  --name monobase-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=monobase \
  -p 5432:5432 \
  -v monobase-postgres-data:/var/lib/postgresql/data \
  postgres:16-alpine
```

**MinIO:**
```bash
docker run -d \
  --name monobase-minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -v monobase-minio-data:/data \
  minio/minio:latest \
  server /data --console-address ":9001"
```

**Mailpit (Email Testing):**
```bash
docker run -d \
  --name monobase-mailpit \
  -p 1025:1025 \
  -p 8025:8025 \
  axllent/mailpit:latest

# Web UI available at http://localhost:8025
```

**Volume Management:**
```bash
# View volumes
docker volume ls

# Clean up volumes (removes all data!)
docker volume rm monobase-postgres-data monobase-minio-data
```

## ⚡ Quick Start

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Start dependencies:**
   ```bash
   bun run dev:deps:up
   ```

3. **Run the API:**
   ```bash
   bun run dev
   ```

4. **Verify:**
   ```bash
   # Simple health check
   curl http://localhost:7213/readyz
   # Response: "ok" (healthy) or "failed" (unhealthy)

   # Verbose health check
   curl "http://localhost:7213/readyz?verbose"
   # Response: {"status":"pass","timestamp":"...","checks":{...}}

   # Liveness check
   curl http://localhost:7213/livez
   # Response: "ok"
   ```

5. **View API documentation:**
   Open [http://localhost:7213/docs](http://localhost:7213/docs)

## 📝 CORS Configuration

Simple 3-flag CORS system for 90% of use cases:

| Flag | Default | Description |
|------|---------|-------------|
| `CORS_ALLOW_LOCAL_NETWORK` | `true` | Localhost, 127.0.0.1, 192.168.x.x, *.local |
| `CORS_ALLOW_TUNNELING` | `true` | ngrok, Cloudflare tunnels, loca.lt |
| `CORS_STRICT` | `false` | Only allow explicit origins |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `CORS_CREDENTIALS` | `true` | Include credentials |

### Common Configurations

**Development (default):**
```bash
CORS_ALLOW_LOCAL_NETWORK=true
CORS_ALLOW_TUNNELING=true
CORS_STRICT=false
```

**Production (explicit origins only):**
```bash
CORS_ORIGINS=https://app.yourdomain.com,https://admin.yourdomain.com
CORS_STRICT=true
CORS_ALLOW_LOCAL_NETWORK=false
CORS_ALLOW_TUNNELING=false
```

### Automatic Pattern Matching

**Local Network** (`CORS_ALLOW_LOCAL_NETWORK=true`):
- `http://localhost` (any port)
- `http://127.0.0.1` (any port)
- `http://192.168.x.x` (local IPs)
- `http://10.x.x.x` (local IPs)
- `http://*.local` (mDNS)

**Tunneling** (`CORS_ALLOW_TUNNELING=true`):
- `https://*.ngrok.io`
- `https://*.ngrok-free.app`
- `https://*.loca.lt`
- `https://*.trycloudflare.com`
- `https://*.localhost.run`

### Cookie Configuration

API automatically adjusts cookie settings based on CORS:

| Scenario | `sameSite` | `secure` |
|----------|------------|----------|
| Cross-origin with tunneling | `none` | `true` |
| Cross-origin local network | `none` | `false` |
| Same-origin/strict mode | `lax` | Based on `AUTH_SECURE_COOKIES` |

Override with:
```bash
AUTH_COOKIE_SAME_SITE=lax    # strict, lax, or none
AUTH_SECURE_COOKIES=true      # true or false
```

## 🧪 Testing

```bash
# All tests
bun test

# Quieter output for AI development
CLAUDECODE=1 bun test

# Specific test types
bun run test:unit       # Unit tests (in-process)
```

End-to-end coverage lives in the language-agnostic Hurl contract suite
at `specs/api/tests/contract/`. From the repo root, with this impl
running on `:7213`:

```bash
bun run test:contract        # Hurl scenarios
bun run test:contract:fuzz   # Schemathesis fuzz against the OpenAPI bundle
```

See `TESTING.md` for details.

## 📖 Documentation

### Reference impl docs
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Handler patterns, database workflow
- **[TESTING.md](./TESTING.md)** - Unit + contract test layers
- **[docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md)** - Better-Auth integration
- **[docs/REALTIME.md](./docs/REALTIME.md)** - WebSocket envelope + auth
- **[docs/JOBS.md](./docs/JOBS.md)** - Background jobs via pg-boss

### Spec / contract
- **[../../specs/api/CONTRACT.md](../../specs/api/CONTRACT.md)** - Wire-level contract every impl satisfies
- **[../../specs/api/IMPLEMENTING.md](../../specs/api/IMPLEMENTING.md)** - Playbook for adding a new server impl
- **[../../specs/api/docs/DEVELOPMENT.md](../../specs/api/docs/DEVELOPMENT.md)** - TypeSpec standards
- **[../../specs/api/docs/SECURITY.md](../../specs/api/docs/SECURITY.md)** - RBAC tokens + auth contract

### External References
- **[Better-Auth](https://better-auth.com/docs)** - Authentication library documentation
- **[Drizzle ORM](https://orm.drizzle.team/docs/overview)** - Database ORM documentation
- **[pg-boss](https://github.com/timgit/pg-boss/blob/master/docs/readme.md)** - Job queue documentation
- **[Pino](https://getpino.io/)** - Logging library documentation
- **[Hono](https://hono.dev/)** - Web framework documentation

## 🔧 Development Commands

```bash
bun run dev          # Start with hot reload
bun run build        # Build for production
bun run typecheck    # TypeScript checking
bun run lint         # Code linting

# Database
bun run db:generate  # Generate migrations
bun run db:studio    # Open Drizzle Studio

# Dependencies
bun run dev:deps:up    # Start PostgreSQL + MinIO
bun run dev:deps:down  # Stop dependencies
```

## 📚 Development

For detailed development patterns, handler implementation, database operations, and best practices, see [CONTRIBUTING.md](./CONTRIBUTING.md).

### Handler Modules

`src/handlers/` contains nine vertical-neutral modules: `person`, `booking`,
`billing`, `audit`, `comms`, `email`, `notifs`, `storage`, `reviews`. Every
module has a matching TypeSpec definition under `specs/api/src/modules/`.

Add new domain modules (e.g. `tenant`, `student`, `merchant`) by creating a
new TypeSpec file plus a handler folder; `bun run generate` will wire them
into the routes registry.

### Quick Reference

**Before implementing features:**
1. Define API in TypeSpec (`specs/api/src/modules/`)
2. Generate OpenAPI + types (`cd specs/api && bun run build`)
3. Implement handlers in `src/handlers/`
4. Use generated types for type safety

**For complete workflow**, see:
- [CONTRIBUTING.md](./CONTRIBUTING.md) - API service patterns
- [Root CONTRIBUTING.md](../../CONTRIBUTING.md) - Backend patterns
- [specs/api/CONTRIBUTING.md](../../specs/api/CONTRIBUTING.md) - TypeSpec patterns

---

**Part of the Monobase Application Platform monorepo**
