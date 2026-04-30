/**
 * Update Invoice Handler
 *
 * Updates an existing invoice (draft only).
 * Follows TypeSpec billing.tsp definition with current schema adaptation.
 */

import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import type { ValidatedContext } from '@/types/app';
import type { UpdateInvoiceBody, UpdateInvoiceParams } from '@/generated/openapi/validators';
import type { Session } from '@/types/auth';
import { InvoiceRepository } from './repos/billing.repo';
import { PersonRepository } from '../person/repos/person.repo';

/**
 * updateInvoice
 *
 * Path: PATCH /invoices/{invoice}
 * OperationId: updateInvoice
 *
 * Update an existing invoice (draft only)
 */
export async function updateInvoice(
  ctx: ValidatedContext<UpdateInvoiceBody, never, UpdateInvoiceParams>
): Promise<Response> {
  const database = ctx.get('database');
  const logger = ctx.get('logger');

  // Get authenticated session (guaranteed by middleware)
  const session = ctx.get('session') as Session;
  const user = session.user;

  // Extract validated parameters and body
  const params = ctx.req.valid('param') as any;
  const body = ctx.req.valid('json') as any;

  const invoiceId = params.invoice;

  logger.info({
    invoiceId,
    userId: user.id,
    updateFields: Object.keys(body)
  }, 'Updating invoice');

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
    throw new ForbiddenError('You can only update invoices for your own provider profile');
  }

  // Business rule: only draft invoices can be updated
  if (invoice.status !== 'draft') {
    throw new BusinessLogicError(
      `Cannot update invoice: invoice is in ${invoice.status} state, only draft invoices can be modified`,
      'INVALID_INVOICE_STATUS'
    );
  }

  // Build update data
  const updateData: any = {
    updatedBy: user.id
  };

  // Handle payment due date update
  if (body.paymentDueAt !== undefined) {
    updateData.dueAt = body.paymentDueAt ? new Date(body.paymentDueAt) : null;
  }

  // Handle line items update
  if (body.lineItems) {
    // Validate line items
    if (body.lineItems.length === 0) {
      throw new ValidationError('At least one line item is required');
    }

    // Calculate new amounts
    let subtotal = 0;
    const processedLineItems = body.lineItems.map((item: any) => {
      const amount = (item.quantity || 1) * item.unitPrice;
      subtotal += amount;
      return {
        description: item.description,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice,
        amount,
        metadata: item.metadata
      };
    });

    const tax = 0; // TODO: Calculate tax based on jurisdiction
    const total = subtotal + tax;

    // Update amounts and description
    updateData.amount = total.toString();
    updateData.providerAmount = total.toString(); // TODO: Calculate after platform fees
    updateData.platformAmount = '0.00'; // TODO: Calculate platform fees
    updateData.description = processedLineItems.map((item: any) => item.description).join(', ');

    // TODO: Store line items in proper JSONB field when schema is updated
  }

  // TODO: Handle other fields when schema is updated
  // - paymentCaptureMethod
  // - voidThresholdMinutes
  // - metadata

  // Update invoice
  const updatedInvoice = await invoiceRepo.updateOneById(invoiceId, updateData);

  logger.info({
    invoiceId,
    invoiceNumber: updatedInvoice.invoiceNumber,
    changes: Object.keys(updateData),
    newAmount: (updatedInvoice as any).amount
  }, 'Invoice updated successfully');

  // Format response to match TypeSpec Invoice model
  const response = {
    id: updatedInvoice.id,
    invoiceNumber: updatedInvoice.invoiceNumber,
    customer: updatedInvoice.customer, // Already correct field name
    merchant: updatedInvoice.merchant, // Already correct field name
    context: null, // TODO: Add context field to schema
    status: updatedInvoice.status,
    subtotal: parseFloat((updatedInvoice as any).amount) - 0, // TODO: Calculate proper subtotal
    tax: null, // TODO: Implement tax calculation
    total: parseFloat((updatedInvoice as any).amount),
    currency: updatedInvoice.currency,
    paymentCaptureMethod: body.paymentCaptureMethod || 'automatic', // TODO: Add to schema
    paymentDueAt: (updatedInvoice as any).dueAt?.toISOString() || null,
    lineItems: body.lineItems || [], // TODO: Store and retrieve from proper field
    paymentStatus: updatedInvoice.paymentStatus || null,
    paidAt: updatedInvoice.paidAt?.toISOString() || null,
    paidBy: null, // TODO: Add to schema
    voidedAt: updatedInvoice.voidedAt?.toISOString() || null,
    voidedBy: null, // TODO: Add to schema
    voidThresholdMinutes: body.voidThresholdMinutes || null, // TODO: Add to schema
    authorizedAt: null, // TODO: Add to schema
    authorizedBy: null, // TODO: Add to schema
    metadata: body.metadata || null, // TODO: Add metadata support
    createdAt: updatedInvoice.createdAt.toISOString(),
    updatedAt: updatedInvoice.updatedAt.toISOString()
  };

  return ctx.json(response, 200);
}