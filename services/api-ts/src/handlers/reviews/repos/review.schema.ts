/**
 * Database schema for reviews module - matches TypeSpec API definition
 * Uses Drizzle ORM with PostgreSQL
 */

import { 
  pgTable, 
  uuid, 
  integer, 
  text, 
  varchar,
  index, 
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { baseEntityFields } from '@/core/database.schema';
import { persons } from '../../person/repos/person.schema';

// Reviews table
export const reviews = pgTable('review', {
  // Base entity fields (includes id, timestamps, version, audit fields)
  ...baseEntityFields,

  // Core review fields
  context: uuid('context_id')
    .notNull(), // Flexible reference (no FK constraint for maximum flexibility)

  reviewer: uuid('reviewer_id')
    .notNull()
    .references(() => persons.id, { onDelete: 'cascade' }), // Person who submits review

  reviewType: varchar('review_type', { length: 50 })
    .notNull(), // Application-defined review type (no enum, flexible)

  reviewedEntity: uuid('reviewed_entity_id')
    .references(() => persons.id, { onDelete: 'cascade' }), // Optional person being reviewed

  npsScore: integer('nps_score')
    .notNull(), // NPS score (0-10)

  comment: text('comment'), // Optional feedback

}, (table) => ({
  // Indexes for performance
  contextIdx: index('reviews_context_idx').on(table.context),
  reviewerIdx: index('reviews_reviewer_idx').on(table.reviewer),
  reviewTypeIdx: index('reviews_review_type_idx').on(table.reviewType),
  reviewedEntityIdx: index('reviews_reviewed_entity_idx').on(table.reviewedEntity),


  // Unique constraint: one review per (context, reviewer, reviewType)
  uniqueReview: unique('reviews_context_reviewer_type_unique')
    .on(table.context, table.reviewer, table.reviewType),

  // Check constraints
  npsScoreCheck: check('reviews_nps_score_check', sql`${table.npsScore} >= 0 AND ${table.npsScore} <= 10`),
  commentLengthCheck: check('reviews_comment_check', sql`LENGTH(${table.comment}) <= 1000`),
  reviewTypeLengthCheck: check('reviews_review_type_check', sql`LENGTH(${table.reviewType}) <= 50`),
}));

// Type exports for TypeScript
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;

// Request types matching TypeSpec
export interface CreateReviewRequest {
  context: string; // UUID
  reviewType: string; // Application-defined
  reviewedEntity?: string; // UUID (optional)
  npsScore: number; // 0-10
  comment?: string; // Optional (max 1000 chars)
}
