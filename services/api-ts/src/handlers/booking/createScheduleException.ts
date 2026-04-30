import type { ValidatedContext } from '@/types/app';
import type { CreateScheduleExceptionBody, CreateScheduleExceptionParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { ScheduleExceptionRepository } from './repos/scheduleException.repo';
import { BookingEventRepository } from './repos/bookingEvent.repo';
import type { ScheduleExceptionCreateRequest } from './repos/booking.schema';

/**
 * createScheduleException
 * 
 * Path: POST /booking/events/{eventId}/exceptions
 * OperationId: createScheduleException
 * Security: bearerAuth with role ["owner"]
 */
export async function createScheduleException(
  ctx: ValidatedContext<CreateScheduleExceptionBody, never, CreateScheduleExceptionParams>
): Promise<Response> {
  // Get authenticated user (guaranteed by auth middleware)
  const user = ctx.get('user') as User;
  
  // Get validated parameters
  const params = ctx.req.valid('param') as { event: string };
  const body = ctx.req.valid('json') as any; // Type will be validated by repository

  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');

  // Instantiate repositories
  const eventRepo = new BookingEventRepository(db, logger);
  const exceptionRepo = new ScheduleExceptionRepository(db, logger);

  // Verify event ownership
  const event = await eventRepo.findOneById(params.event);
  if (!event) {
    throw new NotFoundError('Booking event not found', {
      resourceType: 'booking_event',
      resource: params.event,
      suggestions: ['Check event ID', 'Verify event exists']
    });
  }

  if (event.owner !== user.id) {
    throw new ForbiddenError('You can only create exceptions for your own booking events');
  }

  // Create exception
  const exception = await exceptionRepo.createExceptionForEvent(params.event, user.id, body);

  // Log audit trail
  logger?.info({
    exceptionId: exception.id,
    eventId: params.event,
    ownerId: user.id,
    startDatetime: exception.startDatetime,
    endDatetime: exception.endDatetime,
    recurring: exception.recurring,
    action: 'create_schedule_exception',
    ipAddress: ctx.req.header('x-forwarded-for') || ctx.req.header('x-real-ip'),
    userAgent: ctx.req.header('user-agent')
  }, 'Schedule exception created');

  return ctx.json(exception, 201);
}
