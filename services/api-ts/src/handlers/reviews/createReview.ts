import type { ValidatedContext } from '@/types/app';
import type { CreateReviewBody } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import { 
  UnauthorizedError,
  ValidationError,
  ConflictError
} from '@/core/errors';
import { ReviewRepository } from './repos/review.repo';
import type { CreateReviewRequest } from './repos/review.schema';

/**
 * createReview
 * 
 * Path: POST /reviews
 * OperationId: createReview
 * 
 * Creates a new review with NPS score and optional comment.
 * Enforces unique constraint: one review per (context, reviewer, reviewType).
 */
export async function createReview(
  ctx: ValidatedContext<CreateReviewBody, never, never>
): Promise<Response> {
  // Get authenticated session from Better-Auth
  const session = ctx.get('session');
  if (!session) {
    throw new UnauthorizedError();
  }
  
  const userId = session.user.id;
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  
  // Instantiate repository
  const repo = new ReviewRepository(db, logger);
  
  // Extract validated request body
  const body = ctx.req.valid('json') as CreateReviewRequest;
  
  // Validation: Prevent self-reviews when reviewing a person
  if (body.reviewedEntity && body.reviewedEntity === userId) {
    throw new ValidationError('Cannot review yourself');
  }
  
  // Check for duplicate review
  const exists = await repo.reviewExists(
    body.context,
    userId,
    body.reviewType
  );
  
  if (exists) {
    throw new ConflictError('Review already exists for this context and review type');
  }
  
  // Create the review
  const review = await repo.createReview(body, userId);
  
  // Log audit trail
  logger?.info({
    reviewId: review.id,
    reviewer: userId,
    reviewType: review.reviewType,
    context: review.context,
    action: 'create_review'
  }, 'Review created');
  
  return ctx.json(review, 201);
}
