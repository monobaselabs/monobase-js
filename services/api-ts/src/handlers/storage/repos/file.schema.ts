/**
 * Database schema for stored files
 * Uses Drizzle ORM with PostgreSQL
 */

import { pgTable, uuid, varchar, bigint, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { baseEntityFields, type BaseEntity } from '@/core/database.schema';

// File status enum
export const fileStatusEnum = pgEnum('file_status', [
  'uploading',
  'processing', 
  'available',
  'failed'
]);

// Stored files table
export const storedFiles = pgTable('stored_file', {
  // Base entity fields (includes id, timestamps, version, audit fields)
  ...baseEntityFields,
  
  // File metadata
  filename: varchar('filename', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  
  // Status tracking
  status: fileStatusEnum('status').notNull().default('uploading'),
  
  // Ownership
  owner: uuid('owner').notNull(),
  
  // File-specific timestamp
  uploadedAt: timestamp('uploaded_at').defaultNow(),
});

// Type exports for TypeScript
export type StoredFile = typeof storedFiles.$inferSelect;
export type NewStoredFile = typeof storedFiles.$inferInsert;


// File upload response type
export interface FileUploadResponse {
  file: string;
  uploadUrl: string;
  uploadMethod: 'PUT';
  expiresAt: Date;
}

// File download response type
export interface FileDownloadResponse {
  downloadUrl: string;
  expiresAt: Date;
  file: StoredFile;
}