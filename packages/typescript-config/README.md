# `@monobase/typescript-config`

Shared TypeScript configurations for the Monobase Application Platform monorepo.

## Overview

This package provides standardized TypeScript configurations for different project types across the monorepo. All configs extend from a common `base.json` to ensure consistency while allowing customization for specific use cases.

## Available Configurations

| Config | Purpose | Used By |
|--------|---------|---------|
| `base.json` | Base configuration with strict type checking and ES2022 target | Extended by all other configs |
| `api.json` | Backend API services with decorator support | `services/api-ts` |
| `app.json` | Frontend applications built with React | `apps/account` |

## Installation

Add to your package's `devDependencies`:

```json
{
  "devDependencies": {
    "@monobase/typescript-config": "workspace:*"
  }
}
```

## Usage

### Frontend Apps (Vite, React, TanStack Router)

For React-based frontend applications:

```json
{
  "extends": "@monobase/typescript-config/app.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**Example**: `apps/account/tsconfig.json`

### API Services (Hono, Bun)

For backend API services with decorator support:

```json
{
  "extends": "@monobase/typescript-config/api.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"]
}
```

**Example**: `services/api-ts/tsconfig.json`

## Configuration Details

### `base.json`

Base configuration extended by all other configs:

- **Target**: ES2022
- **Module**: ESNext with bundler resolution
- **Strict Mode**: Enabled
- **Library**: es2022, DOM, DOM.Iterable
- **Additional**: Declaration maps, JSON resolution, isolated modules

### `api.json`

Extends `base.json` with backend-specific settings:

- Decorator support (`experimentalDecorators`, `emitDecoratorMetadata`)
- Additional strictness (`noImplicitReturns`, `noFallthroughCasesInSwitch`)
- Library: ES2022 only (no DOM)

### `app.json`

Extends `base.json` with frontend-specific settings:

- JSX: `react-jsx`
- Library: ES2022, DOM, DOM.Iterable

## Common Patterns

### Path Aliases

All configs support custom path aliases. Add them in your project's `tsconfig.json`:

```json
{
  "extends": "@monobase/typescript-config/app.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"]
    }
  }
}
```

### Extending Settings

You can override any setting from the base config:

```json
{
  "extends": "@monobase/typescript-config/api.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "lib": ["ES2023"] // Override if needed
  }
}
```

## License

PROPRIETARY
