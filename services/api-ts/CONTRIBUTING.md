# API Service Development Guide

This guide covers Hono API service-specific development patterns. **For shared backend patterns**, see [Root CONTRIBUTING.md](../../CONTRIBUTING.md).

## Table of Contents

1. [Service Overview](#service-overview)
2. [⚠️ CRITICAL: Code Generation](#critical-code-generation)
3. [Error Handling Philosophy](#error-handling-philosophy)
4. [Handler Implementation](#handler-implementation)
5. [Database Operations](#database-operations)
6. [Query & Pagination Utilities](#query--pagination-utilities)
7. [Field Expansion Pattern](#field-expansion-pattern)
8. [File Storage Patterns](#file-storage-patterns)
9. [Authentication & Authorization](#authentication--authorization)
10. [Enhanced Error Handling System](#enhanced-error-handling-system)
11. [Middleware Patterns](#middleware-patterns)
12. [Best Practices](#best-practices)
13. [Migration Guide](#migration-guide)
14. [Quick Reference](#quick-reference)

---

## Service Overview

**Purpose**: Main Hono API service for Monobase Application Platform

**Key Technologies:**
- **Hono**: Fast web framework
- **Drizzle ORM**: Type-safe database queries
- **Better-Auth**: Authentication ([docs](https://better-auth.com/docs))
- **Pino**: Structured logging ([docs](https://getpino.io/))
- **S3/MinIO**: File storage
- **pg-boss**: Background jobs ([docs](https://github.com/timgit/pg-boss/blob/master/docs/readme.md))

**For complete backend workflow**, see [Root CONTRIBUTING.md](../../CONTRIBUTING.md).

---

## ⚠️ CRITICAL: Code Generation

**NEVER edit generated files!** See [Root CONTRIBUTING.md > Code Generation](../../CONTRIBUTING.md#code-generation---do-not-edit).

Generated files include:
- `src/generated/openapi/` - Routes, validators, types
- `src/generated/better-auth/` - Auth schema
- `src/generated/migrations/` - Database migrations

---

## Error Handling Philosophy

**DO NOT use try/catch blocks unless you need to clean up resources on failure.**

The API has a global error handler that manages all errors. Let errors bubble up naturally.

### ❌ WRONG - Unnecessary try/catch
```typescript
// DON'T DO THIS - The global handler will manage errors
try {
  const user = await repo.findById(id);
  if (!user) throw new NotFoundError('User not found', { resourceType: 'user', resource: id });
  return ctx.json(user);
} catch (error) {
  return ctx.json({ error: error.message }, 400);
}
```

### ✅ CORRECT - Let errors bubble up
```typescript
// DO THIS - Let the global error handler manage it
const user = await repo.findById(id);
if (!user) throw new NotFoundError('User not found', { resourceType: 'user', resource: id });
return ctx.json(user);
```

### ✅ CORRECT - Try/catch ONLY for cleanup
```typescript
// Use try/catch ONLY when you need to clean up on failure
let resourceCreated = false;
try {
  await repo.create(data);
  resourceCreated = true;
  
  await externalService.process(data);
  return ctx.json({ success: true });
} catch (error) {
  // Clean up only if resource was created
  if (resourceCreated) {
    await repo.delete(data.id);
    logger?.error({ error, id: data.id }, 'Cleaned up after failure');
  }
  throw error; // ALWAYS re-throw for global handler
}
```

---

## Handler Implementation

### Module Structure

Organize handlers using the repository pattern with proper separation of concerns:

```
src/handlers/[module]/
├── repos/
│   ├── [entity].schema.ts    # Drizzle schema definitions & types
│   └── [entity].repo.ts      # Repository class with data access logic
├── [operation1].ts           # Individual handler functions
├── [operation2].ts
├── [operation3].ts
└── index.ts                  # Module exports (optional)
```

### Schema Definition

Define your database schema and TypeScript types using Drizzle ORM with the standardized base entity fields:

```typescript
import { pgTable, uuid, varchar, pgEnum } from 'drizzle-orm/pg-core';
import { baseEntityFields, type BaseEntity } from '@/core/database.schema';

// Define enums
export const statusEnum = pgEnum('status', ['active', 'inactive', 'pending']);

// Define table schema
export const entities = pgTable('entity', {
  // Base entity fields (includes id, timestamps, version, audit fields)
  ...baseEntityFields,
  
  // Entity-specific fields
  name: varchar('name', { length: 255 }).notNull(),
  status: statusEnum('status').notNull().default('pending'),
  
  // Relationships - Use entity name, not *Id suffix
  owner: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

// Type exports for TypeScript
export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
```

### Repository Pattern

Create a repository class that extends the base `DatabaseRepository`:

```typescript
import { eq, and, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '@/core/database';
import { DatabaseRepository } from '@/core/database.repo';
import { entities, type Entity, type NewEntity } from './entity.schema';

export interface EntityFilters {
  status?: 'active' | 'inactive' | 'pending';
  owner?: string;
}

export class EntityRepository extends DatabaseRepository<Entity, NewEntity, EntityFilters> {
  constructor(db: DatabaseInstance, logger?: any) {
    super(db, entities, logger);
  }

  protected buildWhereConditions(filters?: EntityFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;
    
    const conditions = [];
    if (filters.status) conditions.push(eq(entities.status, filters.status));
    if (filters.owner) conditions.push(eq(entities.owner, filters.owner));

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  async updateStatus(id: string, status: Entity['status']): Promise<Entity> {
    return this.updateOneById(id, { status });
  }
}
```

### Basic Handler Structure

```typescript
import { Context } from 'hono';
import type { DatabaseInstance } from '@/core/database';
import { NotFoundError, BusinessLogicError } from '@/core/errors';
import { EntityRepository } from './repos/entity.repo';

export async function handlerName(ctx: Context) {
  // Get validated parameters
  const params = ctx.req.valid('param') as { id: string };
  const body = ctx.req.valid('json') as { name: string };
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  
  // Instantiate repository
  const repo = new EntityRepository(db, logger);
  
  // Business logic - NO try/catch needed
  const entity = await repo.findOneById(params.id);
  
  if (!entity) {
    throw new NotFoundError('Entity not found', { 
      resourceType: 'entity', 
      resource: params.id 
    });
  }
  
  // Validate business rules
  if (entity.status !== 'active') {
    throw new BusinessLogicError(
      `Entity is ${entity.status}, operation not allowed`,
      'INVALID_STATUS'
    );
  }
  
  // Update entity
  const updated = await repo.updateOneById(params.id, { name: body.name });
  
  // Log audit trail
  logger?.info({
    entityId: params.id,
    action: 'update',
    changes: { name: body.name }
  }, 'Entity updated');
  
  return ctx.json(updated, 200);
}
```

### External Service Integration with Cleanup

```typescript
export async function uploadHandler(ctx: Context) {
  const body = ctx.req.valid('json') as { filename: string };
  const storage = ctx.get('storage');
  const repo = new FileRepository(db, logger);
  
  const fileId = uuidv4();
  let fileCreated = false;
  
  try {
    await repo.createOne({ id: fileId, filename: body.filename, status: 'uploading' });
    fileCreated = true;
    
    const uploadUrl = await storage.generateUploadUrl(fileId);
    return ctx.json({ fileId, uploadUrl }, 201);
  } catch (error) {
    if (fileCreated) {
      await repo.deleteOneById(fileId);
    }
    throw error; // Re-throw for global handler
  }
}
```

---

## Database Operations

### Base Entity Fields Pattern

All tables use standardized `baseEntityFields` from `@/core/database.schema`:

```typescript
export const baseEntityFields = {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  version: integer('version').default(1).notNull(),  // Optimistic locking
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
};
```

**Benefits**: Consistency, audit trail, optimistic locking, type safety.

### Modern Foreign Key Pattern

**Use entity names for foreign keys, not `*Id` suffixes.**

✅ **CORRECT**:
```typescript
export const patients = pgTable('patient', {
  ...baseEntityFields,
  person: uuid('person_id').notNull().references(() => persons.id),
});
```

❌ **WRONG**:
```typescript
export const patients = pgTable('patient', {
  ...baseEntityFields,
  personId: uuid('person_id').notNull().references(() => persons.id),
});
```

**Why**: Direct API alignment, no mapping needed, cleaner code.

### Table Naming Convention

Plural constants, singular table names:

```typescript
// ✅ CORRECT
export const patients = pgTable('patient', { /* ... */ });
export const providers = pgTable('provider', { /* ... */ });
export const storedFiles = pgTable('stored_file', { /* ... */ });
```

### Query Patterns

See [Drizzle ORM docs](https://orm.drizzle.team/docs/overview) for complete reference.

**Select**:
```typescript
const person = await db.query.persons.findFirst({
  where: eq(persons.id, id),
});

const notifications = await db.query.notifications.findMany({
  where: eq(notifications.recipient, userId),
  orderBy: [desc(notifications.created_at)],
  limit: 20,
});
```

**Insert**:
```typescript
const [person] = await db.insert(persons).values({ firstName: 'John' }).returning();
```

**Update**:
```typescript
const [updated] = await db.update(persons)
  .set({ firstName: newName, updatedAt: new Date() })
  .where(eq(persons.id, id))
  .returning();
```

**Delete** (hard delete):
```typescript
await db.delete(persons)
  .where(eq(persons.id, id));
```

### Schema Migrations

```bash
bun run db:generate  # Generate migration
bun run db:migrate   # Apply migrations
bun run db:studio    # Open Drizzle Studio
```

---

## Query & Pagination Utilities

Use standardized utilities from `@/utils/query` for uniform query handling:

```typescript
import { parsePagination, buildPaginationMeta, parseFilters, shouldExpand } from '@/utils/query';

export async function listEntities(ctx: Context) {
  const query = ctx.req.valid('query');
  
  // Parse pagination with defaults
  const { limit, offset } = parsePagination(query, { limit: 25, maxLimit: 100 });
  
  // Parse filters (only allowed fields)
  const filters = parseFilters(query, ['q', 'status', 'category']);
  
  // Check expansion
  const expandRelated = shouldExpand(query, 'related');
  
  const repo = new EntityRepository(db, logger);
  const entities = await repo.findMany(filters, { pagination: { limit, offset } });
  const totalCount = await repo.count(filters);
  
  // Build standard pagination metadata
  const paginationMeta = buildPaginationMeta(entities, totalCount, limit, offset);
  
  return ctx.json({ data: entities, pagination: paginationMeta }, 200);
}
```

**Standard response format**:
```typescript
{
  data: Entity[],
  pagination: {
    limit: number,
    offset: number,
    count: number,
    totalCount: number,
    totalPages: number,
    currentPage: number,
    hasMore: boolean,
    hasNextPage: boolean,
    hasPreviousPage: boolean
  }
}
```

---

## Field Expansion Pattern

Implement expandable fields for optional related data:

```typescript
import { shouldExpand } from '@/utils/query';

export async function getPatient(ctx: Context) {
  const patientId = ctx.req.param('patient');
  const query = ctx.req.valid('query') as { expand?: string[] };
  
  const expandPerson = shouldExpand(query, 'person');
  
  // Call appropriate repository method
  const patient = expandPerson 
    ? await repo.findOneWithPerson(patientId)
    : await repo.findOneById(patientId);
  
  if (!patient) throw new NotFoundError('Patient not found');
  
  return ctx.json(patient, 200);
}
```

**Repository methods**:
```typescript
async findOneById(id: string): Promise<Patient | null> {
  return super.findOneById(id);  // Returns: { person: "uuid-string" }
}

async findOneWithPerson(id: string): Promise<PatientWithPerson | null> {
  const result = await this.db
    .select({ patient: patients, person: persons })
    .from(patients)
    .innerJoin(persons, eq(patients.person, persons.id))
    .where(eq(patients.id, id))
    .limit(1);
    
  return result.length > 0 ? { ...result[0].patient, person: result[0].person } : null;
}
```

**API usage**:
```bash
GET /patients/123              # person is UUID
GET /patients/123?expand=person  # person is full object
```

---

## File Storage Patterns

See implementation in `src/handlers/storage/` for complete examples.

**Upload with presigned URL**:
```typescript
const uploadUrl = await storage.generateUploadUrl(fileKey);
return ctx.json({ fileId, uploadUrl }, 201);
```

**Download with presigned URL**:
```typescript
const downloadUrl = await storage.generateDownloadUrl(fileKey);
return ctx.json({ url: downloadUrl });
```

**Delete**:
```typescript
await storage.deleteObject(fileKey);
await repo.deleteOneById(fileId);
```

---

## Authentication & Authorization

See [Better-Auth docs](https://better-auth.com/docs) for complete reference.

**Get current user**:
```typescript
const session = await auth.api.getSession({ headers: ctx.req.raw.headers });
if (!session) throw new HTTPException(401, { message: 'Not authenticated' });
return ctx.json(session.user);
```

**Require authentication**:
```typescript
if (!session) throw new HTTPException(401, { message: 'Authentication required' });
```

**Role-based access**:
```typescript
if (session.user.role !== 'admin') {
  throw new HTTPException(403, { message: 'Admin access required' });
}
```

---

## Enhanced Error Handling System

### Core Error Types

**NotFoundError - 404** (with rich context):
```typescript
throw new NotFoundError('Patient not found', {
  resourceType: 'patient',
  resource: patientId,
  suggestions: ['Check patient ID format', 'Verify patient exists']
});
```

**ValidationError - 400**:
```typescript
throw new ValidationError('Invalid email format');
```

**BusinessLogicError - 400**:
```typescript
throw new BusinessLogicError(
  'Cannot schedule appointment: Provider not available',
  'PROVIDER_UNAVAILABLE'
);
```

**UnauthorizedError - 401**:
```typescript
throw new UnauthorizedError('Authentication required');
```

**ForbiddenError - 403**:
```typescript
throw new ForbiddenError('Insufficient permissions to access patient records');
```

### Healthcare-Specific Errors

**HipaaComplianceError**:
```typescript
throw new HipaaComplianceError(
  'Access requires patient consent',
  'patient-consent-rule-1',
  'privacy',
  auditLogId,
  ['Obtain patient consent', 'Verify authorized access']
);
```

**AuthorizationError** (with permission context):
```typescript
throw new AuthorizationError(
  'Insufficient permissions to delete records',
  'patient:delete',
  ['patient:read', 'patient:update'],
  `patient-${patientId}`
);
```

### Service Integration Errors

**TimeoutError - 408**:
```typescript
throw new TimeoutError('Patient lookup timed out', 5000, 'database-query', true);
```

**ExternalServiceError - 503**:
```typescript
throw new ExternalServiceError(
  'Insurance verification failed',
  'insurance-api',
  'verify-coverage',
  'INVALID_POLICY',
  'Policy not found',
  false
);
```

**RateLimitError - 429**:
```typescript
throw new RateLimitError('API rate limit exceeded', { retryAfter: 60 });
```

### Error Response Format

All errors return TypeSpec-compliant structure:
```json
{
  "message": "Patient not found",
  "code": "NOT_FOUND",
  "statusCode": 404,
  "resourceType": "patient",
  "resource": "patient-456",
  "suggestions": ["Check patient ID format"]
}
```

---

## Middleware Patterns

### Logging
```typescript
logger.info({ method: ctx.req.method, path: ctx.req.path, status: ctx.res.status });
```

### CORS
Already configured in `src/index.ts`. See README.md for CORS configuration details.

### Rate Limiting
See Better-Auth configuration for authentication rate limiting.

---

## Best Practices

1. **NO try/catch** unless cleanup is needed
2. Let errors bubble to global handler
3. Use repository pattern for data access
4. Use `baseEntityFields` for all entities
5. Include audit fields (createdBy, updatedBy, deletedBy)
6. Use modern foreign key pattern (entity names, not *Id)
7. Implement field expansion with `shouldExpand`
8. Use query utilities for pagination/filtering
9. Log important operations for audit
10. Validate business rules before operations
11. Use transactions for multi-table operations
12. Use path aliases (`@/core`, `@/handlers`)
13. Keep handlers focused on orchestration
14. Put complex logic in repositories/services
15. Standard pagination: `{data, pagination}` format
16. Reference external library docs (Better-Auth, Drizzle, pg-boss, Pino)

---

## Migration Guide

### From Old to New Pattern

1. Remove unnecessary try/catch blocks
2. Extract data access to repository classes
3. Convert `*Id` foreign keys to entity names
4. Add field expansion support
5. Use query utilities for pagination
6. Simplify handlers with repository method selection
7. Add proper error handling with NotFoundError options
8. Reference library docs instead of duplicating

### Recent Improvements

- Modern foreign key pattern (`.person` not `.personId`)
- Field expansion with `shouldExpand` utility
- Repository cleanup (~470 lines removed)
- Handler simplification (70% complexity reduction)
- Direct schema-API alignment

---

## Quick Reference

### Development Commands
```bash
cd services/api-ts

bun run dev          # Start with hot reload
bun run build        # Build for production
bun run typecheck    # TypeScript checking

bun run db:generate  # Generate migrations
bun run db:studio    # Drizzle Studio

bun test             # Unit tests (in-process only)
# Contract tests live in specs/api/tests/contract; from the repo root:
#   bun run test:contract       (Hurl, blackbox)
#   bun run test:contract:fuzz  (Schemathesis, blackbox)
```

### Before Implementing Features

**⚠️ CRITICAL**: Follow API-First workflow!

1. Define API in TypeSpec
2. Generate OpenAPI + types
3. Implement handler
4. Test endpoint

**Never edit generated files!** See [Root CONTRIBUTING.md](../../CONTRIBUTING.md#code-generation---do-not-edit).

---

## External Documentation

- **Better-Auth**: https://better-auth.com/docs
- **Drizzle ORM**: https://orm.drizzle.team/docs/overview
- **pg-boss**: https://github.com/timgit/pg-boss/blob/master/docs/readme.md
- **Pino**: https://getpino.io/
- **Hono**: https://hono.dev/

---

**For TypeSpec patterns**, see [specs/api/CONTRIBUTING.md](../../specs/api/CONTRIBUTING.md)
