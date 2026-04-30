---
name: test-e2e
description: Run Playwright E2E tests for frontend apps. Use after implementing frontend features or before shipping UI changes.
---

# test-e2e

Run Playwright E2E tests for the account app (UI/browser flows).

For **API contract / wire-shape verification**, use `/test-contract` instead — the Hurl suite under `specs/api/tests/contract/` is the source of truth for API behavior and runs in seconds.

## Triggers

- After implementing a frontend feature
- Before shipping UI changes
- When verifying user flows end-to-end (browser-rendered)

## Workflow

### Run E2E Tests

```bash
cd apps/account && bun run test:e2e
```

### Run in UI Mode (Interactive)

```bash
cd apps/account && bun run test:e2e:ui
```

## Test Conventions

- **Suffix**: `.spec.ts` (never `.test.ts` for E2E)
- **Location**: `tests/e2e/` directory (NOT colocated with source)
- **Framework**: Playwright

### Directory Structure

```
tests/e2e/
├── *.spec.ts              # Test files
├── pages/                 # Page Object Model classes
│   └── {page}.page.ts
├── fixtures/              # Test data factories
│   └── test-data.ts
└── helpers/               # Shared utilities
    └── auth-helpers.ts
```

## Writing E2E Tests

### Test File

```typescript
// tests/e2e/my-feature.spec.ts
import { test, expect } from '@playwright/test';

test('user can create entity', async ({ page }) => {
  await page.goto('/my-entities');
  await page.click('text=Create New');
  await page.fill('[name="name"]', 'Test Entity');
  await page.click('button[type="submit"]');
  await expect(page.locator('text=Created successfully')).toBeVisible();
});
```

### Page Object

```typescript
// tests/e2e/pages/my-entity.page.ts
import { Page, Locator } from '@playwright/test';

export class MyEntityPage {
  readonly page: Page;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createButton = page.getByRole('button', { name: 'Create New' });
  }

  async goto() {
    await this.page.goto('/my-entities');
  }
}
```

### Test Data Fixture

```typescript
// tests/e2e/fixtures/test-data.ts
import { faker } from '@faker-js/faker';

export function makeTestEntity(overrides = {}) {
  return {
    name: faker.lorem.words(3),
    description: faker.lorem.sentence(),
    ...overrides,
  };
}
```

## Playwright Config

Config is at `playwright.config.ts`:
- `testDir: './tests/e2e'`
- `testMatch: '**/*.spec.ts'`
