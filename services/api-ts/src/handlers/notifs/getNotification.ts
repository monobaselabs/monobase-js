import type { ValidatedContext } from '@/types/app';
import type { GetNotificationParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { NotFoundError, ForbiddenError } from '@/core/errors';
import { NotificationRepository } from './repos/notification.repo';
import { PersonRepository } from '../person/repos/person.repo';

/**
 * getNotification
 * 
 * Path: GET /notifications/{notification}
 * OperationId: getNotification
 * Security: bearerAuth
 */
export async function getNotification(
  ctx: ValidatedContext<never, never, GetNotificationParams>
): Promise<Response> {
  // Get authenticated user and check authorization
  const user = ctx.get('user') as User;
  
  // Extract validated parameters
  const params = ctx.req.valid('param') as { notif: string };

  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  const userId = user.id; // Get user's person ID

  // Instantiate repositories
  const personRepo = new PersonRepository(db, logger);
  const repo = new NotificationRepository(db, personRepo, logger);

  // Get notification with ownership check
  const notification = await repo.findOneByIdAndRecipient(params.notif, userId);
  
  if (!notification) {
    // We don't distinguish between not found and no access for security
    throw new NotFoundError('Notification not found', {
      resourceType: 'notification',
      resource: params.notif,
      suggestions: ['Check notification ID format', 'Verify notification exists']
    });
  }
  
  // Log audit trail
  logger?.info({
    action: 'get_notification',
    userId,
    notificationId: params.notif
  }, 'Notification retrieved');
  
  return ctx.json(notification, 200);
}