/**
 * Billing (Stripe Connect) onboarding flow.
 *
 * Resolves the current user's merchant account state and produces the next
 * URL the consumer should redirect to:
 *
 *   - No account exists       → create one and use the returned onboarding URL
 *   - Account exists but not onboarded → fetch a fresh onboarding URL
 *   - Account fully onboarded → return the dashboard link instead
 *
 * Wraps four generated SDK calls into a single decision; saves consumers from
 * branching on `getAccountSetupStatus()` in component code.
 */

import {
  getMerchantAccount,
  createMerchantAccount,
  onboardMerchantAccount,
  getMerchantDashboard,
} from '../generated/sdk.gen';
import type { MerchantAccount } from '../generated/types.gen';
import { SdkError } from '../client';

export type OnboardingStep = 'create' | 'continue' | 'dashboard';

export interface OnboardingResult {
  /** Which branch we ended up on. */
  step: OnboardingStep;
  /** The URL to redirect the user to. */
  url: string;
  /** The merchant account (post-creation if it didn't exist before). */
  account: MerchantAccount;
}

export interface StartOnboardingArgs {
  /** Stripe redirect when the user clicks "back" mid-onboarding. */
  refreshUrl: string;
  /** Stripe redirect after a successful onboarding completion. */
  returnUrl: string;
}

export type AccountSetupStatus = 'none' | 'incomplete' | 'complete';

interface MerchantAccountMetadata {
  onboardingComplete?: boolean;
  dashboardAccessEnabled?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  stripeAccountId?: string;
}

function readMetadata(account: MerchantAccount | null | undefined): MerchantAccountMetadata {
  if (!account || !account.metadata || typeof account.metadata !== 'object') return {};
  return account.metadata as MerchantAccountMetadata;
}

export function isOnboardingComplete(account: MerchantAccount | null | undefined): boolean {
  return readMetadata(account).onboardingComplete === true;
}

export function canAccessDashboard(account: MerchantAccount | null | undefined): boolean {
  return readMetadata(account).dashboardAccessEnabled === true;
}

export function getAccountSetupStatus(account: MerchantAccount | null | undefined): AccountSetupStatus {
  if (!account) return 'none';
  if (!isOnboardingComplete(account)) return 'incomplete';
  return 'complete';
}

/**
 * Fetch the current user's merchant account, returning null on 404 instead of throwing.
 */
export async function getMyMerchantAccount(): Promise<MerchantAccount | null> {
  try {
    const { data } = await getMerchantAccount({
      path: { merchantAccount: 'me' },
      throwOnError: true,
    });
    return data;
  } catch (error) {
    if (error instanceof SdkError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Run the right step of billing onboarding for the current user. The caller
 * always gets back a URL to navigate to next.
 */
export async function startBillingOnboarding(args: StartOnboardingArgs): Promise<OnboardingResult> {
  const existing = await getMyMerchantAccount();

  if (!existing) {
    const { data: account } = await createMerchantAccount({
      body: {
        refreshUrl: args.refreshUrl,
        returnUrl: args.returnUrl,
      },
      throwOnError: true,
    });
    const meta = readMetadata(account);
    return {
      step: 'create',
      url: meta.stripeAccountId ? args.returnUrl : args.refreshUrl,
      account,
    };
  }

  if (!isOnboardingComplete(existing)) {
    const { data: link } = await onboardMerchantAccount({
      path: { merchantAccount: existing.id },
      body: {
        refreshUrl: args.refreshUrl,
        returnUrl: args.returnUrl,
      },
      throwOnError: true,
    });
    return {
      step: 'continue',
      url: link.onboardingUrl,
      account: existing,
    };
  }

  const { data: dashboard } = await getMerchantDashboard({
    path: { merchantAccount: existing.id },
    throwOnError: true,
  });
  return {
    step: 'dashboard',
    url: dashboard.dashboardUrl,
    account: existing,
  };
}
