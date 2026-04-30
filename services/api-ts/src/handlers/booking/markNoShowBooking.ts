import type { ValidatedContext } from '@/types/app';
import type { MarkNoShowBookingBody, MarkNoShowBookingParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
  BusinessLogicError
} from '@/core/errors';
import { BookingRepository } from './repos/booking.repo';
import type { BookingActionRequest } from './repos/booking.schema';
import { getBookingUserType } from './utils/ownership';
import { differenceInMinutes } from 'date-fns';

/**
 * markNoShowBooking
 * 
 * Path: POST /booking/bookings/{booking}/no-show
 * OperationId: markNoShowBooking
 * 
 * Mark no-show with timing rules and exclusivity:
 * - Client: 5 minutes past scheduled time to mark host no-show
 * - Provider: 10 minutes past scheduled time to mark client no-show  
 * - Only one party can mark no-show (exclusivity)
 */
export async function markNoShowBooking(
  ctx: ValidatedContext<MarkNoShowBookingBody, never, MarkNoShowBookingParams>
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
  
  // Check user authorization and determine marker type based on ownership
  const markerType = await getBookingUserType(db, logger, user, booking);

  if (!markerType) {
    throw new ForbiddenError('You can only mark no-show for your own bookings');
  }
  
  // Validate that no-show hasn't already been marked
  if (booking.status === 'no_show_client' || booking.status === 'no_show_host') {
    throw new BusinessLogicError(
      'No-show has already been marked for this booking',
      'NO_SHOW_ALREADY_MARKED'
    );
  }
  
  // Validate booking must be confirmed to mark no-show
  if (booking.status !== 'confirmed') {
    throw new BusinessLogicError(
      `Cannot mark no-show for booking in ${booking.status} status`,
      'INVALID_STATUS_FOR_NO_SHOW'
    );
  }
  
  // Check timing rules based on scheduled time using date-fns
  const scheduledTime = new Date(booking.scheduledAt);
  const now = new Date();
  const minutesPastScheduled = differenceInMinutes(now, scheduledTime);
  
  // Timing validation based on marker type
  const minimumWaitTime = markerType === 'client' ? 5 : 10; // Client: 5min, Provider: 10min
  
  if (minutesPastScheduled < minimumWaitTime) {
    throw new BusinessLogicError(
      `Must wait ${minimumWaitTime} minutes past scheduled time before marking no-show`,
      'NO_SHOW_TOO_EARLY'
    );
  }
  
  // Use repository method to mark no-show with proper timing validation
  const noShowBooking = await repo.markAsNoShow(
    params.booking,
    markerType
  );
  
  // Determine the other party for logging
  const otherParty = markerType === 'client' ? 'host' : 'client';
  const noShowStatus = markerType === 'client' ? 'no_show_host' : 'no_show_client';
  
  // Log audit trail
  logger?.info({
    bookingId: noShowBooking.id,
    userId: user.id,
    markerType,
    clientId: booking.client,
    hostId: booking.host,
    scheduledAt: booking.scheduledAt,
    minutesPastScheduled: Math.floor(minutesPastScheduled),
    noShowStatus,
    markedAt: noShowBooking.noShowMarkedAt,
    action: 'booking_marked_no_show'
  }, `${otherParty} marked as no-show by ${markerType}`);
  
  return ctx.json(noShowBooking, 200);
}