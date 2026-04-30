---
name: db-migrate
description: Create or modify Drizzle ORM database schemas and generate migrations. Use when adding tables, fields, indexes, or relationships to the database.
---

# db-migrate

Modify database schema and generate migrations.

## Triggers

- Adding a new database table
- Adding/modifying fields on existing tables
- Adding indexes or foreign keys
- After `/typespec` when new entities need DB tables

## Workflow

### 1. Edit Schema

Modify `services/api-ts/src/core/database.schema.ts`:

```typescript
import { pgTable, uuid, text, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core';

export const myEntities = pgTable('my_entities', {
  id: uuid('id').defaultRandom().primaryKey(),

  // Required fields
  name: text('name').notNull(),

  // Optional fields
  description: text('description'),

  // Foreign keys
  personId: uuid('person_id').references(() => persons.id).notNull(),

  // JSONB for flexible data
  metadata: jsonb('metadata').$type<{ key: string; value: string }[]>(),

  // Consent fields (when handling sensitive data)
  dataProcessingConsent: jsonb('data_processing_consent').$type<{
    granted: boolean;
    granted_at: string;
    ip_address: string;
    updated_at: string;
    updated_by: string;
  }>(),

  // Timestamps (always include both)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: uuid('created_by'),
}, (table) => [
  // Indexes for frequently queried fields
  index('my_entities_person_id_idx').on(table.personId),
]);
```

Conventions:
- Table names: `snake_case` plural
- Column names: `snake_case`
- Always include `id`, `createdAt`, `updatedAt`
- Always define foreign key references
- Add indexes for frequently queried columns
- Use JSONB for consent fields and flexible config data

### 2. Generate Migration

```bash
cd services/api-ts && bun run db:generate
```

### 3. Review Generated SQL

Check the generated migration in `services/api-ts/src/generated/migrations/`. Verify:
- Correct table/column names
- Proper types
- Foreign key constraints
- Index definitions

### 4. Apply Migration

Migrations apply automatically on server start, or manually:

```bash
cd services/api-ts && bun run db:migrate
```

### 5. Inspect Database (Optional)

```bash
cd services/api-ts && bun run db:studio
# Opens http://localhost:4983
```

## Critical Rules

- NEVER edit generated migration files in `src/generated/migrations/`
- If a migration is wrong, modify the schema and regenerate
- Always include timestamps on all tables
- Always define foreign key relationships
- Use transactions for multi-table operations in handlers
