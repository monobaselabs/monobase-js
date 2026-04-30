import type { BaseContext } from '@/types/app';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { type FileUploadResponse, type NewStoredFile } from './repos/file.schema';
import type { StorageProvider } from '@/core/storage';
import { StorageFileRepository } from './repos/file.repo';
import { addMinutes } from 'date-fns';

/**
 * uploadFile
 * 
 * Path: POST /storage/files/upload
 * OperationId: uploadFile
 */
export async function uploadFile(
  ctx: BaseContext
): Promise<Response> {
  // Get request body
  const body = await ctx.req.json() as {
    filename: string;
    size: number;
    mimeType: string;
  };
  
  // Get dependencies from context (injected by middleware)
  const storage = ctx.get('storage') as StorageProvider;
  const logger = ctx.get('logger');
  const db = ctx.get('database') as DatabaseInstance;
  const repo = new StorageFileRepository(db, logger);
  
  // Check file size limit (50MB)
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes
  if (body.size > MAX_FILE_SIZE) {
    throw new ValidationError('File size exceeds maximum limit of 50MB');
  }
  
  // Generate unique file ID
  const fileId = uuidv4();
  
  // Get authenticated user from Better-Auth
  const user = ctx.get('user') as User;

  if (!user?.id) {
    throw new ValidationError('Valid user ID required');
  }
  
  // Create database record with "uploading" status
  let fileCreated = false;
  
  try {
    await repo.createOne({
      id: fileId, // Use the same UUID for both storage key and database record
      filename: body.filename,
      mimeType: body.mimeType,
      size: body.size,
      status: 'uploading',
      owner: user.id,
    } as NewStoredFile);
    fileCreated = true;
    
    // Generate presigned upload URL
    logger?.debug({ fileId, mimeType: body.mimeType }, 'Generating presigned upload URL');
    const uploadUrl = await storage.generateUploadUrl(fileId, body.mimeType);
    logger?.debug({ fileId, uploadUrl }, 'Generated presigned upload URL');

    // Calculate expiry time (5 minutes from now)
    const expiresAt = addMinutes(new Date(), 5);
    
    // Return upload response
    const response: FileUploadResponse = {
      file: fileId,
      uploadUrl,
      uploadMethod: 'PUT',
      expiresAt,
    };
    
    logger?.info({ fileId, filename: body.filename, size: body.size }, 'File upload initiated');
    
    return ctx.json(response, 201);
  } catch (error) {
    // Clean up database record if it was created
    if (fileCreated) {
      try {
        await repo.deleteOneById(fileId);
      } catch (cleanupError) {
        logger?.error({ error: cleanupError, fileId }, 'Failed to clean up database record');
      }
    }
    
    throw error; // Re-throw original error for global handler
  }
}