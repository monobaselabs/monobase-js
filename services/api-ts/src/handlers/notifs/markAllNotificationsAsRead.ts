import type { ValidatedContext } from '@/types/app';
import type { MarkAllNotificationsAsReadQuery } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { NotificationRepository } from './repos/notification.repo';
import { PersonRepository } from '../person/repos/person.repo';

/**
 * markAllNotificationsAsRead
 *
 * Path: POST /notifications/read-all
 * OperationId: markAllNotificationsAsRead
 * Security: bearerAuth
 */
export async function markAllNotificationsAsRead(
  ctx: ValidatedContext<never, MarkAllNotificationsAsReadQuery, never>
): Promise<Response> {
  // Get authenticated user and check authorization
  const user = ctx.get('user') as User;
  
  // Extract validated query parameters
  const query = ctx.req.valid('query') as { type?: string };
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  const userId = user.id; // Get user's person ID
  
  // Instantiate repositories
  const personRepo = new PersonRepository(db, logger);
  const repo = new NotificationRepository(db, personRepo, logger);
  
  // Mark all notifications as read for the user
  const markedCount = await repo.markAllAsRead(userId, query.type);
  
  // Log audit trail
  logger?.info({
    action: 'mark_all_notifications_read',
    userId,
    type: query.type,
    markedCount
  }, 'All notifications marked as read');
  
  // Return count of updated notifications
  return ctx.json({
    markedCount
  }, 200);
}