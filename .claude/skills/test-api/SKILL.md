---
name: test-api
description: Run API service unit tests using the Bun test runner. Use after implementing handlers or making backend changes to verify correctness.
---

# test-api

Run API unit tests.

## Triggers

- After implementing or modifying a handler
- After database schema changes
- Before committing backend changes
- When debugging a test failure

## Workflow

### Run All Tests

```bash
cd services/api-ts && bun test
```

### Run Specific Test File

```bash
cd services/api-ts && bun test src/handlers/{module}/{operationId}.test.ts
```

### Run Tests in Watch Mode

```bash
cd services/api-ts && bun test --watch
```

## Test Conventions

- **Suffix**: `.test.ts` (never `.spec.ts` for unit tests)
- **Location**: colocated with source file
  - `src/handlers/person/createPerson.ts` -> `src/handlers/person/createPerson.test.ts`
- **Framework**: `bun:test` (`describe`, `test`, `expect`)
- **Coverage targets**: 100% for critical paths (payment, auth), 80%+ for business logic

## Writing Tests

```typescript
import { describe, test, expect } from 'bun:test';

describe('MyHandler', () => {
  test('creates entity with valid data', async () => {
    // Arrange
    // Act
    // Assert
    expect(result.id).toBeDefined();
  });

  test('returns 400 for invalid data', async () => {
    // Test error cases
  });
});
```

## On Failure

1. Read the error output carefully
2. Identify the failing test and assertion
3. Check if the handler logic matches expectations
4. Check if the test data/setup is correct
5. Fix and re-run
