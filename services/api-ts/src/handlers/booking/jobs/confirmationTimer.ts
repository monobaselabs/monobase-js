/**
 * Confirmation Timer Background Job
 * Auto-rejects pending bookings that haven't been confirmed within 15 minutes
 */

import type { JobContext } from '@/core/jobs';
import type { NotificationService } from '@/core/notifs';

// Extended job context that includes notification service
interface ExtendedJobContext extends JobContext {
  notificationService: NotificationService;
}
import { BookingRepository } from '../repos/booking.repo';
import { TimeSlotRepository } from '../repos/timeSlot.repo';
import { subMinutes, differenceInMinutes, addMinutes, differenceInMilliseconds } from 'date-fns';
import { eq, and, lte, isNull } from 'drizzle-orm';
import { bookings, timeSlots } from '../repos/booking.schema';

/**
 * Configuration for confirmation timer job
 */
export interface ConfirmationTimerConfig {
  confirmationWindowMinutes: number; // Time window for host to confirm (default: 15)
  batchSize: number; // Number of bookings to process at once (default: 50)
  includeNotifications: boolean; // Whether to send notifications (default: true)
}

const DEFAULT_CONFIG: ConfirmationTimerConfig = {
  confirmationWindowMinutes: 15,
  batchSize: 50,
  includeNotifications: true
};

/**
 * Auto-rejection job for unconfirmed bookings
 * Runs every minute to check for expired pending bookings
 */
export async function confirmationTimerJob(context: ExtendedJobContext): Promise<void> {
  const { db, logger, jobId } = context;
  const config = { ...DEFAULT_CONFIG };
  
  logger.debug({ jobId, config }, `Starting confirmation timer job`);
  
  const bookingRepo = new BookingRepository(db, logger);
  const timeSlotRepo = new TimeSlotRepository(db, logger);
  
  try {
    // Calculate the cutoff time for auto-rejection
    const cutoffTime = subMinutes(new Date(), config.confirmationWindowMinutes);
    
    logger.debug({
      cutoffTime: cutoffTime.toISOString(),
      windowMinutes: config.confirmationWindowMinutes
    }, 'Checking for expired pending bookings');
    
    // Find all pending bookings that have exceeded the confirmation window
    const expiredBookings = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.status, 'pending'),
          lte(bookings.bookedAt, cutoffTime),
          isNull(bookings.confirmationTimestamp)
        )
      )
      .limit(config.batchSize);
    
    if (expiredBookings.length === 0) {
      logger.debug('No expired pending bookings found');
      return;
    }
    
    logger.info(`Found ${expiredBookings.length} expired pending bookings`);
    
    const results = {
      rejected: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    // Process each expired booking
    for (const booking of expiredBookings) {
      try {
        // Start a transaction to ensure consistency
        await db.transaction(async (tx) => {
          // Update booking status to rejected
          await tx
            .update(bookings)
            .set({
              status: 'rejected',
              cancellationReason: 'Auto-rejected: Provider did not confirm within 15 minutes',
              cancelledBy: 'system',
              cancelledAt: new Date(),
              updatedAt: new Date()
            })
            .where(
              and(
                eq(bookings.id, booking['id']),
                eq(bookings.status, 'pending') // Double-check status hasn't changed
              )
            );
          
          // Release the associated time slot
          if (booking['slot']) {
            await tx
              .update(timeSlots)
              .set({
                status: 'available',
                booking: null,
                updatedAt: new Date()
              })
              .where(eq(timeSlots.id, booking['slot']));
          }
        });
        
        results.rejected++;
        
        logger.info({
          bookingId: booking['id'],
          clientId: booking['client'],
          hostId: booking['host'],
          bookingTime: booking['bookedAt'],
          minutesExpired: differenceInMinutes(new Date(), booking['bookedAt'])
        }, 'Auto-rejected booking');
        
        // Queue notification for client and host
        if (config.includeNotifications) {
          await queueAutoRejectionNotifications(booking, context);
        }
        
      } catch (error) {
        results.failed++;
        const errorMsg = `Failed to auto-reject booking ${booking['id']}: ${error}`;
        results.errors.push(errorMsg);
        
        logger.error({
          bookingId: booking['id'],
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to auto-reject booking');
      }
    }
    
    // Log final results
    logger.info({
      jobId,
      totalProcessed: expiredBookings.length,
      rejected: results.rejected,
      failed: results.failed,
      successRate: `${(results.rejected / expiredBookings.length * 100).toFixed(2)}%`
    }, 'Confirmation timer job completed');
    
    if (results.failed > 0) {
      logger.warn({
        failedCount: results.failed,
        errors: results.errors
      }, 'Some bookings failed to auto-reject');
    }
    
  } catch (error) {
    logger.error({
      jobId,
      error: error instanceof Error ? error.message : String(error)
    }, 'Confirmation timer job failed');
    throw error;
  }
}

/**
 * Queue notifications for auto-rejected bookings
 */
async function queueAutoRejectionNotifications(
  booking: any,
  context: ExtendedJobContext
): Promise<void> {
  const { logger, notificationService } = context;
  
  try {
    // Client notification - booking was auto-rejected
    await notificationService.createNotification({
      recipient: booking.client,
      type: 'booking_auto_rejected',
      title: 'Booking Request Expired',
      message: 'Your booking request has expired as the host did not confirm within 15 minutes.',
      data: {
        bookingId: booking.id,
        hostId: booking.host,
        scheduledAt: booking.scheduledAt?.toISOString(),
        autoRejectedAt: new Date().toISOString(),
        reason: 'Provider did not confirm within 15 minutes'
      },
      channels: ['in-app', 'email', 'sms'],
      priority: 'high'
    } as any);
    
    // Provider notification - booking expired
    await notificationService.createNotification({
      recipient: booking.host,
      type: 'booking_expired',
      title: 'Booking Request Expired',
      message: 'A booking request has expired due to no confirmation within the time limit.',
      data: {
        bookingId: booking.id,
        clientId: booking.client,
        scheduledAt: booking.scheduledAt?.toISOString(),
        autoRejectedAt: new Date().toISOString(),
        missedDeadline: true
      },
      channels: ['in-app', 'email'],
      priority: 'normal'
    } as any);

    logger.info({
      bookingId: booking.id,
      clientId: booking.client,
      hostId: booking.host
    }, 'Auto-rejection notifications sent successfully');
    
  } catch (error) {
    logger.error({
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error)
    }, 'Failed to queue auto-rejection notifications');
    // Don't throw - notification failure shouldn't fail the job
  }
}

/**
 * Check if booking is eligible for auto-rejection
 * Used for manual checks or UI display
 */
export function isEligibleForAutoRejection(
  booking: any,
  confirmationWindowMinutes: number = 15
): boolean {
  if (booking.status !== 'pending') {
    return false;
  }
  
  if (booking.confirmationTimestamp) {
    return false; // Already confirmed
  }
  
  const cutoffTime = subMinutes(new Date(), confirmationWindowMinutes);
  return booking.bookedAt <= cutoffTime;
}

/**
 * Get time remaining before auto-rejection
 * Returns null if not applicable
 */
export function getTimeUntilAutoRejection(
  booking: any,
  confirmationWindowMinutes: number = 15
): number | null {
  if (booking.status !== 'pending' || booking.confirmationTimestamp) {
    return null;
  }
  
  const expirationTime = addMinutes(new Date(booking.bookedAt), confirmationWindowMinutes);

  const now = new Date();
  const remainingMs = differenceInMilliseconds(expirationTime, now);

  return remainingMs > 0 ? Math.floor(remainingMs / 1000) : 0; // Return seconds
}