/**
 * Notification Module Background Jobs
 * Registers and configures notification-related background jobs
 */

import type { JobScheduler, JobContext } from '@/core/jobs';
import type { NotificationService } from '@/core/notifs';

/**
 * Register all notification module jobs with the scheduler
 */
export function registerNotifsJobs(
  scheduler: JobScheduler,
  notifsService: NotificationService
): void {
  // Process scheduled notifications job - runs every 5 minutes
  scheduler.registerCron('notifs.processScheduled', '*/5 * * * *', async (context: JobContext) => {
    await notifsService.processScheduledNotifications();
  });

  // Cleanup expired notifications job - runs daily at midnight
  scheduler.registerCron('notifs.cleanup', '0 0 * * *', async (context: JobContext) => {
    // Clean up notifications older than 90 days
    await notifsService.cleanupExpiredNotifications(90);
  });
}
