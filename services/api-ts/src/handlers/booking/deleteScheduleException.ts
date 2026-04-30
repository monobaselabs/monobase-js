import type { ValidatedContext } from '@/types/app';
import type { DeleteScheduleExceptionParams } from '@/generated/openapi/validators';
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
 * deleteScheduleException
 * 
 * Path: DELETE /booking/events/{eventId}/exceptions/{exceptionId}
 * OperationId: deleteScheduleException
 * Security: bearerAuth with role ["owner"]
 */
export async function deleteScheduleException(
  ctx: ValidatedContext<never, never, DeleteScheduleExceptionParams>
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

  // Check ownership
  const exception = await repo.findOneById(params.exception);
  if (!exception) {
    throw new NotFoundError('Schedule exception not found', {
      resourceType: 'schedule_exception',
      resource: params.exception,
      suggestions: ['Check exception ID', 'Verify exception exists']
    });
  }

  if (exception.owner !== user.id) {
    throw new ForbiddenError('You can only delete your own schedule exceptions');
  }

  // Delete the exception
  await repo.deleteOneById(params.exception);

  // Log audit trail
  logger?.info({
    exceptionId: params.exception,
    userId: user.id,
    action: 'delete_schedule_exception',
    ipAddress: ctx.req.header('x-forwarded-for') || ctx.req.header('x-real-ip'),
    userAgent: ctx.req.header('user-agent')
  }, 'Schedule exception deleted');

  return new Response(null, { status: 204 });
}
