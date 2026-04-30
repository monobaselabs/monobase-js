import type { ValidatedContext } from '@/types/app';
import type { ListAuditLogsQuery } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  NotFoundError,
  ValidationError
} from '@/core/errors';
import { parsePagination, buildPaginationMeta, parseFilters } from '@/utils/query';
import { AuditRepository } from './repos/audit.repo';
import type { AuditLogFilters, AuditLogQueryParams } from './repos/audit.schema';

/**
 * listAuditLogs
 * 
 * Path: GET /audit/logs
 * OperationId: listAuditLogs
 * Security: bearerAuth with roles ["admin", "compliance"]
 */
export async function listAuditLogs(
  ctx: ValidatedContext<never, ListAuditLogsQuery, never>
): Promise<Response> {
  // Get authenticated user and check authorization
  const user = ctx.get('user') as User;
  
  
  // Get query parameters
  const query = ctx.req.valid('query') as AuditLogQueryParams;
  
  // Parse pagination with audit-specific defaults
  const { limit, offset } = parsePagination(query, { limit: 25, maxLimit: 100 });
  
  // Parse filters - only allow specific fields for security
  const allowedFields = [
    'eventType', 'category', 'action', 'outcome', 
    'user', 'userType', 'resourceType', 'resource',
    'retentionStatus', 'startDate', 'endDate', 'ipAddress'
  ];
  
  const rawFilters = parseFilters(query, allowedFields);
  
  // Convert date strings to Date objects if present
  const filters: AuditLogFilters = {
    ...rawFilters,
    startDate: rawFilters['startDate'] ? new Date(rawFilters['startDate']) : undefined,
    endDate: rawFilters['endDate'] ? new Date(rawFilters['endDate']) : undefined
  };
  
  // Validate date range
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    throw new ValidationError('startDate cannot be after endDate');
  }
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  
  // Instantiate repository
  const repo = new AuditRepository(db, logger);
  
  // Get paginated audit logs and total count
  const [auditLogs, totalCount] = await Promise.all([
    repo.findMany(filters, { 
      pagination: { limit, offset }
      // orderBy handled by buildWhereConditions in repository
    }),
    repo.count(filters)
  ]);
  
  // Build pagination metadata
  const paginationMeta = buildPaginationMeta(auditLogs, totalCount, limit, offset);
  
  // Log audit trail - someone accessed audit logs
  await repo.logEvent({
    eventType: 'data-access',
    category: 'administrative',
    action: 'read',
    outcome: 'success',
    user: user.id,
    userType: 'admin',
    resourceType: 'audit_log',
    resource: 'audit_logs_query',
    description: 'Audit logs queried by administrator',
    details: {
      filtersApplied: Object.keys(filters).length > 0 ? filters : null,
      resultCount: auditLogs.length,
      pagination: { limit, offset }
    },
    ipAddress: ctx.req.header('x-forwarded-for') || ctx.req.header('x-real-ip'),
    userAgent: ctx.req.header('user-agent'),
    session: ctx.req.header('x-session-id'),
    request: ctx.req.header('x-request-id')
  }, user.id);
  
  // Log successful query
  logger?.info({
    userId: user.id,
    filters,
    resultCount: auditLogs.length,
    totalCount,
    pagination: { limit, offset }
  }, 'Audit logs queried successfully');
  
  // Format response with TypeSpec-compliant structure
  const response = {
    data: auditLogs.map(entry => ({
      ...entry,
      // Ensure dates are properly serialized
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),

      archivedAt: entry.archivedAt?.toISOString() || null,
      purgeAfter: entry.purgeAfter?.toISOString() || null
    })),
    pagination: paginationMeta
  };
  
  return ctx.json(response, 200);
}