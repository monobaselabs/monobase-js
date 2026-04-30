/**
 * Get Merchant Dashboard Handler
 *
 * Generates a Stripe Express dashboard login link for merchant account management.
 * Link expires in 5 minutes for security.
 */

import type { ValidatedContext } from '@/types/app';
import type { GetMerchantDashboardParams } from '@/generated/openapi/validators';
import { ForbiddenError, NotFoundError, BusinessLogicError, UnauthorizedError } from '@/core/errors';
import type { Session } from '@/types/auth';
import type { BillingService } from '@/core/billing';
import { MerchantAccountRepository } from './repos/billing.repo';
import { addMinutes } from 'date-fns';

/**
 * getMerchantDashboard
 *
 * Path: POST /merchant-accounts/{merchantAccount}/dashboard
 * OperationId: getMerchantDashboard
 *
 * Generate Stripe dashboard login link for merchant account management
 */
export async function getMerchantDashboard(
  ctx: ValidatedContext<never, never, GetMerchantDashboardParams>
): Promise<Response> {
  const database = ctx.get('database');
  const logger = ctx.get('logger');
  const billing = ctx.get('billing') as BillingService;

  // Get authenticated session (guaranteed by middleware)
  const session = ctx.get('session') as Session;
  const user = session.user;

  if (!user) {
    throw new UnauthorizedError('Authentication required for merchant dashboard access');
  }

  // Extract validated parameters
  const params = ctx.req.valid('param') as any;
  let merchantAccountId = params.merchantAccount;

  logger.debug({ merchantAccountId, userId: user.id }, 'Generating merchant dashboard link');

  // Create repository instance
  const merchantAccountRepo = new MerchantAccountRepository(database, logger);

  // Handle special 'me' endpoint - get current user's merchant account
  if (merchantAccountId === 'me') {
    const merchantAccount = await merchantAccountRepo.findByPerson(user.id);
    if (!merchantAccount) {
      throw new NotFoundError('No merchant account found for current user', {
        resourceType: 'merchant-account',
        resource: 'me',
        suggestions: ['Create merchant account first', 'Complete merchant onboarding']
      });
    }
    merchantAccountId = merchantAccount.id;
  }

  // Get merchant account
  const merchantAccount = await merchantAccountRepo.findOneById(merchantAccountId);

  if (!merchantAccount) {
    throw new NotFoundError('Merchant account not found', {
      resourceType: 'merchant-account',
      resource: merchantAccountId,
      suggestions: ['Check merchant account ID format', 'Verify merchant account exists in system']
    });
  }

  // Authorization check: user must be the person who owns the merchant account
  if (merchantAccount.person !== user.id) {
    throw new ForbiddenError('You can only access your own merchant account dashboard');
  }

  // Extract Stripe account ID from metadata
  const stripeAccountId = merchantAccount.metadata?.['stripeAccountId'] as string | undefined;

  if (!stripeAccountId) {
    throw new BusinessLogicError(
      'Merchant account is not connected to Stripe',
      'STRIPE_NOT_CONNECTED'
    );
  }

  // Get account status and dashboard URL from billing service
  const accountStatus = await billing.getConnectAccountStatus(stripeAccountId);

  // Check if onboarding is complete
  if (!accountStatus.onboardingComplete) {
    throw new BusinessLogicError(
      'Merchant onboarding is not complete',
      'ONBOARDING_INCOMPLETE'
    );
  }

  // Check if dashboard URL is available
  if (!accountStatus.dashboardUrl) {
    throw new BusinessLogicError(
      'Dashboard URL is not available',
      'DASHBOARD_UNAVAILABLE'
    );
  }

  logger.info({
    merchantAccountId,
    personId: merchantAccount.person,
    stripeAccountId,
    accountStatus: accountStatus.status
  }, 'Merchant dashboard link generated successfully');

  // Calculate expiration time (Stripe dashboard links expire in 5 minutes)
  const expiresAt = addMinutes(new Date(), 5);

  // Format response to match TypeSpec DashboardResponse model
  const response = {
    dashboardUrl: accountStatus.dashboardUrl,
    expiresAt: expiresAt.toISOString()
  };

  return ctx.json(response, 200);
}
