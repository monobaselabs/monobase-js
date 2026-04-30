/**
 * Delete Invoice Handler
 *
 * Deletes a draft invoice.
 * Follows TypeSpec billing.tsp definition with current schema adaptation.
 */

import {
  ForbiddenError,
  NotFoundError,
  BusinessLogicError
} from '@/core/errors';
import type { ValidatedContext } from '@/types/app';
import type { DeleteInvoiceParams } from '@/generated/openapi/validators';
import type { Session } from '@/types/auth';
import { InvoiceRepository } from './repos/billing.repo';
import { PersonRepository } from '../person/repos/person.repo';

/**
 * deleteInvoice
 *
 * Path: DELETE /invoices/{invoice}
 * OperationId: deleteInvoice
 *
 * Delete a draft invoice
 */
export async function deleteInvoice(
  ctx: ValidatedContext<never, never, DeleteInvoiceParams>
): Promise<Response> {
  const database = ctx.get('database');
  const logger = ctx.get('logger');

  // Get authenticated session (guaranteed by middleware)
  const session = ctx.get('session') as Session;
  const user = session.user;

  // Extract validated parameters
  const params = ctx.req.valid('param') as any;
  const invoiceId = params.invoice;

  logger.info({ invoiceId, userId: user.id }, 'Deleting invoice');

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
    throw new ForbiddenError('You can only delete invoices for your own provider profile');
  }

  // Business rule: only draft invoices can be deleted
  if (invoice.status !== 'draft') {
    throw new BusinessLogicError(
      `Cannot delete invoice: invoice is in ${invoice.status} state, only draft invoices can be deleted`,
      'INVALID_INVOICE_STATUS'
    );
  }

  // Perform hard delete
  await invoiceRepo.deleteOneById(invoiceId);

  logger.info({
    invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    merchantId: invoice.merchant,
    deletedByUser: user.id
  }, 'Invoice deleted successfully');

  // Return 204 No Content as specified in TypeSpec
  return ctx.body(null, 204);
}
