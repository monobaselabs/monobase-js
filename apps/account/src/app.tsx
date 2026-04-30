import { RouterProvider } from '@tanstack/react-router'
import { ApiProvider } from '@monobase/sdk/react/provider'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import { createRouter } from './router'
import { initializeOneSignal } from '@/services/onesignal'
import { useSession } from '@monobase/sdk/react/hooks/use-auth'
import { useQuery } from '@tanstack/react-query'
import { getPersonOptions } from '@monobase/sdk/generated/@tanstack/react-query.gen'
import { SdkError } from '@monobase/sdk/client'
import { useOneSignal } from '@/hooks/use-onesignal'
import { getRuntimeConfig } from '@/utils/config'
import { Loading } from '@/components/loading'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { useState, useEffect } from 'react'

const router = createRouter()

/**
 * Inner app component that provides auth context to router
 * This must be inside QueryClientProvider and AuthQueryProvider to access auth hooks
 */
function InnerApp() {
  // sync OneSignal user ID with auth state
  useOneSignal()

  // Wait for session to load before rendering router
  // This ensures router guards have correct auth context from the start
  // Use isPending (not isLoading) to avoid blocking during retries/refetches
  const { data: session, isPending: sessionPending } = useSession()
  // 404 just means "no person profile yet" — surface it as null instead of
  // an error so guards can route to onboarding without thrashing.
  const personQuery = useQuery({
    ...getPersonOptions({ path: { person: 'me' } }),
    retry: (failureCount, error) => {
      if (error instanceof SdkError && error.status === 404) return false
      return failureCount < 3
    },
  })
  const personPending = personQuery.isPending
  const person =
    personQuery.error instanceof SdkError && personQuery.error.status === 404
      ? null
      : personQuery.data ?? null

  // Show loading only on very first fetch before any data/error is received
  if (sessionPending || personPending) {
    return <Loading />
  }

  // Handle post-signup redirect
  // If user just signed up (has session but no person), redirect to onboarding
  if (session?.user && !person && window.location.pathname.includes('/auth/')) {
    window.location.href = '/onboarding'
    return <Loading />
  }

  // build context
  const context = {
    auth: {
      session: session?.session || null,
      user: session?.user || null,
      person: person || null,
    }
  }
  return <RouterProvider router={router} context={context} />
}

/**
 * Root app component with all providers
 * Fetches runtime config and initializes services before rendering
 */
function App() {
  const [config, setConfig] = useState<{ apiUrl: string; onesignalAppId: string } | null>(null)

  useEffect(() => {
    getRuntimeConfig().then(runtimeConfig => {
      console.log('[App] Runtime config loaded:', runtimeConfig)
      setConfig(runtimeConfig)
      
      // Initialize OneSignal with runtime config (optional - only if app ID is set)
      if (runtimeConfig.onesignalAppId) {
        initializeOneSignal()
      }
    })
  }, [])

  // Show loading while fetching runtime config
  if (!config) {
    return <Loading />
  }

  return (
    <ApiProvider apiBaseUrl={config.apiUrl} notifier={toast}>
      <InnerApp />
      <TanStackDevtools
        config={{ position: 'bottom-right' }}
        plugins={[
          {
            name: 'TanStack Query',
            render: <ReactQueryDevtoolsPanel />
          },
          {
            name: 'TanStack Router',
            render: <TanStackRouterDevtoolsPanel />
          }
        ]}
      />
    </ApiProvider>
  )
}

// Pure SPA mode with TanStack Router
createRoot(document.getElementById('root')!).render(<App />)
