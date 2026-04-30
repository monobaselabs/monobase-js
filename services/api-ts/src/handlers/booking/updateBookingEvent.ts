/**
 * Update Booking Event Handler
 * Updates an existing booking event
 */

import type { ValidatedContext } from '@/types/app';
import type { UpdateBookingEventBody } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { ValidationError } from '@/core/errors';
import { BookingEventRepository } from './repos/bookingEvent.repo';
import type { BookingEventUpdateRequest } from './repos/booking.schema';
import { regenerateEventSlots } from './jobs/slotGenerator';

export async function updateBookingEvent(
  ctx: ValidatedContext<UpdateBookingEventBody, never, never>
): Promise<Response> {
  // Get authenticated user
  const user = ctx.get('user') as User;

  // Get path parameters and validated body
  const { event: eventId } = ctx.req.param();
  
  if (!eventId) {
    throw new ValidationError('Event ID is required');
  }
  
  const body = ctx.req.valid('json') as BookingEventUpdateRequest;

  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');

  const repo = new BookingEventRepository(db, logger);

  try {
    // Check ownership
    const existingEvent = await repo.findOneById(eventId);
    if (!existingEvent) {
      return ctx.json({ error: 'Booking event not found' }, 404);
    }

    if (existingEvent.owner !== user.id) {
      return ctx.json({ error: 'Access denied' }, 403);
    }

    // Validate updates
    const errors = repo.validateEventConfig(body);
    if (errors.length > 0) {
      return ctx.json({ error: 'Validation failed', details: errors }, 400);
    }

    // Update with change detection
    const { event: updatedEvent, requiresSlotRegeneration, changes } = await repo.updateWithChangeDetection(eventId, body);

    // Log audit trail with change details
    logger?.info({
      eventId: updatedEvent.id,
      ownerId: updatedEvent.owner,
      action: 'update',
      updatedBy: user.id,
      changes,
      requiresSlotRegeneration
    }, 'Booking event updated with change detection');

    // If major changes were detected, regenerate slots immediately
    if (requiresSlotRegeneration) {
      logger?.info({
        eventId: updatedEvent.id,
        ownerId: updatedEvent.owner,
        changes
      }, 'Event update requires slot regeneration - regenerating now');

      // Regenerate slots and let errors propagate to the client
      await regenerateEventSlots(db, updatedEvent.id);
      logger?.info({ eventId: updatedEvent.id, ownerId: updatedEvent.owner }, 'Slots regenerated successfully');
    }

    return ctx.json(updatedEvent);
  } catch (error) {
    logger?.error({ error, eventId }, 'Failed to update booking event');
    return ctx.json({ error: 'Failed to update booking event' }, 500);
  }
}