import type { BaseContext } from '@/types/app';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { BookingEventRepository } from './repos/bookingEvent.repo';

/**
 * deleteBookingEvent
 * 
 * Path: DELETE /booking/events/{eventId}
 * OperationId: deleteBookingEvent
 * Security: bearerAuth with role ["owner"]
 */
export async function deleteBookingEvent(
  ctx: BaseContext
): Promise<Response> {
  // Get authenticated user (guaranteed by auth middleware)
  const user = ctx.get('user') as User;

  // Get validated parameters
  const { event: eventId } = ctx.req.param();
  
  if (!eventId) {
    throw new ValidationError('Event ID is required');
  }

  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');

  // Instantiate repository
  const repo = new BookingEventRepository(db, logger);

  // Check ownership
  const event = await repo.findOneById(eventId);
  if (!event) {
    throw new NotFoundError('Booking event not found', {
      resourceType: 'booking_event',
      resource: eventId,
      suggestions: ['Check event ID', 'Verify event exists']
    });
  }

  if (event.owner !== user.id) {
    throw new ForbiddenError('You can only delete your own booking events');
  }

  // Hard delete the event (cascade will delete associated slots and exceptions)
  await repo.deleteOneById(eventId);

  // Log audit trail
  logger?.info({
    eventId: eventId,
    userId: user.id,
    action: 'delete_booking_event',
    ipAddress: ctx.req.header('x-forwarded-for') || ctx.req.header('x-real-ip'),
    userAgent: ctx.req.header('user-agent')
  }, 'Booking event deleted');

  return new Response(null, { status: 204 });
}
