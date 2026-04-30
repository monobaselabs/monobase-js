import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError,
  ConflictError
} from '@/core/errors';
import type { ValidatedContext } from '@/types/app';
import type { RefundInvoicePaymentBody, RefundInvoicePaymentParams } from '@/generated/openapi/validators';
import type { Session } from '@/types/auth';
import { InvoiceRepository, MerchantAccountRepository } from './repos/billing.repo';
import { PersonRepository } from '../person/repos/person.repo';

/**
 * refundInvoicePayment
 * 
 * Path: POST /invoices/{id}/refund
 * OperationId: refundInvoicePayment
 * 
 * Create a refund for a captured invoice payment
 */
export async function refundInvoicePayment(
  ctx: ValidatedContext<RefundInvoicePaymentBody, never, RefundInvoicePaymentParams>
): Promise<Response> {
  const database = ctx.get('database');
  const logger = ctx.get('logger');
  const billing = ctx.get('billing');
  
  // Get authenticated session (guaranteed by middleware)
  const session = ctx.get('session') as Session;
  
  // Extract validated parameters and request body
  const params = ctx.req.valid('param');
  const body = ctx.req.valid('json');

  const invoiceId = params.invoice;
  const { amount, reason, metadata: requestMetadata } = body;
  const notes = (requestMetadata?.['notes'] as string | undefined) || '';

  logger.info({ invoiceId, amount, reason, notes }, 'Creating refund for invoice');
  
  // Create repository instances
  const invoiceRepo = new InvoiceRepository(database, logger);
  const merchantAccountRepo = new MerchantAccountRepository(database, logger);
  const personRepo = new PersonRepository(database, logger);

  // Get the invoice record
  const invoice = await invoiceRepo.findOneById(invoiceId);
  if (!invoice) {
    throw new NotFoundError('Invoice not found', {
      resourceType: 'invoice',
      resource: invoiceId,
      suggestions: ['Check invoice ID', 'Verify invoice exists', 'Check invoice status']
    });
  }

  // Authorization check: provider:owner or admin
  const user = session.user;
  const userRoles = user.role ? user.role.split(',').map(r => r.trim()) : [];
  const isAdmin = userRoles.includes('admin');

  if (!isAdmin) {
    // Non-admin users must be the provider (owner)
    // Find the provider account for the authenticated user
    const authenticatedUserPerson = await personRepo.findOneById(user.id);
    if (!authenticatedUserPerson) {
      throw new ForbiddenError('Provider account not found for authenticated user');
    }

    // Check if this provider is the merchant on the invoice
    if (authenticatedUserPerson.id !== invoice.merchant) {
      throw new ForbiddenError('You do not have permission to refund this invoice');
    }
  }
  
  // Check if payment is in succeeded state (captured)
  if (invoice.paymentStatus !== 'succeeded') {
    throw new BusinessLogicError(
      'Payment must be captured before it can be refunded',
      'PAYMENT_NOT_CAPTURED'
    );
  }

  // Extract Stripe IDs and refund info from metadata
  const invoiceMetadata = invoice.metadata as any;
  const stripePaymentIntentId = invoiceMetadata?.stripePaymentIntentId;
  const stripeChargeId = invoiceMetadata?.stripeChargeId;
  const refundAmount = invoiceMetadata?.refundAmount;
  const refundStatus = invoiceMetadata?.refundStatus;

  if ((refundAmount && parseFloat(refundAmount) > 0) || refundStatus) {
    throw new ConflictError('Invoice has already been refunded');
  }

  if (!stripeChargeId) {
    throw new BusinessLogicError(
      'No charge found for this invoice',
      'CHARGE_MISSING'
    );
  }
  
  // Validate refund amount
  const maxRefundAmountCents = invoice.total; // already in cents
  const refundAmountCents = amount ? Math.min(amount, maxRefundAmountCents) : maxRefundAmountCents;
  
  if (refundAmountCents <= 0) {
    throw new ValidationError('Refund amount must be greater than 0');
  }
  
  // Get the merchant account for the merchant person
  const merchantAccount = await merchantAccountRepo.findByPerson(invoice.merchant);
  if (!merchantAccount) {
    throw new NotFoundError('Merchant account not found', {
      resourceType: 'merchant-account',
      resource: invoice.merchant,
      suggestions: ['Check merchant person ID format', 'Verify merchant person exists in system', 'Complete billing setup']
    });
  }
  
  const metadata = merchantAccount.metadata as any;
  const stripeAccountId = metadata?.stripeAccountId as string;
  if (!stripeAccountId) {
    throw new BusinessLogicError(
      'Provider Stripe account not found',
      'STRIPE_ACCOUNT_MISSING'
    );
  }

  try {
    // Create refund with Stripe
    const refundResult = await billing.createRefund({
      paymentIntentId: stripePaymentIntentId,
      amount: refundAmountCents,
      reason: reason as 'requested_by_customer' | 'duplicate' | 'fraudulent' | undefined,
      connectedAccountId: stripeAccountId,
      metadata: {
        invoiceId,
        refundedBy: user.id,
        refundNotes: notes || '',
        refundReason: reason || '',
      },
    });

    const refundAmountDecimal = (refundAmountCents / 100).toFixed(2);
    const isFullRefund = refundAmountCents === maxRefundAmountCents;

    // Update invoice with refund details in metadata
    const updatedMetadata: Record<string, any> = {
      ...(invoiceMetadata || {}),
      stripeRefundId: refundResult.refundId,
      refundAmount: refundAmountDecimal,
      refundReason: reason || 'requested_by_customer',
      refundedAt: new Date().toISOString(),
      refundStatus: isFullRefund ? 'full_refund' : 'partial_refund',
    };

    await invoiceRepo.updateOneById(invoiceId, {
      // Keep paymentStatus as 'succeeded' since enum doesn't have refunded status
      // Refund tracking is in metadata
      metadata: updatedMetadata,
    });

    logger.info(
      {
        invoiceId,
        paymentIntentId: stripePaymentIntentId,
        refundId: refundResult.refundId,
        refundAmount: refundAmountCents,
        reason,
        notes
      },
      'Refund created successfully for invoice'
    );

    // Return the response as defined in TypeSpec
    return ctx.json({
      refundedAmount: refundAmountCents,
      metadata: {
        refundId: refundResult.refundId,
        status: refundResult.status,
        refundedAt: new Date().toISOString(),
        reason: reason || 'requested_by_customer',
      }
    }, 200);
    
  } catch (error) {
    logger.error({ error, invoiceId, refundAmount: refundAmountCents, reason }, 'Failed to create refund');
    
    if (error instanceof ValidationError || error instanceof ConflictError || error instanceof BusinessLogicError) {
      throw error;
    }
    
    throw new BusinessLogicError(
      'Failed to create refund. Please try again later.',
      'REFUND_ERROR'
    );
  }
}