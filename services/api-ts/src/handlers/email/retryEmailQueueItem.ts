import type { ValidatedContext } from '@/types/app';
import type { RetryEmailQueueItemParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User, Session } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/core/errors';
import { EmailQueueRepository } from './repos/queue.repo';

/**
 * retryEmailQueueItem
 *
 * Path: POST /email/queue/{queue}/retry
 * OperationId: retryEmailQueueItem
 */
export async function retryEmailQueueItem(
  ctx: ValidatedContext<never, never, RetryEmailQueueItemParams>
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
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  const repo = new EmailQueueRepository(db, logger);
  
  // Retry the email (repository method handles business logic validation)
  const updatedEmail = await repo.retryEmail(params.queue);
  
  // Log audit trail
  logger?.info({
    action: 'retry_email',
    userId: user?.id,
    emailId: params.queue,
    recipientEmail: updatedEmail.recipientEmail,
    template: updatedEmail.template,
    attempts: updatedEmail.attempts
  }, 'Email retry initiated');
  
  return ctx.json(updatedEmail, 200);
}