import type { ValidatedContext } from '@/types/app';
import type { ListPersonsQuery } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { PersonRepository } from './repos/person.repo';
import { parsePagination, buildPaginationMeta, parseFilters, parseSort } from '@/utils/query';

/**
 * listPersons
 * 
 * Path: GET /persons
 * OperationId: listPersons
 * Security: bearerAuth with role ["admin"]
 */
export async function listPersons(
  ctx: ValidatedContext<never, ListPersonsQuery>
): Promise<Response> {
  // Get authenticated user (guaranteed by auth middleware)
  const user = ctx.get('user') as User;
  
  // Extract validated query parameters - now properly typed!
  const query = ctx.req.valid('query');
  
  // Parse pagination with utilities
  const { limit, offset } = parsePagination(query);
  
  // Parse filters with utilities
  const filters = parseFilters(query, ['q']);
  
  // Parse and validate sort parameter
  const allowedSortFields = ['firstName', 'lastName', 'createdAt', 'updatedAt'];
  const sort = parseSort(query, allowedSortFields, 'createdAt:desc');
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  
  // Instantiate repository
  const repo = new PersonRepository(db, logger);
  
  // Retrieve persons with pagination and sorting
  const persons = await repo.findMany(filters, {
    pagination: { limit, offset },
    orderBy: sort ? { field: sort.field, direction: sort.direction } : undefined
  });
  
  // Get total count for pagination metadata
  const totalCount = await repo.count(filters);
  
  // Build pagination metadata
  const paginationMeta = buildPaginationMeta(persons, totalCount, limit, offset);
  
  // Log audit trail
  logger?.info({
    action: 'list',
    filters,
    pagination: { limit, offset },
    resultCount: persons.length,
    totalCount,
    listedBy: user.id
  }, 'Persons listed');
  
  // Return standardized paginated response
  return ctx.json({
    data: persons,
    pagination: paginationMeta
  }, 200);
}