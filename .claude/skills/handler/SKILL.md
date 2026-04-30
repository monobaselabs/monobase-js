---
name: handler
description: Implement API handler business logic and database repository for a module. Use after /typespec has generated handler stubs. Follows the exact pattern from services/api-ts/src/handlers/person/createPerson.ts.
---

# handler

Implement API handler business logic and repository layer.

## Triggers

- After `/typespec` generates handler stubs that need implementation
- When implementing a new API endpoint
- When modifying existing handler logic

## Workflow

### 1. Check Generated Stub

Open the stub at `services/api-ts/src/handlers/{module}/{operationId}.ts`. It will have a `throw new Error('Not implemented')` placeholder.

### 2. Implement Handler

Follow the pattern from `services/api-ts/src/handlers/person/createPerson.ts`:

```typescript
import type { ValidatedContext } from '@/types/app';
import type { CreateMyEntityBody } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError,
  ConflictError
} from '@/core/errors';
import { MyEntityRepository } from './repos/my-entity.repo';

export async function createMyEntity(
  ctx: ValidatedContext<CreateMyEntityBody>
): Promise<Response> {
  const user = ctx.get('user') as User;
  const body = ctx.req.valid('json');
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');

  const repo = new MyEntityRepository(db, logger);

  // Business logic here
  const entity = await repo.createOne({ ...body, createdBy: user.id });

  // Audit logging
  const audit = ctx.get('audit');
  if (audit) {
    try {
      await audit.logEvent({
        eventType: 'data-modification',
        category: 'privacy',
        action: 'create',
        outcome: 'success',
        user: user.id,
        userType: (user.role === 'user' ? 'client' : user.role || 'client') as 'client' | 'host' | 'admin' | 'system',
        resourceType: 'my-entity',
        resource: entity.id,
        description: 'Entity created',
      });
    } catch (error) {
      logger?.error({ error, entityId: entity.id }, 'Failed to log audit event');
    }
  }

  return ctx.json(entity, 201);
}
```

Key patterns:
- Type handler with `ValidatedContext<BodyType>` from `@/generated/openapi/validators`
- Get user: `ctx.get('user') as User`
- Get validated body: `ctx.req.valid('json')`
- Get deps from context: `database`, `logger`, `audit`
- Instantiate repo with `db` and `logger`
- Always add audit logging for data modifications
- Use error classes: `ForbiddenError`, `NotFoundError`, `ValidationError`, `ConflictError`, `BusinessLogicError`
- Never log PII — only IDs

### 3. Create Repository

Create `services/api-ts/src/handlers/{module}/repos/{module}.repo.ts`:

```typescript
import type { DatabaseInstance } from '@/core/database';
import { myEntities } from '@/core/database.schema';
import { eq } from 'drizzle-orm';
import type { Logger } from '@/types/logger';

export class MyEntityRepository {
  constructor(
    private db: DatabaseInstance,
    private logger: Logger
  ) {}

  async createOne(data: CreateData) {
    const [entity] = await this.db
      .insert(myEntities)
      .values(data)
      .returning();
    return entity;
  }

  async findOneById(id: string) {
    const [entity] = await this.db
      .select()
      .from(myEntities)
      .where(eq(myEntities.id, id))
      .limit(1);
    return entity || null;
  }

  async findMany(filters?: Filters) {
    return await this.db
      .select()
      .from(myEntities);
  }

  async updateOne(id: string, data: UpdateData) {
    const [entity] = await this.db
      .update(myEntities)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(myEntities.id, id))
      .returning();
    return entity;
  }

  async deleteOne(id: string) {
    await this.db
      .delete(myEntities)
      .where(eq(myEntities.id, id));
  }
}
```

Reference: `services/api-ts/src/handlers/person/repos/person.repo.ts`

### 4. Write Unit Test

Create colocated test `services/api-ts/src/handlers/{module}/{operationId}.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
// Test implementation
```

### 5. Verify

```bash
cd services/api-ts && bun test
```

## Critical Rules

- NEVER edit files in `src/generated/`
- Always use Drizzle ORM — no raw SQL
- Always add audit logging for sensitive operations
- Never log PII (names, emails, etc.) — only IDs
- Check consent fields before accessing sensitive data
- Use transactions for multi-table operations
