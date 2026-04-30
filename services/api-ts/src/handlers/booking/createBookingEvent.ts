import type { ValidatedContext } from '@/types/app';
import type { CreateBookingEventBody } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { BookingEventRepository } from './repos/bookingEvent.repo';
import type { BookingEventCreateRequest } from './repos/booking.schema';
import { regenerateEventSlots } from './jobs/slotGenerator';

/**
 * createBookingEvent
 * 
 * Path: POST /booking/events
 * OperationId: createBookingEvent
 * Security: bearerAuth with role ["owner"]
 */
export async function createBookingEvent(
  ctx: ValidatedContext<CreateBookingEventBody, never, never>
): Promise<Response> {
  // Get authenticated user (guaranteed by auth middleware)
  const user = ctx.get('user') as User;
  
  // Get validated request body
  const body = ctx.req.valid('json') as BookingEventCreateRequest;
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  
  // Instantiate repository
  const repo = new BookingEventRepository(db, logger);
  
  // Validate request
  const errors = repo.validateEventConfig(body);
  if (errors.length > 0) {
    throw new ValidationError('Invalid booking event configuration');
  }

  // Create booking event with smart defaults
  const event = await repo.createWithSmartDefaults(user.id, body);

  // Generate initial slots for this specific event only
  await regenerateEventSlots(db, event.id);
  logger?.info({ eventId: event.id, ownerId: user.id }, 'Initial slots generated successfully');

  // Log audit trail
  logger?.info({
    eventId: event.id,
    ownerId: user.id,
    title: event.title,
    status: event.status,
    action: 'create_booking_event',
    ipAddress: ctx.req.header('x-forwarded-for') || ctx.req.header('x-real-ip'),
    userAgent: ctx.req.header('user-agent')
  }, 'Booking event created');

  return ctx.json(event, 201);
}
