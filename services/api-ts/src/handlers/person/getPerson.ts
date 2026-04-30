import type { ValidatedContext } from '@/types/app';
import type { GetPersonParams } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { 
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { PersonRepository } from './repos/person.repo';

/**
 * getPerson
 * 
 * Path: GET /persons/{person}
 * OperationId: getPerson
 * Security: bearerAuth with roles ["owner", "admin"]
 */
export async function getPerson(
  ctx: ValidatedContext<never, never, GetPersonParams>
): Promise<Response> {
  // Check if this is an internal expand request
  const isInternalExpand = ctx.get('isInternalExpand');

  // Get authenticated user (may be undefined for internal expand requests)
  const user = ctx.get('user') as User | undefined;

  // Get path parameter
  let personId = ctx.req.param('person');

  // Handle special "me" case - convert to current user's ID
  if (personId === 'me') {
    if (!user) {
      throw new ValidationError('"me" parameter not supported for internal expand requests');
    }
    personId = user.id;
  }

  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');

  // Instantiate repository
  const repo = new PersonRepository(db, logger);

  // Retrieve person
  const person = await repo.findOneById(personId);

  if (!person) {
    throw new NotFoundError('Person not found', {
      resourceType: 'person',
      resource: personId,
      suggestions: ['Check person ID format', 'Verify person exists']
    });
  }

  // Skip authorization for internal expand requests (already authorized at parent resource level)
  if (!isInternalExpand) {
    // Check authorization - owner can only access their own record
    const isOwner = user?.id === personId;

    if (!isOwner) {
      throw new ForbiddenError('Access denied');
    }
  }
  
  // Log audit trail
  logger?.info({
    personId: person.id,
    action: 'view',
    viewedBy: user?.id || 'internal-expand',
    isOwner: isInternalExpand ? null : (user?.id === personId),
    internalExpand: isInternalExpand
  }, 'Person retrieved');
  
  // Ensure dateOfBirth is serialized as ISO string for JSON response
  // Note: With strict typing, dateOfBirth is typed as string | null from DB,
  // but at runtime it might be a Date object. We use type assertion to handle this.
  const dateOfBirth = person.dateOfBirth;
  const serializedDateOfBirth = dateOfBirth && (dateOfBirth as unknown) instanceof Date
    ? (dateOfBirth as unknown as Date).toISOString()
    : dateOfBirth;
  
  const response = { 
    ...person,
    dateOfBirth: serializedDateOfBirth
  };
  
  return ctx.json(response, 200);
}