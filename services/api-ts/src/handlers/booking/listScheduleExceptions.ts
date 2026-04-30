import type { ValidatedContext } from '@/types/app';
import type { ListScheduleExceptionsQuery, ListScheduleExceptionsParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import { 
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import type { User } from '@/types/auth';
import { ScheduleExceptionRepository, type ScheduleExceptionFilters } from './repos/scheduleException.repo';
import { BookingEventRepository } from './repos/bookingEvent.repo';
import { parsePagination, parseFilters, buildPaginationMeta } from '@/utils/query';
import { checkBookingEventOwnership } from './utils/authorization';

/**
 * listScheduleExceptions
 *
 * Path: GET /booking/events/{event}/exceptions
 * OperationId: listScheduleExceptions
 *
 * List event's schedule exceptions with filtering by date range and type.
 * Requires event ownership, admin, or support permissions.
 */
export async function listScheduleExceptions(
  ctx: ValidatedContext<never, ListScheduleExceptionsQuery, ListScheduleExceptionsParams>
): Promise<Response> {
  // Get authenticated user (guaranteed by middleware)
  const user = ctx.get('user') as User;
  
  // Extract validated parameters
  const params = ctx.req.valid('param') as { event: string };
  
  // Extract validated query parameters
  const query = (ctx.req.valid('query') || {}) as {
    dateStart?: string;
    dateEnd?: string;
    recurring?: string;
    reason?: string;
    limit?: number;
    offset?: number;
    page?: number;
    pageSize?: number;
  };
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  const auth = ctx.get('auth');
  
  // Instantiate repositories
  const exceptionRepo = new ScheduleExceptionRepository(db, logger);
  const eventRepo = new BookingEventRepository(db, logger);

  // Verify event exists
  const event = await eventRepo.findOneById(params.event);
  if (!event) {
    throw new NotFoundError('Booking event not found', {
      resourceType: 'booking_event',
      resource: params.event,
      suggestions: ['Check event ID format', 'Verify event exists in system', 'Create a booking event first']
    });
  }

  // Check authorization (event ownership)
  await checkBookingEventOwnership(db, auth, user, event.owner, params.event);
  
  // Parse filters
  const allowedFilters = ['dateStart', 'dateEnd', 'recurring', 'reason'];
  const baseFilters = parseFilters(query, allowedFilters);
  
  // Build exception-specific filters
  const filters: ScheduleExceptionFilters = {
    owner: event.owner,
    ...baseFilters
  };
  
  // Convert date range filters
  if (query.dateStart && query.dateEnd) {
    filters.dateRange = {
      start: new Date(query.dateStart),
      end: new Date(query.dateEnd)
    };
  }
  
  // Convert recurring filter
  if (query.recurring !== undefined) {
    filters.recurring = query.recurring === 'true';
  }
  
  // Parse pagination
  const pagination = parsePagination(query, { limit: 25, maxLimit: 100 });
  
  // Get exceptions with filters and pagination
  const exceptions = await exceptionRepo.findMany(filters, {
    pagination,
    orderBy: { field: 'startDatetime', direction: 'asc' }
  });
  
  // Get total count for pagination metadata
  const totalCount = await exceptionRepo.count(filters);
  
  // Build pagination metadata
  const meta = buildPaginationMeta(
    exceptions,
    totalCount,
    pagination.limit,
    pagination.offset
  );
  
  // Log audit trail
  logger?.info({
    eventId: params.event,
    ownerId: event.owner,
    userId: user.id,
    filtersApplied: filters,
    resultCount: exceptions.length,
    totalCount,
    action: 'list_schedule_exceptions'
  }, 'Schedule exceptions listed');
  
  return ctx.json({
    data: exceptions,
    pagination: meta
  }, 200);
}