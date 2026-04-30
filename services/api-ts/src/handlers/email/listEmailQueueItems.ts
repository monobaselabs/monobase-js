import type { ValidatedContext } from '@/types/app';
import type { ListEmailQueueItemsQuery } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User, Session } from '@/types/auth';
import { ForbiddenError } from '@/core/errors';
import { EmailQueueRepository } from './repos/queue.repo';
import { parsePagination, buildPaginationMeta, parseFilters } from '@/utils/query';
import type { EmailQueueFilters } from './repos/email.schema';

/**
 * listEmailQueueItems
 *
 * Path: GET /email/queue
 * OperationId: listEmailQueueItems
 */
export async function listEmailQueueItems(
  ctx: ValidatedContext<never, ListEmailQueueItemsQuery, never>
): Promise<Response> {
  // Get authenticated session from Better-Auth
  const session = ctx.get('session') as Session;

  // Get user for audit logging
  const user = ctx.get('user') as User;

  // Verify admin role is required for email queue management
  const userRoles = user.role ? user.role.split(',').map(r => r.trim()) : [];
  if (!userRoles.includes('admin')) {
    throw new ForbiddenError('Admin role required for email queue management');
  }
  
  // Extract validated query parameters
  const query = ctx.req.valid('query') as {
    status?: string | string[];
    template?: string;
    templateTags?: string | string[];
    recipientEmail?: string;
    dateFrom?: string;
    dateTo?: string;
    priority?: string;
    scheduledOnly?: string;
    limit?: string;
    offset?: string;
  };
  
  // Parse pagination with custom defaults
  const { limit, offset } = parsePagination(query, { limit: 50, maxLimit: 200 });
  
  // Parse and build filters
  const filters: EmailQueueFilters = {};
  
  if (query.status) {
    if (Array.isArray(query.status)) {
      filters.status = query.status as any[];
    } else if (query.status.includes(',')) {
      // Parse CSV format: "pending,processing,sent"
      filters.status = query.status.split(',').map(s => s.trim()) as any[];
    } else {
      filters.status = query.status as any;
    }
  }
  
  if (query.template) {
    filters.template = query.template;
  }

  if (query.templateTags) {
    if (Array.isArray(query.templateTags)) {
      filters.templateTags = query.templateTags;
    } else {
      filters.templateTags = query.templateTags;
    }
  }
  
  if (query.recipientEmail) {
    filters.recipientEmail = query.recipientEmail;
  }
  
  if (query.priority) {
    const priority = parseInt(query.priority);
    if (!isNaN(priority)) {
      filters.priority = priority;
    }
  }
  
  if (query.scheduledOnly === 'true') {
    filters.scheduledOnly = true;
  }
  
  if (query.dateFrom) {
    const dateFrom = new Date(query.dateFrom);
    if (!isNaN(dateFrom.getTime())) {
      filters.dateFrom = dateFrom;
    }
  }
  
  if (query.dateTo) {
    const dateTo = new Date(query.dateTo);
    if (!isNaN(dateTo.getTime())) {
      filters.dateTo = dateTo;
    }
  }
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  const repo = new EmailQueueRepository(db, logger);
  
  // Get paginated results
  const emails = await repo.findMany(filters, { pagination: { limit, offset } });
  const totalCount = await repo.count(filters);
  
  // Build standardized pagination metadata
  const paginationMeta = buildPaginationMeta(emails, totalCount, limit, offset);
  
  // Log audit trail
  logger?.info({
    action: 'list_email_queue',
    userId: user?.id,
    filters,
    pagination: { limit, offset },
    resultCount: emails.length,
    totalCount
  }, 'Email queue listed');
  
  // Return standardized paginated response
  return ctx.json({
    data: emails,
    pagination: paginationMeta
  }, 200);
}