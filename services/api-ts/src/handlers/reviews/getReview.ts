import type { ValidatedContext } from '@/types/app';
import type { GetReviewParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import { 
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from '@/core/errors';
import { ReviewRepository } from './repos/review.repo';

/**
 * getReview
 * 
 * Path: GET /reviews/{review}
 * OperationId: getReview
 * 
 * Gets a specific review with role-based access control.
 * Access granted to:
 * - The reviewer (owner)
 * - The reviewed entity (if applicable)
 * - Admins
 */
export async function getReview(
  ctx: ValidatedContext<never, never, GetReviewParams>
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
  
  // Authorization check: Only reviewer, reviewed entity, or admin can access
  if (!isAdmin && !repo.canUserAccessReview(review, userId)) {
    throw new ForbiddenError('You do not have access to this review');
  }
  
  return ctx.json(review, 200);
}
