import type { ValidatedContext } from '@/types/app';
import type { UpdatePersonBody } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import { 
  ForbiddenError,
  NotFoundError,
  ValidationError,
  BusinessLogicError
} from '@/core/errors';
import { PersonRepository } from './repos/person.repo';
import { type PersonUpdateRequest } from './repos/person.schema';
import { validateDateOfBirth } from '@/utils/date';

/**
 * updatePerson
 * 
 * Path: PATCH /persons/{person}
 * OperationId: updatePerson
 * Security: bearerAuth with role ["owner"]
 */
export async function updatePerson(
  ctx: ValidatedContext<UpdatePersonBody, never, never>
): Promise<Response> {
  // Get authenticated user (guaranteed by auth middleware)
  const user = ctx.get('user') as User;
  
  // Get path parameter
  const personId = ctx.req.param('person');
  
  // Check authorization - only owner can update their own record
  if (user.id !== personId) {
    throw new ForbiddenError('You can only update your own profile');
  }
  
  // Get validated request body 
  const body = ctx.req.valid('json');
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  
  // Instantiate repository
  const repo = new PersonRepository(db, logger);
  
  // Check if person exists
  const existingPerson = await repo.findOneById(personId);
  if (!existingPerson) {
    throw new NotFoundError('Person not found', {
      resourceType: 'person',
      resource: personId,
      suggestions: ['Check person ID format', 'Verify person exists']
    });
  }
  
  // Build update data with only defined fields
  // undefined = field not provided (no change)
  // null = explicitly clear the field
  const updateData: any = { updatedBy: user.id };

  if (body.firstName !== undefined) updateData.firstName = body.firstName;
  if (body.lastName !== undefined) updateData.lastName = body.lastName;
  if (body.middleName !== undefined) updateData.middleName = body.middleName;
  if (body.dateOfBirth !== undefined) {
    if (body.dateOfBirth === null) {
      updateData.dateOfBirth = null;
    } else {
      const dateOfBirth = new Date(body.dateOfBirth);
      validateDateOfBirth(dateOfBirth);
      updateData.dateOfBirth = dateOfBirth;
    }
  }
  if (body.gender !== undefined) updateData.gender = body.gender;
  if (body.contactInfo !== undefined) updateData.contactInfo = body.contactInfo;
  if (body.primaryAddress !== undefined) updateData.primaryAddress = body.primaryAddress;
  if (body.avatar !== undefined) updateData.avatar = body.avatar;
  if (body.languagesSpoken !== undefined) updateData.languagesSpoken = body.languagesSpoken;
  if (body.timezone !== undefined) updateData.timezone = body.timezone;
  
  // Update person record
  const updatedPerson = await repo.updateOneById(personId, updateData);

  // Log audit trail for compliance
  const audit = ctx.get('audit');
  if (audit) {
    try {
      await audit.logEvent({
        eventType: 'data-modification',
        category: 'privacy',
        action: 'update',
        outcome: 'success',
        user: user.id,
        userType: (user.role === 'user' ? 'client' : user.role || 'client') as 'client' | 'host' | 'admin' | 'system',
        resourceType: 'person',
        resource: personId,
        description: 'Person profile updated',
        details: {
          updatedFields: Object.keys(updateData).filter(key => key !== 'updatedBy'),
          isOwner: true
        },
        ipAddress: ctx.req.header('x-forwarded-for') || ctx.req.header('x-real-ip'),
        userAgent: ctx.req.header('user-agent')
      });
    } catch (error) {
      logger?.error({ error, personId }, 'Failed to log audit event for person update');
    }
  }

  // Log basic info
  logger?.info({
    personId: updatedPerson.id,
    action: 'update',
    updatedFields: Object.keys(updateData).filter(key => key !== 'updatedBy'),
    updatedBy: user.id,
    ipAddress: ctx.req.header('x-forwarded-for') || ctx.req.header('x-real-ip')
  }, 'Person updated');

  return ctx.json(updatedPerson, 200);
}