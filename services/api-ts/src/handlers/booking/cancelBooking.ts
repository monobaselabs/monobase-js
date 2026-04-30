import type { ValidatedContext } from '@/types/app';
import type { CancelBookingBody, CancelBookingParams } from '@/generated/openapi/validators';
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
import { getBookingUserType } from './utils/ownership';

/**
 * cancelBooking
 * 
 * Path: POST /booking/bookings/{booking}/cancel
 * OperationId: cancelBooking
 * 
 * Mutual cancellation - both client and host can cancel confirmed bookings
 * Reason required, timing validation, slot release
 */
export async function cancelBooking(
  ctx: ValidatedContext<CancelBookingBody, never, CancelBookingParams>
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
  
  // Validate required reason
  if (!body.reason || body.reason.trim().length === 0) {
    throw new ValidationError('Cancellation reason is required');
  }
  
  if (body.reason.length > 500) {
    throw new ValidationError('Cancellation reason must be 500 characters or less');
  }
  
  // Get the booking to verify ownership and current status
  const booking = await repo.findOneById(params.booking);
  if (!booking) {
    throw new NotFoundError('Booking not found', {
      resourceType: 'booking',
      resource: params.booking,
      suggestions: ['Check booking ID', 'Verify booking exists', 'Check booking status']
    });
  }
  
  // Check user authorization based on ownership
  const userType = await getBookingUserType(db, logger, user, booking);

  if (!userType) {
    throw new ForbiddenError('You can only cancel your own bookings');
  }
  
  // Use repository method for cancellation with proper slot release
  const cancelledBooking = await repo.cancelBooking(
    params.booking,
    userType,
    body.reason.trim()
  );
  
  // Log audit trail
  logger?.info({
    bookingId: cancelledBooking.id,
    userId: user.id,
    userType,
    clientId: booking.client,
    hostId: booking.host,
    reason: body.reason.trim(),
    cancelledAt: cancelledBooking.cancelledAt,
    slotReleased: booking.slot,
    action: 'booking_cancelled'
  }, `Booking cancelled by ${userType}`);
  
  // Send cancellation notifications and real-time updates to both parties
  try {
    const wsService = ctx.get('ws');

    // Determine notification details based on who cancelled
    const cancellerName = userType === 'host' ? 'host' : 'client';
    const otherParty = userType === 'host' ? 'client' : 'host';
    const otherPartyPersonId = userType === 'host' ? booking.client : booking.host;

    // Both booking.client and booking.host store person IDs directly

    // Notification for the person who cancelled (confirmation)
    // (automatically sends WebSocket notification via NotificationService)
    await notificationService.createNotification({
      recipient: user.id,
      type: 'booking.cancelled',
      channel: 'in-app',
      title: 'Booking Cancelled',
      message: `You have successfully cancelled your booking. The ${otherParty} has been notified.`,
      relatedEntityType: 'booking',
      relatedEntity: cancelledBooking.id,
      consentValidated: true
    });

    // Notification for the other party (cancellation notice)
    // (automatically sends WebSocket notification via NotificationService)
    await notificationService.createNotification({
      recipient: otherPartyPersonId,
      type: 'booking.cancelled',
      channel: 'in-app',
      title: 'Booking Cancelled',
      message: `Your booking has been cancelled by the ${cancellerName}. Reason: ${body.reason.trim()}`,
      relatedEntityType: 'booking',
      relatedEntity: cancelledBooking.id,
      consentValidated: true
    });

    // Send dedicated booking event via WebSocket to other party
    await wsService.publishToUser(otherPartyPersonId, 'booking.cancelled', {
      bookingId: cancelledBooking.id,
      cancelledBy: userType,
      reason: body.reason.trim(),
      cancelledAt: cancelledBooking.cancelledAt,
    });

    logger?.info({
      bookingId: cancelledBooking.id,
      cancelledBy: userType,
      cancelledById: user.id,
      notifiedPartyId: otherPartyPersonId
    }, 'Booking cancellation notifications sent');

  } catch (error) {
    // Non-blocking notification failure
    logger?.error({
      error,
      bookingId: cancelledBooking.id,
      action: 'cancellation_notifications_failed'
    }, 'Failed to send booking cancellation notifications');
  }
  
  return ctx.json(cancelledBooking, 200);
}