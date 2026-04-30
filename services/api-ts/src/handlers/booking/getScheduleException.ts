import type { ValidatedContext } from '@/types/app';
import type { GetScheduleExceptionParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { ScheduleExceptionRepository } from './repos/scheduleException.repo';

/**
 * getScheduleException
 * 
 * Path: GET /booking/events/{eventId}/exceptions/{exceptionId}
 * OperationId: getScheduleException
 * Security: bearerAuth with role ["owner"]
 */
export async function getScheduleException(
  ctx: ValidatedContext<never, never, GetScheduleExceptionParams>
): Promise<Response> {
  // Get authenticated user (guaranteed by auth middleware)
  const user = ctx.get('user') as User;
  
  // Get validated parameters
  const params = ctx.req.valid('param') as { event: string; exception: string };

  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');

  // Instantiate repository
  const repo = new ScheduleExceptionRepository(db, logger);

  // Find schedule exception
  const exception = await repo.findOneById(params.exception);

  if (!exception) {
    throw new NotFoundError('Schedule exception not found', {
      resourceType: 'schedule_exception',
      resource: params.exception,
      suggestions: ['Check exception ID', 'Verify exception exists']
    });
  }

  // Check if user has access to this exception
  if (exception.owner !== user.id) {
    throw new ForbiddenError('You can only access your own schedule exceptions');
  }

  // Log audit trail
  logger?.info({
    exceptionId: exception.id,
    userId: user.id,
    action: 'view_schedule_exception'
  }, 'Schedule exception retrieved');

  return ctx.json(exception, 200);
}
