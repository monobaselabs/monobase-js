import type { ValidatedContext } from '@/types/app';
import type { GetTimeSlotQuery, GetTimeSlotParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import { NotFoundError } from '@/core/errors';
import { TimeSlotRepository } from './repos/timeSlot.repo';

/**
 * getTimeSlot
 *
 * Path: GET /booking/slots/{slotId}
 * OperationId: getTimeSlot
 */
export async function getTimeSlot(
  ctx: ValidatedContext<never, GetTimeSlotQuery, GetTimeSlotParams>
): Promise<Response> {
  // Public endpoint - no auth required

  // Extract validated parameters
  const params = ctx.req.valid('param') as { slotId: string };
  const query = ctx.req.valid('query') as { expand?: string };

  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');

  // Use repository pattern
  const slotRepo = new TimeSlotRepository(db, logger);

  // Find time slot (expand handled automatically by middleware)
  const slot = await slotRepo.findOneById(params.slotId);

  if (!slot) {
    throw new NotFoundError('Time slot not found', {
      resourceType: 'timeSlot',
      resource: params.slotId
    });
  }

  return ctx.json(slot, 200);
}