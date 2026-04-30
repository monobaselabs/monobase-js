import type { ValidatedContext } from '@/types/app';
import type { CreateBookingBody } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError,
  ConflictError
} from '@/core/errors';
import { BookingRepository } from './repos/booking.repo';
import type { BookingCreateRequest } from './repos/booking.schema';

/**
 * createBooking
 * 
 * Path: POST /booking/bookings
 * OperationId: createBooking
 * Security: bearerAuth with role ["owner"]
 */
export async function createBooking(
  ctx: ValidatedContext<CreateBookingBody, never, never>
): Promise<Response> {
  // Get authenticated user (guaranteed by auth middleware)
  const user = ctx.get('user') as User;
  
  // Get validated request body
  const body = ctx.req.valid('json') as BookingCreateRequest;
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  
  // Instantiate repository
  const repo = new BookingRepository(db, logger);
  
  // Create booking with slot validation
  const booking = await repo.createBooking(user.id, body.slot, body);
  
  // Log audit trail
  logger?.info({
    bookingId: booking['id'],
    clientId: user.id,
    slotId: body.slot,
    locationType: body.locationType,
    action: 'create_booking',
    ipAddress: ctx.req.header('x-forwarded-for') || ctx.req.header('x-real-ip'),
    userAgent: ctx.req.header('user-agent')
  }, 'Booking created');

  return ctx.json(booking, 201);
}
