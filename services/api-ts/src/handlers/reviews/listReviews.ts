import type { ValidatedContext } from '@/types/app';
import type { ListReviewsQuery } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import { 
  UnauthorizedError,
  ForbiddenError,
} from '@/core/errors';
import { ReviewRepository, type ReviewFilters } from './repos/review.repo';

/**
 * listReviews
 * 
 * Path: GET /reviews
 * OperationId: listReviews
 * 
 * Lists reviews with optional filtering.
 * Role-based access control:
 * - Users can see their own reviews (as reviewer)
 * - Reviewed entities can see reviews about them
 * - Admins can see all reviews
 */
export async function listReviews(
  ctx: ValidatedContext<never, ListReviewsQuery, never>
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
  
  // Extract query parameters
  const query = ctx.req.valid('query');
  
  const filters: ReviewFilters = {
    context: query.context as string | undefined,
    reviewer: query.reviewer as string | undefined,
    reviewType: query.reviewType as string | undefined,
    reviewedEntity: query.reviewedEntity as string | undefined,
  };
  
  // Apply role-based access control for non-admins
  if (!isAdmin) {
    // Check if user is trying to view someone else's reviews
    if (filters.reviewer && filters.reviewer !== userId) {
      throw new ForbiddenError('You can only view your own reviews or reviews about you');
    }

    // Check if user is trying to view reviews about someone else
    if (filters.reviewedEntity && filters.reviewedEntity !== userId) {
      throw new ForbiddenError('You can only view your own reviews or reviews about you');
    }

    // If no specific filters, default to showing user's own reviews
    if (!filters.reviewer && !filters.reviewedEntity) {
      filters.reviewer = userId;
    }
  }
  
  const page = query.page ? Number(query.page) : 1;
  const limit = query.limit ? Number(query.limit) : 20;
  const offset = (page - 1) * limit;
  
  const result = await repo.findManyWithPagination(filters, {
    pagination: { limit, offset }
  });
  
  return ctx.json(result, 200);
}
