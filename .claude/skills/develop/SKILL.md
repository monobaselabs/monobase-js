---
name: develop
description: Orchestrator agent that takes a PRD or feature description and drives end-to-end implementation by dispatching the right skills in the right order. Use when given a PRD, feature spec, or multi-step development task.
---

# develop

Orchestrator agent for end-to-end feature development.

## Triggers

- User provides a PRD or feature description
- User says "build this", "implement this", "develop this"
- Multi-step development task spanning backend + frontend

## Workflow

### Phase 1: Plan

1. Run `/prd` to analyze requirements and produce a structured implementation plan
2. **STOP** — present the plan to the user for review and approval
3. Incorporate feedback before proceeding

### Phase 2: API Contract (per module)

For each new/modified module in the plan:

1. Run `/typespec` — create TypeSpec definitions and generate code
2. **STOP** — show the user the TypeSpec design for review
3. Verify generation succeeded (no errors)

### Phase 3: Backend (per module)

For each module:

1. Run `/db-migrate` — create/update database schema and generate migration
2. Run `/handler` — implement handler business logic + repository
3. Run `/test-api` — verify backend tests pass
4. Run `/typecheck` — verify types are clean

### Phase 4: Frontend (per module, if applicable)

For each module that needs UI:

1. Run `/shadcn` — install any needed UI components
2. Run `/frontend-module` — build API client, hooks, components, routes
3. Run `/typecheck` — verify frontend types are clean

### Phase 5: Integration

2. Run `/pre-commit` — full verification checklist

### Phase 6: Ship

1. Run `/commit` — create conventional commit
2. If requested: push and create PR

## Decision Logic

### When to skip phases

- **Backend-only task** (no UI): skip Phase 4
- **Frontend-only task** (API exists): skip Phase 2 + 3
- **Existing module modification**: skip TypeSpec if contract unchanged
- **Bug fix**: may only need `/handler` or `/frontend-module` + tests

### Dependency order

```
TypeSpec → DB Schema → Handlers → Frontend → Tests → Ship
```

Never implement handlers before TypeSpec is generated.
Never implement frontend before handlers exist.
Always test before shipping.

### Human checkpoints

Always pause for user review at:
1. After `/prd` plan output
2. After `/typespec` design (for new modules)
3. Before `/commit` (show `git diff`)

### Multi-module tasks

When the plan involves multiple modules:
1. Process modules in dependency order (e.g., person before booking)
2. Complete each module's backend before starting its frontend
3. Run tests after each module, not just at the end

## Example Flow

User provides a PRD for a "Reviews" feature:

```
1. /prd → plan: new reviews module, 4 endpoints, 1 DB table, 1 frontend page
   [PAUSE for approval]

2. /typespec → create specs/api/src/modules/reviews.tsp, generate code
   [PAUSE for review]

3. /db-migrate → add reviews table to database.schema.ts
4. /handler → implement createReview, getReview, listReviews, deleteReview
5. /test-api → verify tests pass

6. /shadcn → add card, star-rating if needed
7. /frontend-module → build reviews UI module
8. /typecheck → verify all types

9. /pre-commit → full checks pass
10. /commit → feat(reviews): add NPS review system
```
