import type { ValidatedContext } from '@/types/app';
import type { ListBookingsQuery } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { 
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { BookingRepository, type BookingFilters } from './repos/booking.repo';
import { parsePagination, parseFilters, buildPaginationMeta } from '@/utils/query';

/**
 * listBookings
 *
 * Path: GET /booking/bookings
 * OperationId: listBookings
 *
 * Role-based filtering:
 * - Clients see only their own bookings
 * - Providers see only their bookings
 * - Admins see all bookings (with optional filtering)
 */
export async function listBookings(
  ctx: ValidatedContext<never, ListBookingsQuery, never>
): Promise<Response> {
  // Get authenticated user from Better-Auth (guaranteed by middleware)
  const user = ctx.get('user') as User;
  
  // Extract validated query parameters
  const query = ctx.req.valid('query') as {
    client?: string;
    host?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
    page?: number;
    pageSize?: number;
  };
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  const auth = ctx.get('auth');
  
  // Instantiate repository
  const repo = new BookingRepository(db, logger);
  
  // Build base filters from query parameters
  const allowedFilters = [
    'client', 'host', 'status'
  ];
  const filters = parseFilters(query, allowedFilters) as BookingFilters;

  // Add date range if provided
  if (query.startDate && query.endDate) {
    filters.dateRange = {
      start: new Date(query.startDate),
      end: new Date(query.endDate)
    };
  }

  // Apply ownership-based filtering - user can only see their own bookings
  if (query.host && query.host !== user.id) {
    throw new ForbiddenError('You can only access bookings you host');
  }
  if (query.client && query.client !== user.id) {
    throw new ForbiddenError('You can only access bookings you booked as a client');
  }

  // If no specific host/client filter, show all bookings where user is either client OR host
  if (!query.host && !query.client) {
    filters.clientOrHost = user.id;
  }
  
  // Parse pagination
  const pagination = parsePagination(query, { limit: 25, maxLimit: 100 });
  
  // Get bookings with filters and pagination
  const bookings = await repo.findMany(filters, {
    pagination,
    orderBy: { field: 'scheduledAt', direction: 'desc' }
  });
  
  // Get total count for pagination metadata
  const totalCount = await repo.count(filters);
  
  // Build pagination metadata
  const meta = buildPaginationMeta(
    bookings,
    totalCount,
    pagination.limit,
    pagination.offset
  );
  
  // Log audit trail
  logger?.info({
    userId: user.id,
    filtersApplied: filters,
    resultCount: bookings.length,
    totalCount,
    action: 'list_bookings'
  }, 'Bookings listed');
  
  return ctx.json({
    data: bookings,
    pagination: meta
  }, 200);
}