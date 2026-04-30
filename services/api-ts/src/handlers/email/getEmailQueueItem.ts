import type { ValidatedContext } from '@/types/app';
import type { GetEmailQueueItemParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User, Session } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
} from '@/core/errors';
import { EmailQueueRepository } from './repos/queue.repo';

/**
 * getEmailQueueItem
 * 
 * Path: GET /email/queue/{queue}
 * OperationId: getEmailQueueItem
 */
export async function getEmailQueueItem(
  ctx: ValidatedContext<never, never, GetEmailQueueItemParams>
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
  
  // Get the email queue item
  const email = await repo.findOneById(params.queue);
  
  if (!email) {
    throw new NotFoundError('Email queue item not found', {
      resourceType: 'emailQueue',
      resource: params.queue,
      suggestions: ['Check that the email ID is correct', 'Ensure the email hasn\'t been deleted']
    });
  }
  
  // Log audit trail
  logger?.info({
    action: 'get_email_queue_item',
    userId: user?.id,
    emailId: params.queue,
    emailStatus: email.status,
    recipientEmail: email.recipientEmail
  }, 'Email queue item retrieved');
  
  return ctx.json(email, 200);
}