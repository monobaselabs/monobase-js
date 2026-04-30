import type { ValidatedContext } from '@/types/app';
import type { ListEventSlotsQuery, ListEventSlotsParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import { NotFoundError } from '@/core/errors';
import { TimeSlotRepository } from './repos/timeSlot.repo';
import { BookingEventRepository } from './repos/bookingEvent.repo';
import { addDays } from 'date-fns';

/**
 * listEventSlots
 * 
 * Path: GET /booking/events/{event}/slots
 * OperationId: listEventSlots
 * Security: Optional authentication
 */
export async function listEventSlots(
  ctx: ValidatedContext<never, ListEventSlotsQuery, ListEventSlotsParams>
): Promise<Response> {
  // Get validated parameters
  const params = ctx.req.valid('param') as { event: string };
  const query = ctx.req.valid('query') as { 
    startTime?: Date; 
    endTime?: Date; 
    status?: 'available' | 'booked' | 'blocked';
  };
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  
  // Verify event exists
  const eventRepo = new BookingEventRepository(db, logger);
  const event = await eventRepo.findOneById(params.event);
  
  if (!event) {
    throw new NotFoundError('Booking event not found', {
      resourceType: 'booking_event',
      resource: params.event
    });
  }
  
  // Instantiate repository
  const slotRepo = new TimeSlotRepository(db, logger);
  
  // Default time range: now to +7 days
  const startTime = query.startTime || new Date();
  const endTime = query.endTime || addDays(startTime, 7);
  const status = query.status || 'available'; // Default to available slots
  
  logger?.info({ 
    eventId: params.event, 
    startTime, 
    endTime, 
    status 
  }, 'Listing event slots');
  
  // Query slots with filters
  const slots = await slotRepo.findMany({
    event: params.event,
    status,
    timeRange: { start: startTime, end: endTime }
  });
  
  logger?.info({ 
    eventId: params.event, 
    slotCount: slots.length 
  }, 'Event slots retrieved');
  
  return ctx.json(slots, 200);
}
