/**
 * Finalize Invoice Handler
 *
 * Finalizes an invoice (changes from draft to open status).
 * Follows TypeSpec billing.tsp definition with current schema adaptation.
 */

import {
  ForbiddenError,
  NotFoundError,
  BusinessLogicError
} from '@/core/errors';
import type { ValidatedContext } from '@/types/app';
import type { FinalizeInvoiceParams } from '@/generated/openapi/validators';
import type { Session } from '@/types/auth';
import { InvoiceRepository } from './repos/billing.repo';
import { PersonRepository } from '../person/repos/person.repo';

/**
 * finalizeInvoice
 *
 * Path: POST /invoices/{invoice}/finalize
 * OperationId: finalizeInvoice
 *
 * Finalize an invoice (draft to open)
 */
export async function finalizeInvoice(
  ctx: ValidatedContext<never, never, FinalizeInvoiceParams>
): Promise<Response> {
  const database = ctx.get('database');
  const logger = ctx.get('logger');

  // Get authenticated session (guaranteed by middleware)
  const session = ctx.get('session') as Session;
  const user = session.user;

  // Extract validated parameters
  const params = ctx.req.valid('param') as any;
  const invoiceId = params.invoice;

  logger.info({ invoiceId, userId: user.id }, 'Finalizing invoice');

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
    throw new ForbiddenError('You can only finalize invoices for your own provider profile');
  }

  // Business rule: only draft invoices can be finalized
  if (invoice.status !== 'draft') {
    throw new BusinessLogicError(
      `Cannot finalize invoice: invoice is in ${invoice.status} state, only draft invoices can be finalized`,
      'INVALID_INVOICE_STATUS'
    );
  }

  // Validate invoice has required data before finalizing
  if (!invoice.total || invoice.total <= 0) {
    throw new BusinessLogicError(
      'Cannot finalize invoice: invoice must have a positive total amount',
      'INCOMPLETE_INVOICE_DATA'
    );
  }

  // Update invoice status to open and set issued timestamp
  const finalizedInvoice = await invoiceRepo.updateStatus(invoiceId, 'open', user.id);

  logger.info({
    invoiceId,
    invoiceNumber: finalizedInvoice.invoiceNumber,
    merchantId: finalizedInvoice.merchant,
    customerId: finalizedInvoice.customer,
    total: finalizedInvoice.total,
    status: finalizedInvoice.status
  }, 'Invoice finalized successfully');

  // Format response to match TypeSpec Invoice model
  const response = {
    id: finalizedInvoice.id,
    invoiceNumber: finalizedInvoice.invoiceNumber,
    customer: finalizedInvoice.customer,
    merchant: finalizedInvoice.merchant,
    context: finalizedInvoice.context,
    status: finalizedInvoice.status,
    subtotal: finalizedInvoice.subtotal,
    tax: finalizedInvoice.tax,
    total: finalizedInvoice.total,
    currency: finalizedInvoice.currency,
    paymentCaptureMethod: finalizedInvoice.paymentCaptureMethod,
    paymentDueAt: null, // TODO: Add dueAt field to schema
    lineItems: [], // TODO: Implement proper line items storage
    paymentStatus: finalizedInvoice.paymentStatus || null,
    paidAt: finalizedInvoice.paidAt?.toISOString() || null,
    paidBy: null, // TODO: Add to schema
    voidedAt: finalizedInvoice.voidedAt?.toISOString() || null,
    voidedBy: null, // TODO: Add to schema
    voidThresholdMinutes: null, // TODO: Add to schema
    authorizedAt: null, // TODO: Add to schema
    authorizedBy: null, // TODO: Add to schema
    metadata: null, // TODO: Add metadata support
    createdAt: finalizedInvoice.createdAt.toISOString(),
    updatedAt: finalizedInvoice.updatedAt.toISOString()
  };

  return ctx.json(response, 200);
}