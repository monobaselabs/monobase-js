/**
 * Authentication hooks for Better-Auth with TanStack Query integration
 *
 * This file provides auth hooks that integrate Better-Auth with TanStack Query.
 * The hooks are lazily initialized on first use with the auth client from context.
 *
 * Use these hooks when you need programmatic access to auth state and actions.
 * For pre-built UI components, use Better-Auth UI components instead.
 *
 * @see https://github.com/daveyplate/better-auth-tanstack
 */
import { createAuthHooks } from '@daveyplate/better-auth-tanstack'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthClient, type AuthClient } from '../auth'

export { useAuthClient }

// Module-level cache for auth hooks (initialized lazily)
let cachedHooks: ReturnType<typeof createAuthHooks> | null = null

/**
 * Get or create auth hooks
 * This ensures hooks are created only once with the first available client
 */
function getOrCreateAuthHooks(client: AuthClient) {
  if (!cachedHooks) {
    cachedHooks = createAuthHooks(client)
  }
  return cachedHooks
}

// Wrapper hooks that ensure auth client is available
export function useSession() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useSession()
}

export function usePrefetchSession() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.usePrefetchSession()
}

export function useToken() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useToken()
}

export function useListAccounts() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useListAccounts()
}

export function useListSessions() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useListSessions()
}

export function useListDeviceSessions() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useListDeviceSessions()
}

export function useListPasskeys() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useListPasskeys()
}

export function useUpdateUser() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useUpdateUser()
}

export function useUnlinkAccount() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useUnlinkAccount()
}

export function useRevokeOtherSessions() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useRevokeOtherSessions()
}

export function useRevokeSession() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useRevokeSession()
}

export function useRevokeSessions() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useRevokeSessions()
}

export function useSetActiveSession() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useSetActiveSession()
}

export function useRevokeDeviceSession() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useRevokeDeviceSession()
}

export function useDeletePasskey() {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useDeletePasskey()
}

export function useAuthQuery(...args: Parameters<ReturnType<typeof createAuthHooks>['useAuthQuery']>) {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useAuthQuery(...args)
}

export function useAuthMutation(...args: Parameters<ReturnType<typeof createAuthHooks>['useAuthMutation']>) {
  const client = useAuthClient()
  const hooks = getOrCreateAuthHooks(client)
  return hooks.useAuthMutation(...args)
}

// Custom hooks
export function useSignOut() {
  const authClient = useAuthClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      return authClient.signOut()
    },
    onSuccess: () => {
      // Invalidate session after sign out
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

export function useEmailVerification() {
  const authClient = useAuthClient()

  return useAuthMutation({
    queryKey: ['email-verification'],
    mutationFn: async ({ email, callbackURL }: { email: string; callbackURL?: string }) => {
      return authClient.sendVerificationEmail({
        email,
        callbackURL: callbackURL || window.location.origin + '/dashboard',
      })
    },
  })
}
