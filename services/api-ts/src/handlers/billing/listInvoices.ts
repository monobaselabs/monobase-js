/**
 * List Invoices Handler
 *
 * Lists invoices with filtering and pagination.
 * Follows TypeSpec billing.tsp definition with current schema adaptation.
 */

import type { ValidatedContext } from '@/types/app';
import type { ListInvoicesQuery } from '@/generated/openapi/validators';
import { ForbiddenError } from '@/core/errors';
import type { Session } from '@/types/auth';
import { InvoiceRepository, type InvoiceFilters } from './repos/billing.repo';
import { parsePagination, buildPaginationMeta, parseFilters } from '@/utils/query';

/**
 * listInvoices
 *
 * Path: GET /invoices
 * OperationId: listInvoices
 *
 * List invoices with filtering and pagination
 */
export async function listInvoices(
  ctx: ValidatedContext<never, ListInvoicesQuery, never>
): Promise<Response> {
  const database = ctx.get('database');
  const logger = ctx.get('logger');

  // Get authenticated session (guaranteed by middleware)
  const session = ctx.get('session') as Session;
  const user = session.user;

  // Extract and parse query parameters
  const query = ctx.req.valid('query') as any;

  logger.debug({
    userId: user.id,
    filters: {
      customer: query.customer,
      merchant: query.merchant,
      status: query.status,
      context: query.context
    }
  }, 'Listing invoices');

  // Parse pagination with defaults
  const { limit, offset } = parsePagination(query, { limit: 25, maxLimit: 100 });

  // Build filters - map TypeSpec fields to current schema
  const filters: InvoiceFilters = {};

  if (query.customer) {
    filters.customer = query.customer;
  }

  if (query.merchant) {
    filters.merchant = query.merchant;
  }

  if (query.status) {
    filters.status = query.status;
  }

  if (query.context) {
    filters.context = query.context;
  }

  // Create repository instance
  const invoiceRepo = new InvoiceRepository(database, logger);

  // Get invoices (expand handled automatically by middleware)
  const result = await invoiceRepo.findManyWithPagination(filters, { pagination: { limit, offset } });

  const invoices = result.data;
  const totalCount = result.totalCount;

  // Build pagination metadata
  const paginationMeta = buildPaginationMeta(invoices, totalCount, limit, offset);

  // Format response to match TypeSpec Invoice model
  const formattedInvoices = invoices.map((invoice: any) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customer: invoice.customer, // Already correct field name
    merchant: invoice.merchant, // Already correct field name
    context: invoice.context || null,
    status: invoice.status,
    subtotal: invoice.subtotal,
    tax: invoice.tax || null,
    total: invoice.total,
    currency: invoice.currency,
    paymentCaptureMethod: 'automatic', // TODO: Add to schema
    paymentDueAt: invoice.dueAt?.toISOString() || null,
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
  }));

  logger.info({
    userId: user.id,
    filters,
    pagination: { limit, offset },
    resultCount: invoices.length,
    totalCount
  }, 'Invoices listed successfully');

  // Return standardized paginated response
  return ctx.json({
    data: formattedInvoices,
    pagination: paginationMeta
  }, 200);
}