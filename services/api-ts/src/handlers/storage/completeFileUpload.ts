import type { BaseContext } from '@/types/app';
import type { DatabaseInstance } from '@/core/database';
import { 
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { type StoredFile } from './repos/file.schema';
import type { StorageProvider } from '@/core/storage';
import { StorageFileRepository } from './repos/file.repo';

/**
 * completeFileUpload
 * 
 * Path: POST /storage/files/{fileId}/complete
 * OperationId: completeFileUpload
 */
export async function completeFileUpload(
  ctx: BaseContext
): Promise<Response> {
  // Get file ID from path parameters
  const fileId = ctx.req.param('file') as string;
  
  // Get dependencies from context
  const storage = ctx.get('storage') as StorageProvider;
  const logger = ctx.get('logger');
  const db = ctx.get('database') as DatabaseInstance;
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
  
  // Check if file is in uploading status
  if (file.status !== 'uploading') {
    throw new ValidationError(`File is in ${file.status} status, cannot complete upload`);
  }
  
  // Verify file exists in storage
  const fileExists = await storage.verifyFileExists(fileId);
  
  if (!fileExists) {
    // Update status to failed if file doesn't exist in storage
    await repo.updateOneStatusById(fileId, 'failed');
    
    throw new BusinessLogicError('File was not uploaded to storage', 'UPLOAD_VERIFICATION_FAILED');
  }
  
  // Update file status to processing then available
  const updatedFile = await repo.updateOneStatusById(fileId, 'processing');
  
  // Simulate processing (in real app, this might trigger background jobs)
  // For now, immediately mark as available
  const finalFile = await repo.updateOneStatusById(fileId, 'available');
  
  logger?.info({ fileId, filename: finalFile.filename }, 'File upload completed');
  
  // Return complete file metadata
  return ctx.json(finalFile, 200);
}