import type { ValidatedContext } from '@/types/app';
import type { CreatePersonBody } from '@/generated/openapi/validators';
import type { DatabaseInstance } from '@/core/database';
import type { User } from '@/types/auth';
import {
  ConflictError
} from '@/core/errors';
import { PersonRepository } from './repos/person.repo';
import { validatedDateOfBirth } from '@/utils/date';

/**
 * createPerson
 * 
 * Path: POST /persons
 * OperationId: createPerson
 * Security: bearerAuth with role ["owner"]
 */
export async function createPerson(
  ctx: ValidatedContext<CreatePersonBody>
): Promise<Response> {
  // Get authenticated user (guaranteed by auth middleware)
  const user = ctx.get('user') as User;
  
  // Get validated request body - now properly typed!
  const body = ctx.req.valid('json');
  
  // Get dependencies from context
  const db = ctx.get('database') as DatabaseInstance;
  const logger = ctx.get('logger');
  
  // Instantiate repository
  const repo = new PersonRepository(db, logger);
  
  // Check if user already has a person profile
  const existingPerson = await repo.findOneById(user.id);
  if (existingPerson) {
    throw new ConflictError('User already has a person profile');
  }
  
  // Create person record with user's ID
  const person = await repo.createOne({
    id: user.id, // Set person.id to user.id for 1:1 relationship
    firstName: body.firstName,
    lastName: body.lastName || null,
    middleName: body.middleName || null,
    dateOfBirth: body.dateOfBirth ? validatedDateOfBirth(new Date(body.dateOfBirth)).toISOString() : null,
    gender: body.gender || null,
    contactInfo: body.contactInfo || null,
    primaryAddress: body.primaryAddress || null,
    languagesSpoken: body.languagesSpoken || [],
    timezone: body.timezone || null,
    createdBy: user.id // Audit trail
  });

  // Log audit trail for compliance
  const audit = ctx.get('audit');
  if (audit) {
    try {
      await audit.logEvent({
        eventType: 'data-modification',
        category: 'privacy',
        action: 'create',
        outcome: 'success',
        user: user.id,
        userType: (user.role === 'user' ? 'client' : user.role || 'client') as 'client' | 'host' | 'admin' | 'system',
        resourceType: 'person',
        resource: person.id,
        description: 'Person profile created',
        details: {
          hasEmail: !!body.contactInfo?.email,
          hasPhone: !!body.contactInfo?.phone,
          isOwner: true
        },
        ipAddress: ctx.req.header('x-forwarded-for') || ctx.req.header('x-real-ip'),
        userAgent: ctx.req.header('user-agent')
      });
    } catch (error) {
      logger?.error({ error, personId: person.id }, 'Failed to log audit event for person creation');
    }
  }

  // Log basic info
  logger?.info({
    personId: person.id,
    userId: user.id,
    action: 'create',
    email: body.contactInfo?.email,
    ipAddress: ctx.req.header('x-forwarded-for') || ctx.req.header('x-real-ip'),
    isOwner: true
  }, 'Person created for authenticated user');

  return ctx.json(person, 201);
}