/**
 * Email Module Background Jobs
 * Registers and configures email-related background jobs
 */

import type { JobScheduler, JobContext } from '@/core/jobs';
import type { DatabaseInstance } from '@/core/database';
import type { Logger } from '@/types/logger';
import type { EmailService } from '@/core/email';

/**
 * Register all email module jobs with the scheduler
 */
export function registerEmailJobs(
  scheduler: JobScheduler,
  emailService: EmailService
): void {
  // Email processor job - runs every 30 seconds
  scheduler.registerInterval('email.processor', 30000, async (context: JobContext) => {
    const { emailProcessorJob } = await import('./processor');
    await emailProcessorJob(context, emailService);
  });
  
  // Email queue cleanup job - runs daily at 4 AM
  scheduler.registerCron('email.cleanup', '0 4 * * *', async (context: JobContext) => {
    const { db, logger, jobId } = context;
    logger.debug({ jobId }, 'Starting email cleanup job');
    
    try {
      const { EmailQueueRepository } = await import('../repos/queue.repo');
      const queueRepo = new EmailQueueRepository(db, logger);
      const deletedCount = await queueRepo.cleanupOldEmails(30); // Clean emails older than 30 days
      
      logger.info({ jobId, deletedCount }, 'Email cleanup completed');
    } catch (error) {
      logger.error({ error, jobId }, 'Email cleanup job failed');
      throw error;
    }
  });
}

/**
 * Export job handlers for direct access if needed
 */
export { emailProcessorJob } from './processor';