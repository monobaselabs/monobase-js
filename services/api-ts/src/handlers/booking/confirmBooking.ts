import type { ValidatedContext } from '@/types/app';
import type { ConfirmBookingBody, ConfirmBookingParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { 
  ForbiddenError,
  NotFoundError
} from '@/core/errors';
import { BookingRepository } from './repos/booking.repo';
import type { BookingActionRequest } from './repos/booking.schema';
import { checkBookingHostOwnership } from './utils/ownership';

/**
 * confirmBooking
 * 
 * Path: POST /booking/bookings/{booking}/confirm
 * OperationId: confirmBooking
 * 
 * Provider confirms booking within 15-minute window
 * Only the host who owns the booking can confirm it
 */
export async function confirmBooking(
  ctx: ValidatedContext<ConfirmBookingBody, never, ConfirmBookingParams>
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
  const notificationService = ctx.get('notifs');
  
  // Instantiate repository
  const repo = new BookingRepository(db, logger);
  
  
  // Get the booking to verify ownership
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
    throw new ForbiddenError('You can only confirm your own bookings');
  }
  
  // Attempt to confirm the booking
  // Repository handles timing validation and status transitions
  const confirmedBooking = await repo.confirmBooking(params.booking);
  
  // Log audit trail
  logger?.info({
    bookingId: confirmedBooking.id,
    hostId: user.id,
    clientId: booking.client,
    confirmedAt: confirmedBooking.confirmationTimestamp,
    action: 'booking_confirmed'
  }, 'Booking confirmed by host');
  
  // Send notifications and real-time updates to both client and host
  try {
    const wsService = ctx.get('ws');

    // Both booking.client and booking.host now store person IDs directly

    // Notification for client - booking confirmed
    // (automatically sends WebSocket notification via NotificationService)
    await notificationService.createNotification({
      recipient: booking.client,
      type: 'booking.confirmed',
      channel: 'in-app',
      title: 'Booking Confirmed',
      message: 'Your booking has been confirmed by the host.',
      relatedEntityType: 'booking',
      relatedEntity: confirmedBooking.id,
      consentValidated: true
    });

    // Send dedicated booking event via WebSocket
    await wsService.publishToUser(booking.client, 'booking.confirmed', {
      bookingId: confirmedBooking.id,
      hostId: user.id,
      confirmedAt: confirmedBooking.confirmationTimestamp,
    });

    // Notification for host - confirmation acknowledgment
    // (automatically sends WebSocket notification via NotificationService)
    await notificationService.createNotification({
      recipient: user.id,
      type: 'booking.confirmed',
      channel: 'in-app',
      title: 'Confirmation Sent',
      message: 'Booking confirmation has been sent to the client.',
      relatedEntityType: 'booking',
      relatedEntity: confirmedBooking.id,
      consentValidated: true
    });

    logger?.info({
      bookingId: confirmedBooking.id,
      clientId: booking.client,
      hostId: user.id
    }, 'Booking confirmation notifications sent');

  } catch (error) {
    // Non-blocking notification failure
    logger?.error({
      error,
      bookingId: confirmedBooking.id,
      action: 'confirmation_notifications_failed'
    }, 'Failed to send booking confirmation notifications');
  }
  
  return ctx.json(confirmedBooking, 200);
}