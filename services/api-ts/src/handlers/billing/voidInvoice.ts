import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError,
  ConflictError
} from '@/core/errors';
import type { ValidatedContext } from '@/types/app';
import type { VoidInvoiceParams } from '@/generated/openapi/validators';
import type { Session } from '@/types/auth';
import { InvoiceRepository, MerchantAccountRepository } from './repos/billing.repo';
import { PersonRepository } from '../person/repos/person.repo';

/**
 * voidInvoice
 * 
 * Path: POST /invoices/{id}/void
 * OperationId: voidInvoice
 * 
 * Void invoice by canceling the authorized payment intent
 */
export async function voidInvoice(
  ctx: ValidatedContext<never, never, VoidInvoiceParams>
): Promise<Response> {
  const database = ctx.get('database');
  const logger = ctx.get('logger');
  const billing = ctx.get('billing');
  
  // Get authenticated session (guaranteed by middleware)
  const session = ctx.get('session') as Session;
  
  // Extract validated parameters (no request body for void)
  const params = ctx.req.valid('param');

  const invoiceId = params.invoice;

  logger.info({ invoiceId }, 'Voiding invoice');
  
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
      throw new ForbiddenError('You can only void your own invoices');
    }
  }

  // Check for already voided payment (Conflict 409)
  if (invoice.paymentStatus === 'canceled') {
    throw new ConflictError('Payment has already been voided');
  }

  // Check for already captured payment (Conflict 409)
  if (invoice.paymentStatus === 'succeeded') {
    throw new ConflictError('Payment has already been captured and cannot be voided');
  }

  // Check if payment is in requires_capture state (authorized and waiting for provider decision)
  if (invoice.paymentStatus !== 'requires_capture') {
    throw new BusinessLogicError(
      'Payment must be authorized (requires_capture) to void',
      'PAYMENT_NOT_AUTHORIZED'
    );
  }

  // Extract Stripe IDs and provider decision from metadata
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
    // Cancel the payment intent with Stripe
    const cancelResult = await billing.cancelPaymentIntent(
      stripePaymentIntentId,
      metadata.stripeAccountId,
      'Voided by provider'
    );

    // Update invoice with void details in metadata
    const updatedMetadata = {
      ...invoiceMetadata,
      providerDecision: 'void',
      providerDecisionAt: new Date().toISOString(),
    };

    await invoiceRepo.updateOneById(invoiceId, {
      paymentStatus: 'canceled',
      status: 'void',
      voidedAt: new Date(),
      metadata: updatedMetadata,
    });

    logger.info(
      {
        invoiceId,
        paymentIntentId: stripePaymentIntentId,
        total: invoice.total
      },
      'Invoice voided successfully'
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
    logger.error({ error, invoiceId }, 'Failed to void invoice');
    
    if (error instanceof ValidationError || error instanceof ConflictError || error instanceof BusinessLogicError) {
      throw error;
    }
    
    throw new BusinessLogicError(
      'Failed to void invoice. Please try again later.',
      'INVOICE_VOID_ERROR'
    );
  }
}