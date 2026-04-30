import { useEffect } from 'react'
import { useSession } from '@monobase/sdk-ts/react/hooks/use-auth'
import { setOneSignalUserId, clearOneSignalUserId } from '@/services/onesignal'

/**
 * OneSignal User ID Sync Hook
 * 
 * Synchronizes the authenticated user's ID with OneSignal for push notifications.
 * Call this hook inside a component that has access to QueryClientProvider and AuthQueryProvider.
 */
export function useOneSignal() {
  const { data: session } = useSession()

  useEffect(() => {
    if (session?.user?.id) {
      // User is logged in - set OneSignal user ID
      setOneSignalUserId(session.user.id)
    } else {
      // User is logged out - clear OneSignal user ID
      clearOneSignalUserId()
    }
  }, [session?.user?.id])
}
