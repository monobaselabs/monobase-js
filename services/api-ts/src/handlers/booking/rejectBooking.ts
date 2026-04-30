import type { ValidatedContext } from '@/types/app';
import type { RejectBookingBody, RejectBookingParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { NotificationService } from '@/core/notifs';
import type { User } from '@/types/auth';
import { 
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { BookingRepository } from './repos/booking.repo';
import type { BookingActionRequest } from './repos/booking.schema';
import { checkBookingHostOwnership } from './utils/ownership';

/**
 * rejectBooking
 * 
 * Path: POST /booking/bookings/{booking}/reject
 * OperationId: rejectBooking
 * 
 * Provider rejects booking, releases slot, triggers notifications
 * Only the host who owns the booking can reject it
 */
export async function rejectBooking(
  ctx: ValidatedContext<RejectBookingBody, never, RejectBookingParams>
): Promise<Response> {
  // Get authenticated user from Better-Auth (guaranteed by middleware)
  const user = ctx.get('user') as User;
  
  // Extract validated parameters
  const params = ctx.req.valid('param') as { booking: string };
  const body = ctx.req.valid('json') as BookingActionRequest;
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  const auth = ctx.get('auth');
  const notificationService = ctx.get('notifs') as NotificationService;
  
  // Instantiate repository
  const repo = new BookingRepository(db, logger);
  
  
  // Get the booking to verify ownership and current status
  const booking = await repo.findOneById(params.booking);
  if (!booking) {
    throw new NotFoundError('Booking not found', {
      resourceType: 'booking',
      resource: params.booking,
      suggestions: ['Check booking ID', 'Verify booking exists', 'Check booking status']
    });
  }
  
  // Check host ownership - user must be the host for this booking
  if (!(await checkBookingHostOwnership(db, logger, user, booking))) {
    throw new ForbiddenError('You can only reject your own bookings');
  }
  
  // Validate current status - can only reject pending bookings
  if (booking.status !== 'pending') {
    throw new BusinessLogicError(
      `Cannot reject booking in ${booking.status} status`,
      'INVALID_STATUS_TRANSITION'
    );
  }
  
  // Validate reason length if provided
  if (body.reason && body.reason.length > 500) {
    throw new ValidationError('Rejection reason must be 500 characters or less');
  }
  
  // Update booking status to rejected and release the slot
  // This is done in the repository's updateOneById method with slot release
  const rejectedBooking = await repo.updateOneById(params.booking, {
    status: 'rejected',
    cancellationReason: body.reason || 'Rejected by host',
    cancelledBy: 'host',
    cancelledAt: new Date()
  });
  
  // Release the associated slot back to available
  // This should be done in a transaction, but for simplicity using direct DB access
  const { timeSlots } = await import('./repos/booking.schema');
  const { eq } = await import('drizzle-orm');
  
  await db
    .update(timeSlots)
    .set({ 
      status: 'available',
      booking: null
    })
    .where(eq(timeSlots.id, booking.slot));
  
  // Log audit trail
  logger?.info({
    bookingId: rejectedBooking.id,
    hostId: user.id,
    clientId: booking.client,
    reason: body.reason,
    rejectedAt: rejectedBooking.cancelledAt,
    slotReleased: booking.slot,
    action: 'booking_rejected'
  }, 'Booking rejected by host');
  
  // Send rejection notifications and real-time updates to both parties
  try {
    const wsService = ctx.get('ws');
    const rejectionReason = body.reason || 'Rejected by host';

    // Both booking.client and booking.host now store person IDs directly

    // Notification for client - booking was rejected
    // (automatically sends WebSocket notification via NotificationService)
    await notificationService.createNotification({
      recipient: booking.client,
      type: 'booking.rejected',
      channel: 'in-app',
      title: 'Booking Rejected',
      message: `Your booking request has been rejected by the host. Reason: ${rejectionReason}`,
      relatedEntityType: 'booking',
      relatedEntity: rejectedBooking.id,
      consentValidated: true
    });

    // Send dedicated booking event via WebSocket
    await wsService.publishToUser(booking.client, 'booking.rejected', {
      bookingId: rejectedBooking.id,
      hostId: user.id,
      reason: rejectionReason,
      rejectedAt: rejectedBooking.cancelledAt,
    });

    // Notification for host - rejection confirmation
    // (automatically sends WebSocket notification via NotificationService)
    await notificationService.createNotification({
      recipient: user.id,
      type: 'booking.rejected',
      channel: 'in-app',
      title: 'Rejection Confirmed',
      message: 'Booking rejection has been sent to the client. The time slot is now available.',
      relatedEntityType: 'booking',
      relatedEntity: rejectedBooking.id,
      consentValidated: true
    });

    logger?.info({
      bookingId: rejectedBooking.id,
      clientId: booking.client,
      hostId: user.id,
      slotReleased: booking.slot
    }, 'Booking rejection notifications sent');

  } catch (error) {
    // Non-blocking notification failure
    logger?.error({
      error,
      bookingId: rejectedBooking.id,
      action: 'rejection_notifications_failed'
    }, 'Failed to send booking rejection notifications');
  }
  
  return ctx.json(rejectedBooking, 200);
}