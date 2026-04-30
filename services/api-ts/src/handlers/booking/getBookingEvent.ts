import type { ValidatedContext } from '@/types/app';
import type { GetBookingEventQuery, GetBookingEventParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  NotFoundError,
  UnauthorizedError
} from '@/core/errors';
import { BookingEventRepository } from './repos/bookingEvent.repo';

/**
 * getBookingEvent
 *
 * Path: GET /booking/events/{event}
 * OperationId: getBookingEvent
 * Security: Optional authentication (supports "me" parameter)
 */
export async function getBookingEvent(
  ctx: ValidatedContext<never, GetBookingEventQuery, GetBookingEventParams>
): Promise<Response> {
  // Get validated parameters
  const params = ctx.req.valid('param') as { event: string };
  const query = ctx.req.valid('query') as { expand?: string };

  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');

  // Instantiate repository
  const repo = new BookingEventRepository(db, logger);

  // Resolve "me" parameter
  let eventId = params.event;
  if (eventId === 'me') {
    const user = ctx.get('user') as User | undefined;
    if (!user) {
      throw new UnauthorizedError('Authentication required for "me" parameter');
    }

    // Find user's first event by owner
    const userEvents = await repo.findMany({ owner: user.id }, { pagination: { limit: 1, offset: 0 } });
    if (!userEvents.length) {
      throw new NotFoundError('No booking events found for current user');
    }
    const firstEvent = userEvents[0];
    if (!firstEvent) {
      throw new NotFoundError('No booking events found for current user');
    }
    eventId = firstEvent.id;
  }

  // Find booking event (expand handled automatically by middleware)
  const event = await repo.findOneById(eventId);
  
  if (!event) {
    throw new NotFoundError('Booking event not found', {
      resourceType: 'booking_event',
      resource: params.event,
      suggestions: ['Check event ID', 'Verify event exists']
    });
  }

  // Log access (public endpoint - no user ID)
  logger?.info({
    eventId: event.id,
    action: 'view_booking_event_public',
    expand: query.expand
  }, 'Booking event retrieved (public)');

  return ctx.json(event, 200);
}
