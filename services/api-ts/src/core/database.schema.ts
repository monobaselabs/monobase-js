/**
 * Shared database schema definitions and helpers
 * Provides base entity fields and interfaces for consistency across all tables
 */

import { uuid, timestamp, integer } from 'drizzle-orm/pg-core';

/**
 * Base entity fields that all tables should include
 * Provides standard audit and tracking fields
 */
export const baseEntityFields = {
  // Primary key
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  
  // Optimistic locking
  version: integer('version').default(1).notNull(),
  
  // Audit fields - who performed the action
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
};

/**
 * BaseEntity interface for TypeScript type consistency
 * All entity types should extend this interface
 */
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
}