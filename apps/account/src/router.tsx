// src/router.tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen.ts'
import { NotFound } from '@/components/not-found'
import type { Person } from '@/utils/guards'
import type { User, Session } from 'better-auth'

// ============================================================================
// Router Context Type
// ============================================================================

export interface RouterContext {
  auth: {
    user: User | null
    session: Session | null
    person: Person | null
  }
}

// ============================================================================
// Router Factory
// ============================================================================

export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
    notFoundMode: 'fuzzy',
    context: {
      auth: undefined!,  // Will be provided by RouterProvider
    },
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
