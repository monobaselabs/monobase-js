/**
 * Create Merchant Account Handler
 * 
 * Creates a Stripe Connect Express account for a provider to receive payments.
 * Requires provider to be the owner of the account or an admin.
 */

import { 
  ForbiddenError, 
  NotFoundError, 
  ValidationError,
  ConflictError
} from '@/core/errors';
import type { ValidatedContext } from '@/types/app';
import type { CreateMerchantAccountBody } from '@/generated/openapi/validators';
import type { Session } from '@/types/auth';
import { MerchantAccountRepository } from './repos/billing.repo';
import { PersonRepository } from '../person/repos/person.repo';

/**
 * createMerchantAccount
 *
 * Path: POST /billing/merchant-accounts
 * OperationId: createMerchantAccount
 *
 * Create a merchant account for a person to receive payments
 */
export async function createMerchantAccount(
  ctx: ValidatedContext<CreateMerchantAccountBody, never, never>
): Promise<Response> {
  const database = ctx.get('database');
  const logger = ctx.get('logger');
  const billing = ctx.get('billing');

  // Get authenticated session (guaranteed by middleware)
  const session = ctx.get('session') as Session;
  const user = session.user;

  // Extract validated request body
  const body = ctx.req.valid('json');

  const { person: personId = user.id, refreshUrl, returnUrl, metadata } = body;

  logger.info({ personId, userId: user.id }, 'Creating merchant account for person');

  // Create repository instances
  const merchantAccountRepo = new MerchantAccountRepository(database, logger);
  const personRepo = new PersonRepository(database, logger);

  // Check person exists
  const person = await personRepo.findOneById(personId);
  if (!person) {
    throw new NotFoundError('Person not found', {
      resourceType: 'person',
      resource: personId,
      suggestions: ['Check person ID format', 'Verify person exists in system']
    });
  }

  // Check authorization: must be the person themselves
  if (person.id !== user.id) {
    throw new ForbiddenError('You can only create merchant accounts for yourself');
  }

  // Extract email from contactInfo JSONB field (optional - Stripe collects during onboarding)
  const email = person.contactInfo?.email;
  if (!email) {
    logger.warn({ personId }, 'Person missing email - will be collected during Stripe onboarding');
  }

  // Extract country from primaryAddress JSONB field (optional - Stripe collects during onboarding)
  const country = person.primaryAddress?.country;
  if (!country || country.length !== 2) {
    logger.warn({ personId, country }, 'Person missing valid country code - will be collected during Stripe onboarding');
  }
  
  // Check if person already has a merchant account
  const existingAccount = await merchantAccountRepo.findByPerson(personId);
  if (existingAccount) {
    const metadata = existingAccount.metadata as any;
    logger.warn({ personId, existingAccountId: metadata?.stripeAccountId },
      'Person already has a merchant account');

    throw new ConflictError('Person already has a merchant account');
  }
  
  // Prepare Stripe Connect account data
  const businessType = 'individual'; // Default for individual persons

  try {
    logger.info({ personId, email, country }, 'Creating Stripe Connect account');

    const connectAccount = await billing.createConnectAccount({
      email: email || undefined, // Pass if available, undefined if not
      country: country || undefined, // Pass if available, undefined if not
      businessType,
      refreshUrl,
      returnUrl,
      metadata: {
        ...metadata,
        personId,
        userId: user.id
      }
    });

    // Create merchant account record
    // Store all Stripe-specific data in metadata JSONB field
    const merchantAccount = await merchantAccountRepo.createOne({
      person: personId,
      active: true,
      metadata: {
        ...(metadata || {}),
        stripeAccountId: connectAccount.accountId,
        stripeAccountStatus: 'pending',
        onboardingComplete: false,
        onboardingUrl: connectAccount.onboardingUrl,
        ...(email && { email }), // Only include if available
        ...(country && { country }), // Only include if available
        businessType,
        createdBy: user.id,
        createdAt: new Date().toISOString()
      }
    });
    
    logger.info({
      personId,
      merchantAccountId: merchantAccount.id,
      stripeAccountId: connectAccount.accountId,
      onboardingUrl: connectAccount.onboardingUrl
    }, 'Merchant account created successfully');

    // Return response matching TypeSpec schema
    return ctx.json({
      id: merchantAccount.id,
      person: merchantAccount.person,
      active: merchantAccount.active,
      metadata: merchantAccount.metadata,
      createdAt: merchantAccount.createdAt,
      updatedAt: merchantAccount.updatedAt,
    }, 201);
    
  } catch (error) {
    logger.error({
      error,
      personId,
      email,
      country
    }, 'Failed to create merchant account');
    
    if (error instanceof ValidationError || 
        error instanceof ForbiddenError || 
        error instanceof NotFoundError ||
        error instanceof ConflictError) {
      throw error;
    }
    
    throw new Error(`Failed to create merchant account: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
