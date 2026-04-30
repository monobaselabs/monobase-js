/**
 * Booking Module Background Jobs
 * Registers and configures all booking-related background jobs
 */

import type { JobScheduler } from '@/core/jobs';
import type { DatabaseInstance } from '@/core/database';
import type { NotificationService } from '@/core/notifs';
import { slotGeneratorJob } from './slotGenerator';
import { confirmationTimerJob } from './confirmationTimer';
import { slotCleanupJob } from './slotCleanup';

/**
 * Register all booking module jobs with the scheduler
 */
export function registerBookingJobs(scheduler: JobScheduler, notificationService: NotificationService): void {
  // Slot generation job - runs daily at 2 AM
  scheduler.registerCron('booking.slotGenerator', '0 2 * * *', slotGeneratorJob);

  // Confirmation timer job - runs every minute
  // Create a wrapper that includes notification service
  scheduler.registerInterval('booking.confirmationTimer', 60000, async (context) => {
    // Extend context to include notification service
    const extendedContext = {
      ...context,
      notificationService
    };
    await confirmationTimerJob(extendedContext as any);
  });

  // Slot cleanup job - runs daily at 3 AM
  scheduler.registerCron('booking.slotCleanup', '0 3 * * *', slotCleanupJob);

  // Optional: Reminder sender job - runs every 15 minutes
  // scheduler.registerInterval('booking.reminderSender', 900000, reminderSenderJob);

  // Optional: No-show eligibility job - runs every minute
  // scheduler.registerInterval('booking.noShowEligibility', 60000, noShowEligibilityJob);
}

/**
 * Export all job handlers for direct access if needed
 */
export { slotGeneratorJob } from './slotGenerator';
export { confirmationTimerJob } from './confirmationTimer';
export { slotCleanupJob } from './slotCleanup';

/**
 * Job management utilities
 */
export async function triggerSlotGeneration(
  db: DatabaseInstance,
  ownerId?: string
): Promise<void> {
  // This can be called manually to trigger slot generation for a specific owner
  const { regenerateEventSlots } = await import('./slotGenerator');
  
  if (ownerId) {
    // Note: regenerateEventSlots takes eventId, not ownerId
    // This function signature may need to be updated
    throw new Error('triggerSlotGeneration with ownerId not implemented - use eventId instead');
  } else {
    // Trigger the full job
    throw new Error('Full job trigger not implemented - use scheduler.trigger()');
  }
}

/**
 * Get job health status
 */
export async function getBookingJobsHealth(scheduler: JobScheduler): Promise<{
  overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  details?: any;
}> {
  try {
    const health = await scheduler.getHealth();
    
    // Simple health check based on pg-boss metrics
    const overallHealth = health.healthy ? 'healthy' : 'unhealthy';
    
    return {
      overallHealth,
      details: health,
    };
  } catch (error) {
    return {
      overallHealth: 'unhealthy',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}