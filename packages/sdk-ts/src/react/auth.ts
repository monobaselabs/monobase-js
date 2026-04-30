/**
 * Auth client for React
 * 
 * This module provides Better-Auth client initialization and React context
 * for accessing the auth client throughout the application.
 */
import { createContext, useContext } from 'react'
import { createAuthClient } from "better-auth/react"
import { passkeyClient, twoFactorClient } from "better-auth/client/plugins"

// ============================================================================
// Auth Client Configuration
// ============================================================================

export interface AuthConfig {
  baseURL: string
}

export function createAuth(config: AuthConfig) {
  return createAuthClient({
    baseURL: `${config.baseURL}/auth`,
    plugins: [
      passkeyClient(),
      twoFactorClient(),
    ],
  })
}

export type AuthClient = ReturnType<typeof createAuth>

// ============================================================================
// React Context
// ============================================================================

/**
 * React context for the auth client
 * Provided by ApiProvider
 */
export const AuthClientContext = createContext<AuthClient | null>(null)

/**
 * Initialize the auth client with the given base URL
 * Called by ApiProvider during setup
 */
export function initAuthClient(baseURL: string): AuthClient {
  return createAuth({ baseURL })
}

/**
 * Hook to access the auth client from context
 * Must be used within ApiProvider
 */
export function useAuthClient(): AuthClient {
  const authClient = useContext(AuthClientContext)
  if (!authClient) {
    throw new Error(
      'Auth client not initialized. Make sure ApiProvider is mounted before using auth hooks.'
    )
  }
  return authClient
}
