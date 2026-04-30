import type { BaseContext } from '@/types/app';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError,
  UnauthorizedError
} from '@/core/errors';
import { type StoredFile } from './repos/file.schema';
import type { StorageProvider } from '@/core/storage';
import { StorageFileRepository } from './repos/file.repo';
import { userHasRole } from '@/utils/auth';
import { addMinutes } from 'date-fns';

/**
 * getFile
 *
 * Path: GET /storage/files/{file}
 * OperationId: getFile
 *
 * Get file metadata and download URL if available.
 * Consolidates functionality from getFileMetadata and getFileDownload.
 */
export async function getFile(
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

  // Get query parameter to control download URL generation
  const query = ctx.req.query();
  const includeDownloadUrl = query['includeDownloadUrl'] !== 'false'; // Default to true unless explicitly set to 'false'

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
      suggestions: ['Check file ID format', 'Verify file exists', 'Check file permissions']
    });
  }

  // Check access: user must be owner or admin
  const isAdmin = await userHasRole(auth, user, 'admin');
  const isOwner = file.owner === user.id;

  if (!isOwner && !isAdmin) {
    throw new ForbiddenError('Access denied: You can only access your own files');
  }

  // Log access for compliance logging
  let auditEventId: string | undefined;
  if (audit) {
    try {
      const auditEntry = await audit.logEvent({
        eventType: 'data-access',
        category: 'hipaa',
        action: 'read',
        outcome: 'success',
        user: user.id,
        userType: (user.role === 'user' ? 'client' : user.role || 'client') as 'client' | 'host' | 'admin' | 'system',
        resourceType: 'file',
        resource: fileId,
        description: `File accessed: ${file.filename}`,
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
      logger?.error({ error, userId: user.id, fileId }, 'Failed to log file access');
    }
  }

  // Build base response with file metadata
  let response: any = {
    ...file
  };

  // Add download URL if requested and file is available
  const shouldIncludeDownload = includeDownloadUrl;

  if (shouldIncludeDownload && file.status === 'available') {
    try {
      // Generate presigned download URL
      const downloadUrl = await storage.generateDownloadUrl(fileId);

      // Calculate expiry time (15 minutes from now)
      const expiresAt = addMinutes(new Date(), 15);

      // Add download information to response
      response = {
        ...response,
        downloadUrl,
        downloadExpiresAt: expiresAt,
        downloadMethod: 'GET'
      };

      logger?.info({
        userId: user.id,
        fileId,
        filename: file.filename,
        action: 'get_file_with_download',
        auditEventId
      }, 'File retrieved with download URL');
    } catch (storageError) {
      // Log storage error but don't fail the request
      logger?.warn({
        userId: user.id,
        fileId,
        error: storageError,
        action: 'get_file_download_failed'
      }, 'Failed to generate download URL for file');

      // Add error information to response
      response = {
        ...response,
        downloadError: 'Download URL generation failed'
      };
    }
  } else if (file.status !== 'available') {
    // Provide status information for non-available files
    response = {
      ...response,
      statusMessage: `File is not available for download (status: ${file.status})`
    };

    logger?.debug({
      userId: user.id,
      fileId,
      status: file.status,
      action: 'get_file_not_available',
      auditEventId
    }, 'File retrieved but not available for download');
  } else {
    logger?.debug({
      userId: user.id,
      fileId,
      filename: file.filename,
      action: 'get_file_metadata_only',
      auditEventId
    }, 'File metadata retrieved without download URL');
  }

  return ctx.json(response, 200);
}