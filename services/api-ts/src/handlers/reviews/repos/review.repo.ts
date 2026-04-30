/**
 * Repository for reviews module - database operations
 */

import { and, eq, isNull, or, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '@/core/database';
import { DatabaseRepository } from '@/core/database.repo';
import { reviews, type Review, type NewReview, type CreateReviewRequest } from './review.schema';

export interface ReviewFilters {
  context?: string;
  reviewer?: string;
  reviewType?: string;
  reviewedEntity?: string;
}

/**
 * Review repository
 */
export class ReviewRepository extends DatabaseRepository<Review, NewReview, ReviewFilters> {
  constructor(db: DatabaseInstance, logger?: any) {
    super(db, reviews, logger);
  }

  /**
   * Build where conditions for review filtering
   */
  protected buildWhereConditions(filters?: ReviewFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;

    const conditions = [];

    if (filters.context) {
      conditions.push(eq(reviews.context, filters.context));
    }
    if (filters.reviewer) {
      conditions.push(eq(reviews.reviewer, filters.reviewer));
    }
    if (filters.reviewType) {
      conditions.push(eq(reviews.reviewType, filters.reviewType));
    }
    if (filters.reviewedEntity) {
      conditions.push(eq(reviews.reviewedEntity, filters.reviewedEntity));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * Create a new review
   */
  async createReview(data: CreateReviewRequest, reviewerId: string): Promise<Review> {
    const newReview: NewReview = {
      context: data.context,
      reviewer: reviewerId,
      reviewType: data.reviewType,
      reviewedEntity: data.reviewedEntity ?? null,
      npsScore: data.npsScore,
      comment: data.comment ?? null,
      createdBy: reviewerId,
      updatedBy: reviewerId,
    };

    return await this.createOne(newReview);
  }

  /**
   * Get review by ID (excludes soft-deleted)
   */
  async getActiveReviewById(id: string): Promise<Review | null> {
    return await this.findOneById(id);
  }

  /**
   * Check if review already exists (for duplicate prevention)
   */
  async reviewExists(context: string, reviewer: string, reviewType: string): Promise<boolean> {
    const existing = await this.findOne({
      context,
      reviewer,
      reviewType,
    });

    return !!existing;
  }

  /**
   * Delete a review
   */
  async deleteReview(id: string): Promise<void> {
    await this.deleteOneById(id);
  }

  /**
   * Check if user can access review (for authorization)
   * User can access if:
   * - They are the reviewer
   * - They are the reviewed entity
   * - They are an admin (checked in handler)
   */
  canUserAccessReview(review: Review, userId: string): boolean {
    return (
      review.reviewer === userId ||
      (review.reviewedEntity !== null && review.reviewedEntity === userId)
    );
  }
}
