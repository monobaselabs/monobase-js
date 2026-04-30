import type { ValidatedContext } from '@/types/app';
import type { MarkNotificationAsReadParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { NotFoundError } from '@/core/errors';
import { NotificationRepository } from './repos/notification.repo';
import { PersonRepository } from '../person/repos/person.repo';

/**
 * markNotificationAsRead
 *
 * Path: POST /notifications/{notification}/read
 * OperationId: markNotificationAsRead
 * Security: bearerAuth
 */
export async function markNotificationAsRead(
  ctx: ValidatedContext<never, never, MarkNotificationAsReadParams>
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

  // Mark notification as read (includes ownership check)
  const updatedNotification = await repo.markAsRead(params.notif, userId);
  
  // Log audit trail
  logger?.info({
    action: 'mark_notification_read',
    userId,
    notificationId: params.notif
  }, 'Notification marked as read');
  
  return ctx.json(updatedNotification, 200);
}