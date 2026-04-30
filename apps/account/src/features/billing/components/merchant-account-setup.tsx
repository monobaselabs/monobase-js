import { Button } from "@/components/button"
import { CreditCard, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { formatDate } from '@/lib/format-date'

/**
 * Merchant account setup status for UI display
 */
export type MerchantAccountSetupStatus = 'none' | 'incomplete' | 'complete'

/**
 * Props for merchant account setup form component
 */
export interface MerchantAccountFormProps {
  /**
   * Current merchant account data (null if not created yet)
   */
  account: {
    id: string
    metadata?: {
      onboardingStartedAt?: string
    }
  } | null

  /**
   * Setup status derived from account state
   */
  status: MerchantAccountSetupStatus

  /**
   * Loading state for async operations
   */
  isLoading: boolean

  /**
   * Called when user clicks "Set Up" or "Continue Setup"
   * Should handle creating account and opening Stripe onboarding
   */
  onSetupAccount: () => void

  /**
   * Called when user clicks "Continue" after completing setup
   */
  onSubmit: () => void

  /**
   * Called when user clicks "Skip for now"
   */
  onSkip: () => void

  /**
   * Whether to show action buttons (Submit/Skip)
   * Default: true
   */
  showButtons?: boolean
}

/**
 * Merchant Account Setup Form
 * 
 * A component for handling Stripe Connect merchant account onboarding.
 * Displays different states based on account status (none, incomplete, complete).
 * 
 * @example
 * ```tsx
 * import { MerchantAccountSetup } from '@/features/billing/components/merchant-account-setup'
 * import { useMyMerchantAccount, useMyMerchantAccountStatus } from '@monobase/sdk-ts/react/hooks/use-billing'
 * 
 * function OnboardingPage() {
 *   const { data: account, isLoading } = useMyMerchantAccount()
 *   const status = useMyMerchantAccountStatus()
 *   const createAccount = useCreateMyMerchantAccount()
 * 
 *   return (
 *     <MerchantAccountSetup
 *       account={account}
 *       status={status}
 *       isLoading={isLoading}
 *       onSetupAccount={async () => {
 *         const refreshUrl = window.location.href
 *         const returnUrl = '/dashboard'
 *         await createAccount.mutateAsync({ refreshUrl, returnUrl })
 *       }}
 *       onSubmit={() => router.navigate('/dashboard')}
 *       onSkip={() => router.navigate('/dashboard')}
 *     />
 *   )
 * }
 * ```
 */
export function MerchantAccountSetup({
  account,
  status,
  isLoading,
  onSetupAccount,
  onSubmit,
  onSkip,
  showButtons = true,
}: MerchantAccountFormProps) {
  // Show loading skeleton while fetching initial status
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-dashed p-8">
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-12 w-12 text-muted-foreground animate-spin" aria-hidden="true" />
            <div className="h-4 w-48 bg-muted animate-pulse rounded" />
            <div className="h-3 w-64 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </div>
    )
  }

  const renderContent = () => {
    // Complete setup
    if (status === 'complete') {
      return (
        <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-600 mb-4" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-green-900 mb-2">Merchant Account Connected</h3>
          <p className="text-sm text-green-700 mb-4">
            Your payment account is fully set up and ready to accept payments.
          </p>
          <p className="text-xs text-green-600">
            You can manage your account settings from the dashboard.
          </p>
        </div>
      )
    }

    // Incomplete onboarding
    if (status === 'incomplete') {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-amber-600 mb-4" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-amber-900 mb-2">Complete Your Payment Setup</h3>
          <p className="text-sm text-amber-700 mb-4">
            Your payment account onboarding is incomplete.
            {account?.metadata?.onboardingStartedAt && (
              <> Started {formatDate(new Date(account.metadata.onboardingStartedAt), { format: 'medium' })}.</>
            )}
            {' '}Complete the process to start accepting payments.
          </p>
          <Button
            onClick={onSetupAccount}
            disabled={isLoading}
            className="mx-auto"
            aria-label="Continue payment account onboarding setup"
          >
            {isLoading ? 'Loading...' : 'Continue Setup'}
          </Button>
        </div>
      )
    }

    // No account yet
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
        <h3 className="text-lg font-semibold mb-2">Merchant Account Setup</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Connect your payment account to receive payments for your services.
          This will redirect you to complete the setup process.
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          You can also set this up later from your dashboard settings.
        </p>
        <Button
          onClick={onSetupAccount}
          disabled={isLoading}
          className="mx-auto"
          aria-label="Set up merchant account"
        >
          {isLoading ? 'Setting up...' : 'Set Up Payment Account'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {renderContent()}

      {showButtons && (
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onSkip} disabled={isLoading}>
            Skip for now
          </Button>
          {status === 'complete' && (
            <Button type="button" onClick={onSubmit} disabled={isLoading}>
              Continue
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
