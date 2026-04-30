/**
 * Get Invoice Handler
 *
 * Retrieves a single invoice by ID.
 * Follows TypeSpec billing.tsp definition with current schema adaptation.
 */

import type { ValidatedContext } from '@/types/app';
import type { GetInvoiceQuery, GetInvoiceParams } from '@/generated/openapi/validators';
import { ForbiddenError, NotFoundError } from '@/core/errors';
import type { Session } from '@/types/auth';
import { InvoiceRepository } from './repos/billing.repo';
import { PersonRepository } from '../person/repos/person.repo';

/**
 * getInvoice
 *
 * Path: GET /invoices/{invoice}
 * OperationId: getInvoice
 *
 * Get invoice by ID with authorization checks
 */
export async function getInvoice(
  ctx: ValidatedContext<never, GetInvoiceQuery, GetInvoiceParams>
): Promise<Response> {
  const database = ctx.get('database');
  const logger = ctx.get('logger');

  // Get authenticated session (guaranteed by middleware)
  const session = ctx.get('session') as Session;
  const user = session.user;

  // Extract validated parameters
  const params = ctx.req.valid('param') as any;
  const query = ctx.req.valid('query') as any;

  const invoiceId = params.invoice;

  logger.debug({ invoiceId, userId: user.id }, 'Getting invoice');

  // Create repository instances
  const invoiceRepo = new InvoiceRepository(database, logger);
  const personRepo = new PersonRepository(database, logger);

  // Get invoice (expand handled automatically by generated route wrapper)
  const invoice = await invoiceRepo.findOneById(invoiceId);

  if (!invoice) {
    throw new NotFoundError('Invoice not found', {
      resourceType: 'invoice',
      resource: invoiceId,
      suggestions: ['Check invoice ID format', 'Verify invoice exists in system']
    });
  }

  // Authorization check: user must be the provider who created the invoice
  // or the patient who is being billed (when we have patient auth)
  // Authorization: merchant, customer, or admin can view
  const merchantPerson = await personRepo.findOneById(invoice.merchant);
  if (!merchantPerson) {
    throw new NotFoundError('Merchant person not found', {
      resourceType: 'person',
      resource: invoice.merchant,
      suggestions: ['Check merchant person ID format', 'Verify merchant person exists in system']
    });
  }

  // Check if user is merchant or customer
  if (invoice.merchant !== user.id && invoice.customer !== user.id) {
    // TODO: Add admin access check
    throw new ForbiddenError('You can only access invoices where you are the merchant or customer');
  }

  logger.info({
    invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    merchantId: invoice.merchant,
    customerId: invoice.customer,
    status: invoice.status,
    total: invoice.total
  }, 'Invoice retrieved successfully');

  // Format response to match TypeSpec Invoice model
  const response = {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customer: invoice.customer, // Already correct field name
    merchant: invoice.merchant, // Already correct field name
    context: null, // TODO: Add context field to schema
    status: invoice.status,
    subtotal: invoice.subtotal,
    tax: invoice.tax || null,
    total: invoice.total,
    currency: invoice.currency,
    paymentCaptureMethod: 'automatic', // TODO: Add to schema
    paymentDueAt: invoice.paymentDueAt?.toISOString() || null,
    lineItems: [], // TODO: Implement proper line items storage
    paymentStatus: invoice.paymentStatus || null,
    paidAt: invoice.paidAt?.toISOString() || null,
    paidBy: null, // TODO: Add to schema
    voidedAt: invoice.voidedAt?.toISOString() || null,
    voidedBy: null, // TODO: Add to schema
    voidThresholdMinutes: null, // TODO: Add to schema
    authorizedAt: null, // TODO: Add to schema
    authorizedBy: null, // TODO: Add to schema
    metadata: null, // TODO: Add metadata support
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString()
  };

  return ctx.json(response, 200);
}