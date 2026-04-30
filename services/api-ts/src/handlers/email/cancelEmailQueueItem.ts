import type { ValidatedContext } from '@/types/app';
import type { CancelEmailQueueItemBody, CancelEmailQueueItemParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User, Session } from '@/types/auth';
import {
  ForbiddenError,
  ValidationError,
} from '@/core/errors';
import { EmailQueueRepository } from './repos/queue.repo';

/**
 * cancelEmailQueueItem
 *
 * Path: POST /email/queue/{queue}/cancel
 * OperationId: cancelEmailQueueItem
 */
export async function cancelEmailQueueItem(
  ctx: ValidatedContext<CancelEmailQueueItemBody, never, CancelEmailQueueItemParams>
): Promise<Response> {
  // Get authenticated session from Better-Auth
  const session = ctx.get('session') as Session;

  // Get user for audit logging
  const user = ctx.get('user') as User;

  // Verify admin role is required for email queue management
  const userRoles = user.role ? user.role.split(',').map(r => r.trim()) : [];
  if (!userRoles.includes('admin')) {
    throw new ForbiddenError('Admin role required for email queue management');
  }
  
  // Extract validated parameters
  const params = ctx.req.valid('param') as { queue: string };
  
  // Extract validated request body
  const body = ctx.req.valid('json') as { reason: string };
  
  // Validate cancellation reason
  if (!body.reason || body.reason.trim().length === 0) {
    throw new ValidationError('Cancellation reason is required');
  }
  
  if (body.reason.length > 500) {
    throw new ValidationError('Cancellation reason must be 500 characters or less');
  }
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  const repo = new EmailQueueRepository(db, logger);
  
  // Cancel the email (repository method handles business logic validation)
  const cancelledEmail = await repo.cancelEmail(
    params.queue,
    user?.id || 'system',
    body.reason.trim()
  );
  
  // Log audit trail
  logger?.info({
    action: 'cancel_email',
    userId: user?.id,
    emailId: params.queue,
    recipientEmail: cancelledEmail.recipientEmail,
    templateTags: cancelledEmail.templateTags,
    cancellationReason: body.reason.trim()
  }, 'Email cancelled by admin');
  
  return ctx.json(cancelledEmail, 200);
}