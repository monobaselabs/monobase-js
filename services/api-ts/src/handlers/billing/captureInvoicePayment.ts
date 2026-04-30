import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError,
  ConflictError
} from '@/core/errors';
import type { ValidatedContext } from '@/types/app';
import type { CaptureInvoicePaymentParams } from '@/generated/openapi/validators';
import type { Session } from '@/types/auth';
import { InvoiceRepository, MerchantAccountRepository } from './repos/billing.repo';
import { PersonRepository } from '../person/repos/person.repo';

/**
 * captureInvoicePayment
 * 
 * Path: POST /invoices/{id}/capture
 * OperationId: captureInvoicePayment
 * 
 * Capture previously authorized invoice payment (provider decision after service delivery)
 */
export async function captureInvoicePayment(
  ctx: ValidatedContext<never, never, CaptureInvoicePaymentParams>
): Promise<Response> {
  const database = ctx.get('database');
  const logger = ctx.get('logger');
  const billing = ctx.get('billing');
  
  // Get authenticated session (guaranteed by middleware)
  const session = ctx.get('session') as Session;

  // Extract validated parameters (no request body for capture)
  const params = ctx.req.valid('param');

  const invoiceId = params.invoice;

  logger.info({ invoiceId }, 'Capturing payment for invoice');
  
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
      logger.error({
        userId: user.id,
        userEmail: user.email,
        invoiceMerchant: invoice.merchant
      }, 'Provider account not found for authenticated user during capture');
      throw new ForbiddenError('Provider account not found for authenticated user');
    }

    // Check if this provider is the merchant on the invoice
    if (authenticatedUserPerson.id !== invoice.merchant) {
      logger.error({
        userId: user.id,
        userProviderId: authenticatedUserPerson.id,
        invoiceMerchant: invoice.merchant
      }, 'Provider ID mismatch - user does not own this invoice');
      throw new ForbiddenError('You can only capture payment for your own invoices');
    }
  }

  // Check for already completed capture (Conflict 409)
  if (invoice.paymentStatus === 'succeeded') {
    throw new ConflictError('Payment has already been captured');
  }

  // Check for already voided payment (Conflict 409)
  if (invoice.paymentStatus === 'canceled') {
    throw new ConflictError('Payment has already been voided');
  }

  // Check if payment is in requires_capture state (authorized and waiting for provider decision)
  if (invoice.paymentStatus !== 'requires_capture') {
    throw new BusinessLogicError(
      'Payment must be authorized (requires_capture) to capture',
      'PAYMENT_NOT_AUTHORIZED'
    );
  }
  
  // Extract Stripe IDs from metadata
  const invoiceMetadata = invoice.metadata as any;
  const providerDecision = invoiceMetadata?.providerDecision;
  const stripePaymentIntentId = invoiceMetadata?.stripePaymentIntentId;

  if (providerDecision) {
    throw new ConflictError('Payment decision has already been made');
  }

  if (!stripePaymentIntentId) {
    throw new BusinessLogicError(
      'No payment intent found for this invoice',
      'PAYMENT_INTENT_MISSING'
    );
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
  if (!metadata?.stripeAccountId) {
    throw new BusinessLogicError(
      'Provider Stripe account not found',
      'STRIPE_ACCOUNT_MISSING'
    );
  }

  try {
    // Capture the payment with Stripe
    const captureResult = await billing.capturePaymentIntent(
      stripePaymentIntentId,
      metadata.stripeAccountId,
      {
        invoiceId,
        capturedBy: user.id,
      }
    );

    // Update invoice with capture details in metadata
    const updatedMetadata = {
      ...invoiceMetadata,
      stripeChargeId: captureResult.chargeId,
      stripeTransferId: captureResult.transferId,
      providerDecision: 'capture',
      providerDecisionAt: new Date().toISOString(),
    };

    await invoiceRepo.updateOneById(invoiceId, {
      paymentStatus: 'succeeded',
      status: 'paid',
      paidAt: new Date(),
      metadata: updatedMetadata,
    });
    
    logger.info(
      {
        invoiceId,
        paymentIntentId: stripePaymentIntentId,
        chargeId: captureResult.chargeId,
        transferId: captureResult.transferId,
        total: invoice.total
      },
      'Payment captured successfully for invoice'
    );

    // Fetch the updated invoice to return
    const updatedInvoice = await invoiceRepo.findOneById(invoiceId);
    if (!updatedInvoice) {
      throw new NotFoundError('Updated invoice not found', {
        resourceType: 'invoice',
        resource: invoiceId
      });
    }

    // Return the full invoice as defined in TypeSpec
    // Expose safe metadata fields for client use
    const safeMetadata = updatedInvoice.metadata ? {
      stripePaymentIntentId: (updatedInvoice.metadata as any)?.stripePaymentIntentId,
      providerDecision: (updatedInvoice.metadata as any)?.providerDecision,
    } : null;

    return ctx.json({
      id: updatedInvoice.id,
      invoiceNumber: updatedInvoice.invoiceNumber,
      customer: updatedInvoice.customer,
      merchant: updatedInvoice.merchant,
      context: updatedInvoice.context,
      status: updatedInvoice.status,
      subtotal: updatedInvoice.subtotal,
      tax: updatedInvoice.tax ?? null,
      total: updatedInvoice.total,
      currency: updatedInvoice.currency,
      paymentCaptureMethod: 'manual',
      paymentDueAt: updatedInvoice.paymentDueAt?.toISOString() ?? null,
      lineItems: [],
      paymentStatus: updatedInvoice.paymentStatus ?? null,
      paidAt: updatedInvoice.paidAt?.toISOString() ?? null,
      paidBy: null,
      voidedAt: updatedInvoice.voidedAt?.toISOString() ?? null,
      voidedBy: null,
      voidThresholdMinutes: null,
      authorizedAt: null,
      authorizedBy: null,
      metadata: safeMetadata,
      createdAt: updatedInvoice.createdAt.toISOString(),
      updatedAt: updatedInvoice.updatedAt.toISOString()
    }, 200);
    
  } catch (error) {
    logger.error({ error, invoiceId }, 'Failed to capture payment');
    
    if (error instanceof ValidationError || error instanceof ConflictError || error instanceof BusinessLogicError) {
      throw error;
    }
    
    throw new BusinessLogicError(
      'Failed to capture payment. Please try again later.',
      'PAYMENT_CAPTURE_ERROR'
    );
  }
}