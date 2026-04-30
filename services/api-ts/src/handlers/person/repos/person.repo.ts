/**
 * PersonRepository - Data access layer for persons
 * Encapsulates all database operations for the persons table
 */

import { and, or, ilike, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '@/core/database';
import { DatabaseRepository } from '@/core/database.repo';
import { 
  persons, 
  type Person, 
  type NewPerson,
  type PersonCreateRequest
} from './person.schema';
import type { User } from '@/types/auth';

export interface PersonFilters {
  firstName?: string;
  lastName?: string;
  q?: string; // General search query
}

export class PersonRepository extends DatabaseRepository<Person, NewPerson, PersonFilters> {
  constructor(
    db: DatabaseInstance,
    logger?: any
  ) {
    super(db, persons, logger);
  }

  /**
   * Build where conditions for person-specific filtering
   */
  protected buildWhereConditions(filters?: PersonFilters): SQL<unknown> | undefined {
    if (!filters) return undefined;
    
    const conditions = [];
    
    if (filters.firstName) {
      conditions.push(ilike(persons.firstName, `%${filters.firstName}%`));
    }
    
    if (filters.lastName) {
      conditions.push(ilike(persons.lastName, `%${filters.lastName}%`));
    }
    
    // General search across multiple fields
    if (filters.q) {
      conditions.push(
        or(
          ilike(persons.firstName, `%${filters.q}%`),
          ilike(persons.lastName, `%${filters.q}%`)
        )
      );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * Ensure a person exists for the given user, creating one if needed
   */
  async ensurePersonForUser(
    user: User, 
    personInput?: PersonCreateRequest
  ): Promise<Person> {
    const userId = user.id;
    this.logger?.debug({ userId, hasPersonInput: !!personInput }, 'Ensuring person for user');

    // Always check if person exists first
    const existingPerson = await this.findOneById(userId);
    
    if (existingPerson) {
      this.logger?.debug({ userId }, 'Found existing person for user');
      
      // If person data provided and person exists, update it
      if (personInput) {
        const updateData = {
          ...personInput,
          updatedBy: userId
        };
        
        this.logger?.debug({ userId, updateData }, 'Updating existing person with provided data');
        
        const updatedPerson = await this.updateOneById(userId, updateData);
        
        this.logger?.info({ userId, personId: updatedPerson.id }, 'Person updated with provided data');
        
        return updatedPerson;
      }
      
      return existingPerson;
    }

    // If person doesn't exist, create it
    const personData = personInput ? {
      ...personInput,
      id: userId, // Force user ID for security
      createdBy: userId,
      updatedBy: userId
    } : {
      id: userId,
      firstName: user.name || 'Anonymous',
      createdBy: userId,
      updatedBy: userId
    };

    this.logger?.debug({ userId, personData }, 'Creating person with data');
    
    const person = await this.createOne(personData);
    
    this.logger?.info({ userId, personId: person.id }, personInput ? 'Person created with provided data' : 'Anonymous person created for user');
    
    return person;
  }




}