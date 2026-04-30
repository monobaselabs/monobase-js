import type { ValidatedContext } from '@/types/app';
import type { DeleteReviewParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import { 
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from '@/core/errors';
import { ReviewRepository } from './repos/review.repo';

/**
 * deleteReview
 * 
 * Path: DELETE /reviews/{review}
 * OperationId: deleteReview
 * 
 * Deletes a review permanently.
 * Only the review owner (reviewer) can delete their own review.
 * Admins can also delete reviews.
 */
export async function deleteReview(
  ctx: ValidatedContext<never, never, DeleteReviewParams>
): Promise<Response> {
  // Get authenticated session from Better-Auth
  const session = ctx.get('session');
  if (!session) {
    throw new UnauthorizedError();
  }
  
  const userId = session.user.id;
  const isAdmin = session.user.role === 'admin';
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  
  // Instantiate repository
  const repo = new ReviewRepository(db, logger);
  
  // Extract review ID from path params
  const { review: reviewId } = ctx.req.valid('param');
  
  // Get the review
  const review = await repo.getActiveReviewById(reviewId);
  
  if (!review) {
    throw new NotFoundError('Review');
  }
  
  // Authorization check: Only the reviewer (owner) or admin can delete
  if (!isAdmin && review.reviewer !== userId) {
    throw new ForbiddenError('You can only delete your own reviews');
  }
  
  // Delete the review permanently
  await repo.deleteReview(reviewId);
  
  // Log audit trail
  logger?.info({
    reviewId,
    reviewer: review.reviewer,
    deletedByUser: userId,
    action: 'delete_review'
  }, 'Review deleted');
  
  return ctx.body(null, 204);
}
