import type { ValidatedContext } from '@/types/app';
import type { ListEmailTemplatesQuery } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User, Session } from '@/types/auth';
import { ForbiddenError } from '@/core/errors';
import { parsePagination, buildPaginationMeta, parseFilters } from '@/utils/query';
import { EmailTemplateRepository } from './repos/template.repo';
import type { EmailTemplateFilters } from './repos/email.schema';

/**
 * listEmailTemplates
 * 
 * Path: GET /email/templates
 * OperationId: listEmailTemplates
 */
export async function listEmailTemplates(
  ctx: ValidatedContext<never, ListEmailTemplatesQuery, never>
): Promise<Response> {
  // Get authenticated session from Better-Auth
  const session = ctx.get('session') as Session;
  
  // Get user for audit logging
  const user = ctx.get('user') as User;

  // Verify admin role is required for email template management
  const userRoles = user.role ? user.role.split(',').map(r => r.trim()) : [];
  if (!userRoles.includes('admin')) {
    throw new ForbiddenError('Admin role required for email template management');
  }

  // Extract validated query parameters
  const query = ctx.req.valid('query') as {
    status?: string;
    tags?: string | string[];
    limit?: number;
    offset?: number;
    pageSize?: number;
    page?: number;
  };
  
  // Parse pagination with utilities
  const { limit, offset } = parsePagination(query, { limit: 25, maxLimit: 100 });
  
  // Parse filters with utilities - only allow specific fields
  const allowedFilters = ['status', 'tags'];
  const rawFilters = parseFilters(query, allowedFilters);
  
  // Build filters object for repository
  const filters: EmailTemplateFilters = {};
  if (rawFilters['status']) {
    filters.status = rawFilters['status'];
  }
  if (rawFilters['tags']) {
    // Handle both single tag string and array of tags
    filters.tags = Array.isArray(rawFilters['tags']) ? rawFilters['tags'] : [rawFilters['tags']];
  }
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  
  // Instantiate repository
  const repo = new EmailTemplateRepository(db, logger);
  
  // Get paginated templates
  const templates = await repo.findMany(filters, { 
    pagination: { limit, offset } 
  });
  
  // Get total count for pagination metadata
  const totalCount = await repo.count(filters);
  
  // Build pagination metadata
  const paginationMeta = buildPaginationMeta(templates, totalCount, limit, offset);
  
  // Log audit trail
  logger?.info({
    action: 'list_email_templates',
    userId: user?.id,
    filters,
    pagination: { limit, offset },
    resultCount: templates.length,
    totalCount
  }, 'Email templates listed');
  
  // Return standardized response format
  return ctx.json({
    data: templates,
    pagination: paginationMeta
  }, 200);
}