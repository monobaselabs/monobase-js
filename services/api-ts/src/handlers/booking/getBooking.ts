import type { ValidatedContext } from '@/types/app';
import type { GetBookingQuery, GetBookingParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { BookingRepository } from './repos/booking.repo';
import { checkBookingOwnership } from './utils/ownership';

/**
 * getBooking
 *
 * Path: GET /booking/bookings/{booking}
 * OperationId: getBooking
 *
 * Supports expansion: host, client, slot
 * Role-based access: clients see own, hosts see theirs, admin sees all
 */
export async function getBooking(
  ctx: ValidatedContext<never, GetBookingQuery, GetBookingParams>
): Promise<Response> {
  // Get authenticated user from Better-Auth (guaranteed by middleware)
  const user = ctx.get('user') as User;
  
  // Extract validated parameters
  const params = ctx.req.valid('param') as { booking: string };
  const query = ctx.req.valid('query') as { expand?: string[] };
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  const auth = ctx.get('auth');
  
  // Instantiate repository
  const repo = new BookingRepository(db, logger);

  // Get booking (expand handled automatically by middleware)
  const booking = await repo.findOneById(params.booking);
    
  if (!booking) {
    throw new NotFoundError('Booking not found', {
      resourceType: 'booking',
      resource: params.booking,
      suggestions: ['Check booking ID', 'Verify booking exists', 'Check booking status']
    });
  }
  
  // Check authorization based on ownership
  if (!(await checkBookingOwnership(db, logger, user, booking))) {
    throw new ForbiddenError('You can only access your own bookings');
  }
  
  // Log audit trail
  logger?.info({
    bookingId: booking.id,
    userId: user.id,
    action: 'view_booking'
  }, 'Booking retrieved');
  
  return ctx.json(booking, 200);
}