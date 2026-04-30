/**
 * Mark Invoice Uncollectible Handler
 *
 * Marks an invoice as uncollectible.
 * Follows TypeSpec billing.tsp definition with current schema adaptation.
 */

import {
  ForbiddenError,
  NotFoundError,
  BusinessLogicError
} from '@/core/errors';
import type { ValidatedContext } from '@/types/app';
import type { MarkInvoiceUncollectibleParams } from '@/generated/openapi/validators';
import type { Session } from '@/types/auth';
import { InvoiceRepository } from './repos/billing.repo';
import { PersonRepository } from '../person/repos/person.repo';

/**
 * markInvoiceUncollectible
 *
 * Path: POST /invoices/{invoice}/mark-uncollectible
 * OperationId: markInvoiceUncollectible
 *
 * Mark invoice as uncollectible
 */
export async function markInvoiceUncollectible(
  ctx: ValidatedContext<never, never, MarkInvoiceUncollectibleParams>
): Promise<Response> {
  const database = ctx.get('database');
  const logger = ctx.get('logger');

  // Get authenticated session (guaranteed by middleware)
  const session = ctx.get('session') as Session;
  const user = session.user;

  // Extract validated parameters
  const params = ctx.req.valid('param') as any;
  const invoiceId = params.invoice;

  logger.info({ invoiceId, userId: user.id }, 'Marking invoice as uncollectible');

  // Create repository instances
  const invoiceRepo = new InvoiceRepository(database, logger);
  const personRepo = new PersonRepository(database, logger);

  // Get existing invoice
  const invoice = await invoiceRepo.findOneById(invoiceId);

  if (!invoice) {
    throw new NotFoundError('Invoice not found', {
      resourceType: 'invoice',
      resource: invoiceId,
      suggestions: ['Check invoice ID format', 'Verify invoice exists in system']
    });
  }

  // Authorization check: must be the provider who created the invoice
  const merchantPerson = await personRepo.findOneById(invoice.merchant);
  if (!merchantPerson) {
    throw new NotFoundError('Merchant person not found', {
      resourceType: 'person',
      resource: invoice.merchant,
      suggestions: ['Check merchant person ID format', 'Verify merchant person exists in system']
    });
  }

  if (merchantPerson.id !== user.id) {
    throw new ForbiddenError('You can only mark invoices as uncollectible for your own provider profile');
  }

  // Business rule: only open invoices can be marked as uncollectible
  if (invoice.status !== 'open') {
    throw new BusinessLogicError(
      `Cannot mark invoice as uncollectible: invoice is in ${invoice.status} state, only open invoices can be marked as uncollectible`,
      'INVALID_INVOICE_STATUS'
    );
  }

  // Additional business rule: invoice should not already be paid
  if (invoice.paymentStatus === 'succeeded') {
    throw new BusinessLogicError(
      'Cannot mark paid invoice as uncollectible',
      'INVOICE_ALREADY_PAID'
    );
  }

  // Update invoice status to uncollectible
  const updatedInvoice = await invoiceRepo.updateStatus(invoiceId, 'uncollectible', user.id);

  // TODO: Trigger any necessary cleanup:
  // - Cancel pending payment intents
  // - Update accounting records
  // - Send notifications
  // - Create audit log entries

  logger.info({
    invoiceId,
    invoiceNumber: updatedInvoice.invoiceNumber,
    merchantId: updatedInvoice.merchant,
    customerId: updatedInvoice.customer,
    total: updatedInvoice.total,
    markedUncollectibleBy: user.id
  }, 'Invoice marked as uncollectible successfully');

  // Format response to match TypeSpec Invoice model
  const response = {
    id: updatedInvoice.id,
    invoiceNumber: updatedInvoice.invoiceNumber,
    customer: updatedInvoice.customer, // Already correct field name
    merchant: updatedInvoice.merchant, // Already correct field name
    context: null, // TODO: Add context field to schema
    status: updatedInvoice.status,
    subtotal: updatedInvoice.subtotal,
    tax: updatedInvoice.tax,
    total: updatedInvoice.total,
    currency: updatedInvoice.currency,
    paymentCaptureMethod: 'automatic', // TODO: Add to schema
    paymentDueAt: null, // TODO: Add dueAt field to schema
    lineItems: [], // TODO: Implement proper line items storage
    paymentStatus: updatedInvoice.paymentStatus || null,
    paidAt: updatedInvoice.paidAt?.toISOString() || null,
    paidBy: null, // TODO: Add to schema
    voidedAt: updatedInvoice.voidedAt?.toISOString() || null,
    voidedBy: null, // TODO: Add to schema
    voidThresholdMinutes: null, // TODO: Add to schema
    authorizedAt: null, // TODO: Add to schema
    authorizedBy: null, // TODO: Add to schema
    metadata: null, // TODO: Add metadata support
    createdAt: updatedInvoice.createdAt.toISOString(),
    updatedAt: updatedInvoice.updatedAt.toISOString()
  };

  return ctx.json(response, 200);
}