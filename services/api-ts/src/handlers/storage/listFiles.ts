import type { BaseContext } from '@/types/app';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { type StoredFile } from './repos/file.schema';
import { StorageFileRepository } from './repos/file.repo';
import { parsePagination, buildPaginationMeta, parseFilters } from '@/utils/query';
import { userHasRole } from '@/utils/auth';

/**
 * listFiles
 *
 * Path: GET /storage/files
 * OperationId: listFiles
 */
export async function listFiles(
  ctx: BaseContext
): Promise<Response> {
  // Get authenticated user from Better-Auth
  const user = ctx.get('user') as User;

  if (!user.id) {
    throw new ValidationError('Valid user ID required');
  }

  // Get query parameters
  const query = ctx.req.query();

  // Parse pagination with utilities (default limit 20 for files)
  const { limit, offset } = parsePagination(query, { limit: 20 });

  // Parse filters with utilities
  const filters = parseFilters(query, ['status', 'owner']);

  // Get dependencies from context
  const logger = ctx.get('logger');
  const db = ctx.get('database') as DatabaseInstance;
  const auth = ctx.get('auth');
  const audit = ctx.get('audit');
  const repo = new StorageFileRepository(db, logger);

  // Role-based filtering: users can only see their own files
  const isAdmin = await userHasRole(auth, user, 'admin');

  if (!isAdmin) {
    // Regular users can only see their own files
    filters['owner'] = user.id;
  }
  // Admins can see all files (with audit logging)

  // Log file listing access for compliance logging
  if (audit) {
    try {
      await audit.logEvent({
        eventType: 'data-access',
        category: 'hipaa',
        action: 'read',
        outcome: 'success',
        user: user.id,
        userType: (user.role === 'user' ? 'client' : user.role || 'client') as 'client' | 'host' | 'admin' | 'system',
        resourceType: 'file',
        resource: 'multiple',
        description: `File listing access by user ${user.id}`,
        details: {
          userRole: user.role,
          filters,
          pagination: { offset, limit },
          timestamp: new Date().toISOString(),
          complianceType: 'compliance'
        },
        ipAddress: ctx.req.header('x-forwarded-for') || ctx.req.header('x-client-ip') || 'unknown',
        userAgent: 'API-Server'
      });
    } catch (error) {
      logger?.error({ error, userId: user.id }, 'Failed to log file listing access');
    }
  }
  
  // Use repository to get paginated files with filters
  const result = await repo.findManyWithPagination(filters, {
    pagination: { offset, limit }
  });
  
  // Build pagination metadata
  const paginationMeta = buildPaginationMeta(result.data, result.totalCount, limit, offset);
  
  // Log audit trail
  logger?.info({
    userId: user.id,
    userRole: user.role,
    filters,
    pagination: { offset, limit, totalCount: result.totalCount },
    action: 'files_listed'
  }, 'Files listed');
  
  // Return standardized paginated response
  return ctx.json({
    data: result.data,
    pagination: paginationMeta
  }, 200);
}