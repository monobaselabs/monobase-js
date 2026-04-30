---
name: commit
description: Create a conventional commit with proper format and branch naming. Use after /pre-commit passes and changes are ready to ship.
---

# commit

Create a conventional commit.

## Triggers

- After `/pre-commit` passes
- When changes are ready to be committed

## Workflow

### 1. Review Changes

```bash
git status
git diff
```

### 2. Create Branch (if needed)

Naming conventions:
- `feature/{name}` — new features
- `fix/{name}` — bug fixes
- `chore/{name}` — maintenance
- `docs/{name}` — documentation
- `refactor/{name}` — code refactoring

```bash
git checkout -b feature/{feature-name}
```

### 3. Stage Files

Stage specific files (never `git add -A` or `git add .`):

```bash
git add {file1} {file2} ...
```

Do NOT stage:
- `.env` files
- `credentials.json` or secrets
- `node_modules/`
- Large binary files

### 4. Commit

Format: `<type>(<scope>): <subject>`

Types:
- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation
- `style` — formatting (no logic change)
- `refactor` — code refactoring
- `test` — adding/updating tests
- `chore` — maintenance

Examples:
```bash
git commit -m "feat(booking): add availability search filters"
git commit -m "fix(person): resolve timezone display in profile"
git commit -m "chore(deps): upgrade TanStack Router to v1.80.0"
```

### 5. Push (if requested)

```bash
git push -u origin {branch-name}
```

### 6. Create PR (if requested)

```bash
gh pr create --title "feat(scope): description" --body "## Summary\n- Change 1\n- Change 2\n\n## Test plan\n- [ ] Verified locally"
```

PR requirements:
- Squash and merge for feature branches
- 1 approval minimum (2 for breaking changes)
- All CI checks must pass
