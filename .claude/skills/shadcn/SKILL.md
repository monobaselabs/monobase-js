---
name: shadcn
description: Add shadcn/ui components to a frontend app using the CLI. NEVER manually create or edit files in src/components/ui/. Use when a component needs a new shadcn/ui primitive.
---

# shadcn

Add shadcn/ui components via CLI.

## Triggers

- Need a new UI component (button, form, input, dialog, etc.)
- Building a form that needs form primitives
- Adding a new page that needs layout components

## Workflow

### 1. Install Components

```bash
cd apps/{app} && bunx shadcn@latest add {component1} {component2} ...
```

Common components:
- Layout: `card`, `separator`, `tabs`, `sheet`, `dialog`
- Form: `form`, `input`, `textarea`, `select`, `checkbox`, `radio-group`, `switch`
- Data: `table`, `badge`, `avatar`
- Feedback: `alert`, `toast`, `skeleton`
- Navigation: `button`, `dropdown-menu`, `command`, `breadcrumb`

### 2. Use in Components

```typescript
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
```

## Critical Rules

- **NEVER** manually create or edit files in `src/components/ui/`
- **ALWAYS** use the CLI: `bunx shadcn@latest add {component}`
- Custom/domain components go in `src/components/{module}/`, not in `ui/`
