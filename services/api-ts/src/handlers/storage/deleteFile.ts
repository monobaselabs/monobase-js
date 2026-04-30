import type { BaseContext } from '@/types/app';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError
} from '@/core/errors';
import type { StorageProvider } from '@/core/storage';
import { StorageFileRepository } from './repos/file.repo';
import { userHasRole } from '@/utils/auth';

/**
 * deleteFile
 *
 * Path: DELETE /storage/files/{fileId}
 * OperationId: deleteFile
 */
export async function deleteFile(
  ctx: BaseContext
): Promise<Response> {
  // Get authenticated user from Better-Auth
  const user = ctx.get('user') as User;

  if (!user.id) {
    throw new ValidationError('Valid user ID required');
  }

  // Get file ID from path parameters
  const fileId = ctx.req.param('file') as string;

  if (!fileId) {
    throw new ValidationError('File ID is required');
  }

  // Get dependencies from context
  const storage = ctx.get('storage') as StorageProvider;
  const logger = ctx.get('logger');
  const db = ctx.get('database') as DatabaseInstance;
  const auth = ctx.get('auth');
  const audit = ctx.get('audit');
  const repo = new StorageFileRepository(db, logger);

  // Get file record from database
  const file = await repo.findOneById(fileId);

  if (!file) {
    throw new NotFoundError('File not found', {
      resourceType: 'file',
      resource: fileId,
      suggestions: ['Check file ID', 'Verify file exists', 'Check file permissions']
    });
  }

  // Check access: user must be owner or admin to delete
  const isAdmin = await userHasRole(auth, user, 'admin');
  const isOwner = file.owner === user.id;

  if (!isOwner && !isAdmin) {
    throw new ForbiddenError('Access denied: You can only delete your own files');
  }

  // Log deletion attempt for compliance logging
  let auditEventId: string | undefined;
  if (audit) {
    try {
      const auditEntry = await audit.logEvent({
        eventType: 'data-modification',
        category: 'privacy',
        action: 'delete',
        outcome: 'success',
        user: user.id,
        userType: (user.role === 'user' ? 'client' : user.role || 'client') as 'client' | 'host' | 'admin' | 'system',
        resourceType: 'file',
        resource: fileId,
        description: `File deleted: ${file.filename}`,
        details: {
          isOwner,
          isAdmin,
          filename: file.filename,
          fileSize: file.size,
          mimeType: file.mimeType,
          timestamp: new Date().toISOString(),
          complianceType: 'compliance'
        },
        ipAddress: ctx.req.header('x-forwarded-for') || ctx.req.header('x-client-ip') || 'unknown',
        userAgent: ctx.req.header('user-agent') || 'API-Server'
      });
      auditEventId = auditEntry.id;
    } catch (error) {
      logger?.error({ error, userId: user.id, fileId }, 'Failed to log file deletion');
    }
  }
  
  // Delete from storage first
  try {
    await storage.deleteFile(fileId);
  } catch (storageError) {
    logger?.warn({ error: storageError, fileId }, 'Failed to delete file from storage, continuing with database cleanup');
  }
  
  // Delete from database (hard delete)
  await repo.deleteOneById(fileId);

  logger?.info({
    userId: user.id,
    fileId,
    filename: file.filename,
    auditEventId,
    action: 'file_deleted'
  }, 'File deleted');
  
  // Return 204 No Content for successful deletion
  return ctx.body(null, 204);
}