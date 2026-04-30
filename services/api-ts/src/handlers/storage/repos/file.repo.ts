/**
 * StorageFileRepository - Data access layer for stored files
 * Encapsulates all database operations for the storedFiles table
 */

import { eq, and, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '@/core/database';
import { DatabaseRepository, type PaginationOptions } from '@/core/database.repo';
import { storedFiles, type StoredFile, type NewStoredFile } from './file.schema';

export interface ListFilesFilters {
  status?: 'uploading' | 'processing' | 'available' | 'failed';
  owner?: string;
}

export interface ListFilesOptions {
  filters?: ListFilesFilters;
  pagination: PaginationOptions;
}

export interface ListFilesResult {
  files: StoredFile[];
  totalCount: number;
}

export class StorageFileRepository extends DatabaseRepository<StoredFile, NewStoredFile, ListFilesFilters> {
  constructor(
    db: DatabaseInstance,
    logger?: any // Logger interface - using 'any' to match existing pattern
  ) {
    super(db, storedFiles, logger);
  }

  /**
   * Build where conditions for file-specific filtering
   */
  protected buildWhereConditions(filters?: ListFilesFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;
    
    const conditions = [];
    
    if (filters.status) {
      conditions.push(eq(storedFiles.status, filters.status));
    }
    
    if (filters.owner) {
      conditions.push(eq(storedFiles.owner, filters.owner));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }


  /**
   * Update file status and related fields by ID
   */
  async updateOneStatusById(
    id: string, 
    status: StoredFile['status'], 
    additionalFields?: Partial<Pick<StoredFile, 'updatedAt'>>
  ): Promise<StoredFile> {
    this.logger?.debug({ 
      fileId: id, 
      newStatus: status,
      additionalFields 
    }, 'Updating file status');

    const updateData = {
      status,
      ...additionalFields
    };

    const updatedFile = await this.updateOneById(id, updateData);

    this.logger?.info({ 
      fileId: id, 
      status: updatedFile.status,
      filename: updatedFile.filename 
    }, 'File status updated successfully');

    return updatedFile;
  }

}