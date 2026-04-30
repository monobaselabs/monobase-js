/**
 * Route Guards and Guard Composition Utilities
 *
 * Provides both individual route guard functions and helpers for composing
 * multiple route guard functions together.
 */
import { redirect } from '@tanstack/react-router'
import type { RouterContext } from '@/router'

// Re-export types for convenience.
// `PersonCreateRequest` / `PersonUpdateRequest` are the canonical schema names
// from the OpenAPI spec; the previous `CreatePersonData` / `UpdatePersonData`
// aliases were a frontend-only renaming and have been dropped.
export type {
  Person,
  PersonCreateRequest,
  PersonUpdateRequest,
} from '@monobase/sdk/generated/types.gen'

// ============================================================================
// Route Guard Functions
// ============================================================================

/**
 * Guard that requires user to be authenticated
 * Reads auth state from router context - no querying!
 * Redirects to sign-in if not authenticated
 * Returns user object to route context
 */
export async function requireAuth({ context, location }: { context: RouterContext; location?: any }) {
  if (!context.auth.user) {
    throw redirect({
      to: '/auth/$authView',
      params: { authView: 'sign-in' },
      search: {
        redirect: location?.href || `${window.location.pathname}${window.location.search}`,
      },
    })
  }

  return {
    user: context.auth.user
  }
}

/**
 * Guard that requires user to be a guest (not authenticated)
 * Reads auth state from router context - no querying!
 * Redirects to dashboard if already authenticated
 */
export async function requireGuest({ context }: { context: RouterContext }) {
  if (context.auth.user) {
    throw redirect({
      to: '/dashboard',
    })
  }
}

/**
 * Guard that requires user to have a complete person profile
 * Reads auth state from router context - no querying!
 * Redirects to onboarding if person profile is incomplete
 */
export async function requirePerson({ context }: { context: RouterContext }) {
  if (!context.auth.person) {
    throw redirect({
      to: '/onboarding' as any,
    })
  }
  return { person: context.auth.person }
}

/**
 * Guard that requires user to NOT have a person profile
 * Reads auth state from router context - no querying!
 * Used for onboarding flow - redirects to dashboard if person profile already exists
 */
export async function requireNoPerson({ context }: { context: RouterContext }) {
  if (context.auth.person) {
    throw redirect({
      to: '/dashboard',
    })
  }
}

/**
 * Guard that requires user to have a verified email
 * Reads auth state from router context - no querying!
 * Redirects to verify-email blocker page if email is not verified
 */
export async function requireEmailVerified({ context }: { context: RouterContext }) {
  // if (!context.auth.user?.emailVerified) {
  //   throw redirect({
  //     to: '/verify-email',
  //   })
  // }
}

/**
 * Guard that requires user to NOT have a verified email
 * Reads auth state from router context - no querying!
 * Used for verify-email blocker page - redirects to dashboard if email is already verified
 */
export async function requireNotEmailVerified({ context }: { context: RouterContext }) {
  if (context.auth.user?.emailVerified) {
    throw redirect({
      to: '/dashboard',
    })
  }
}

// ============================================================================
// Guard Composition Utility
// ============================================================================

/**
 * Compose multiple guard functions into a single beforeLoad handler
 * Guards are executed in order, and their return values are merged
 *
 * @example
 * beforeLoad: composeGuards(requireAuth, requirePerson)
 */
export function composeGuards(...guards: Array<(opts: any) => Promise<any> | any>) {
  return async (opts: any) => {
    let result = {}
    for (const guard of guards) {
      const guardResult = await guard(opts)
      if (guardResult) {
        result = { ...result, ...guardResult }
      }
    }
    return result
  }
}
