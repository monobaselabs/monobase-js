/**
 * Get Merchant Account Handler
 *
 * Retrieves a merchant account by ID.
 * Follows TypeSpec billing.tsp definition with TypeSpec-aligned schema.
 */

import type { ValidatedContext } from '@/types/app';
import type { GetMerchantAccountParams } from '@/generated/openapi/validators';
import { ForbiddenError, NotFoundError, ValidationError } from '@/core/errors';
import type { Session } from '@/types/auth';
import type { User } from '@/types/auth';
import { MerchantAccountRepository } from './repos/billing.repo';

/**
 * getMerchantAccount
 *
 * Path: GET /merchant-accounts/{merchantAccount}
 * OperationId: getMerchantAccount
 *
 * Get merchant account by ID with authorization checks
 */
export async function getMerchantAccount(
  ctx: ValidatedContext<never, never, GetMerchantAccountParams>
): Promise<Response> {
  // Check if this is an internal expand request
  const isInternalExpand = ctx.get('isInternalExpand');

  const database = ctx.get('database');
  const logger = ctx.get('logger');

  // Get authenticated user (may be undefined for internal expand requests)
  const user = ctx.get('user') as User | undefined;

  // Extract validated parameters
  const params = ctx.req.valid('param') as any;

  let merchantAccountId = params.merchantAccount;

  logger.debug({ merchantAccountId, userId: user?.id, isInternalExpand }, 'Getting merchant account');

  // Create repository instance
  const merchantAccountRepo = new MerchantAccountRepository(database, logger);

  // Handle special 'me' endpoint - get current user's merchant account
  if (merchantAccountId === 'me') {
    if (!user) {
      throw new ValidationError('"me" parameter not supported for internal expand requests');
    }
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

  // Get merchant account (expand handled automatically by middleware)
  const merchantAccount = await merchantAccountRepo.findOneById(merchantAccountId);

  if (!merchantAccount) {
    throw new NotFoundError('Merchant account not found', {
      resourceType: 'merchant-account',
      resource: merchantAccountId,
      suggestions: ['Check merchant account ID format', 'Verify merchant account exists in system']
    });
  }

  // Skip authorization for internal expand requests (already authorized at parent resource level)
  if (!isInternalExpand) {
    // Authorization check: user must be the person who owns the merchant account
    let personId: string | null = null;
    if (typeof merchantAccount.person === 'string') {
      personId = merchantAccount.person;
    } else if (merchantAccount.person && typeof merchantAccount.person === 'object' && 'id' in merchantAccount.person) {
      personId = (merchantAccount.person as { id: string }).id;
    }
    
    if (personId !== user?.id) {
      throw new ForbiddenError('You can only access your own merchant account');
    }
  }

  logger.info({
    merchantAccountId,
    personId: merchantAccount.person,
    metadata: merchantAccount.metadata,
    active: merchantAccount.active
  }, 'Merchant account retrieved successfully');

  // Format response to match TypeSpec MerchantAccount model
  const response = {
    id: merchantAccount.id,
    person: merchantAccount.person,
    active: merchantAccount.active,
    metadata: merchantAccount.metadata,
    createdAt: merchantAccount.createdAt.toISOString(),
    updatedAt: merchantAccount.updatedAt.toISOString(),
    version: merchantAccount.version
  };

  return ctx.json(response, 200);
}