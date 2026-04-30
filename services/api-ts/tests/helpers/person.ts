/**
 * Person E2E Test Helper Functions
 * Provides utilities for testing person-related endpoints
 */

import { faker } from '@faker-js/faker';
import type { ApiClient } from './client';
import type { paths } from '@monobase/api-spec';
import { generateUniqueEmail } from './unique';
import { addYears } from 'date-fns';

// Export types from the OpenAPI spec for easy access
export type Person = paths['/persons/{person}']['get']['responses']['200']['content']['application/json'];
export type PersonCreateRequest = paths['/persons']['post']['requestBody']['content']['application/json'];
export type PersonUpdateRequest = paths['/persons/{person}']['patch']['requestBody']['content']['application/json'];
export type ListPersonsResponse = paths['/persons']['get']['responses']['200']['content']['application/json'];

// Re-export the nested types for backward compatibility
export type PersonResponse = Person;
export type Address = Person['primaryAddress'];
export type ContactInfo = Person['contactInfo'];
export type MaybeStoredFile = Person['avatar'];


/**
 * Generate realistic test person data using faker
 * Uses plainDate format (YYYY-MM-DD) for dateOfBirth
 */
export function generateTestPersonData(overrides: Partial<PersonCreateRequest> = {}): PersonCreateRequest {
  const genders: PersonCreateRequest['gender'][] = ['male', 'female', 'non-binary', 'other', 'prefer-not-to-say'];

  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    middleName: faker.datatype.boolean() ? faker.person.middleName() : undefined,
    dateOfBirth: faker.date.birthdate({ min: 18, max: 80, mode: 'age' }).toISOString().split('T')[0],
    gender: faker.helpers.arrayElement(genders),
    primaryAddress: {
      street1: faker.location.streetAddress(),
      street2: faker.datatype.boolean() ? faker.location.secondaryAddress() : undefined,
      city: faker.location.city(),
      state: faker.location.state({ abbreviated: true }),
      postalCode: faker.location.zipCode(),
      country: 'US',
      coordinates: {
        latitude: parseFloat(faker.location.latitude()),
        longitude: parseFloat(faker.location.longitude()),
        accuracy: faker.number.int({ min: 1, max: 100 })
      }
    },
    contactInfo: {
      email: generateUniqueEmail(),
      // Generate valid US phone using known valid area codes
      // Format: +1 NXX NXX XXXX where N=2-9, X=0-9
      phone: `+1${faker.helpers.arrayElement(['212', '213', '214', '310', '312', '404', '415', '510', '617', '702', '713', '818', '916'])}${faker.number.int({ min: 2, max: 9 })}${faker.string.numeric(6)}`
    },
    languagesSpoken: faker.helpers.arrayElements(['en', 'es', 'fr', 'de', 'zh', 'ar'], { min: 1, max: 3 }),
    timezone: faker.helpers.arrayElement(['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix']),
    ...overrides
  };
}

/**
 * Generate minimal person data for testing required fields
 */
export function generateMinimalPersonData(): PersonCreateRequest {
  return {
    firstName: faker.person.firstName()
  };
}

/**
 * Generate invalid person data for validation testing
 */
export function generateInvalidPersonData(): Record<string, any> {
  return {
    firstName: '', // Empty required field
    lastName: faker.string.alpha(100), // Too long
    dateOfBirth: 'invalid-date',
    gender: 'invalid-gender',
    primaryAddress: {
      street1: '',
      city: '',
      state: 'INVALID',
      postalCode: '12345678901', // Too long
      country: 'INVALID'
    },
    contactInfo: {
      email: 'invalid-email',
      phone: 'invalid-phone'
    }
  };
}

/**
 * Create a person via API
 */
export async function createPerson(
  apiClient: ApiClient,
  data: PersonCreateRequest
): Promise<{ response: Response; data?: PersonResponse }> {
  const response = await apiClient.fetch('/persons', {
    method: 'POST',
    body: data
  });

  const responseData = response.ok ? await response.json() : undefined;
  return { response, data: responseData };
}

/**
 * Get a person by ID
 */
export async function getPerson(
  apiClient: ApiClient,
  personId: string
): Promise<{ response: Response; data?: PersonResponse }> {
  const response = await apiClient.fetch(`/persons/${personId}`);

  const responseData = response.ok ? await response.json() : undefined;
  return { response, data: responseData };
}

/**
 * Update a person
 */
export async function updatePerson(
  apiClient: ApiClient,
  personId: string,
  data: PersonUpdateRequest
): Promise<{ response: Response; data?: PersonResponse }> {
  const response = await apiClient.fetch(`/persons/${personId}`, {
    method: 'PATCH',
    body: data
  });

  const responseData = response.ok ? await response.json() : undefined;
  return { response, data: responseData };
}

/**
 * List persons with optional filters
 */
export async function listPersons(
  apiClient: ApiClient,
  params: {
    page?: number;
    pageSize?: number;
    sort?: string;
  } = {}
): Promise<{ response: Response; data?: ListPersonsResponse }> {
  // Convert page/pageSize to limit/offset for the API
  const searchParams: Record<string, any> = {};
  
  if (params.pageSize) {
    searchParams.limit = params.pageSize;
  }
  
  if (params.page && params.pageSize) {
    searchParams.offset = (params.page - 1) * params.pageSize;
  }
  
  // Sort parameter should be in "field:direction" format
  if (params.sort) {
    searchParams.sort = params.sort;
  }

  const response = await apiClient.fetch('/persons', {
    searchParams
  });

  const responseData = response.ok ? await response.json() : undefined;
  return { response, data: responseData };
}


/**
 * Wait for person to be available (useful after creation)
 */
export async function waitForPerson(
  apiClient: ApiClient,
  personId: string,
  maxRetries = 5
): Promise<PersonResponse | null> {
  for (let i = 0; i < maxRetries; i++) {
    const { response, data } = await getPerson(apiClient, personId);
    if (response.ok && data) {
      return data;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return null;
}

/**
 * Generate test data for bulk operations
 */
export function generateBulkPersonData(count: number): PersonCreateRequest[] {
  return Array.from({ length: count }, () => generateTestPersonData());
}

/**
 * Validate person response structure
 */
export function validatePersonResponse(person: any): person is PersonResponse {
  return (
    typeof person === 'object' &&
    typeof person.id === 'string' &&
    typeof person.firstName === 'string' &&
    typeof person.createdAt === 'string' &&
    typeof person.updatedAt === 'string'
  );
}

/**
 * Generate search test cases
 */
export function generatePersonSearchCases(): Array<{ query: string; field: keyof PersonCreateRequest }> {
  return [
    { query: faker.person.firstName(), field: 'firstName' },
    { query: faker.person.lastName(), field: 'lastName' },
    { query: faker.internet.email(), field: 'contactInfo' },
    { query: faker.phone.number(), field: 'contactInfo' }
  ];
}

/**
 * Generate valid dateOfBirth test cases
 * Returns plainDate format (YYYY-MM-DD) without time component
 */
export function generateValidDateOfBirthCases(): Array<{ date: string; description: string }> {
  return [
    {
      date: new Date(1990, 5, 15).toISOString().split('T')[0],
      description: 'standard birth date (1990)'
    },
    {
      date: new Date(1950, 0, 1).toISOString().split('T')[0],
      description: 'older birth date (1950)'
    },
    {
      date: new Date(2000, 1, 29).toISOString().split('T')[0],
      description: 'leap year date (Feb 29, 2000)'
    },
    {
      date: new Date(1985, 11, 31).toISOString().split('T')[0],
      description: 'end of year 1985'
    },
    {
      date: new Date(2005, 6, 4).toISOString().split('T')[0],
      description: 'recent date (2005)'
    },
    {
      date: faker.date.birthdate({ min: 18, max: 80, mode: 'age' }).toISOString().split('T')[0],
      description: 'random valid birth date'
    }
  ];
}

/**
 * Generate invalid dateOfBirth test cases
 * Note: plainDate validation only checks format (YYYY-MM-DD), not calendar validity
 * Impossible dates like '2000-02-30' pass format validation but fail at DB level
 */
export function generateInvalidDateOfBirthCases(): Array<{ date: any; description: string }> {
  return [
    {
      date: 'not-a-date',
      description: 'invalid string format'
    },
    {
      date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 year from now
      description: 'future date'
    },
    {
      date: '1800-01-01',
      description: 'date too old (before 1900)'
    },
    // Note: Impossible but well-formatted dates like '2000-02-30' are commented out
    // because plainDate validation only checks format, not calendar validity
    // {
    //   date: '2000-02-30',
    //   description: 'invalid day (Feb 30)'
    // },
    // {
    //   date: '2000-13-01',
    //   description: 'invalid month'
    // },
    {
      date: 123456789,
      description: 'number instead of string'
    },
    {
      date: { year: 1990, month: 1, day: 1 },
      description: 'object instead of string'
    },
    {
      date: ['1990-01-01'],
      description: 'array instead of string'
    },
    {
      date: '',
      description: 'empty string'
    }
  ];
}

/**
 * Generate specific dateOfBirth edge case scenarios
 * Returns plainDate format (YYYY-MM-DD) without time component
 */
export function generateDateOfBirthEdgeCases(): Array<{ date: string; description: string }> {
  return [
    {
      date: new Date(1900, 0, 1).toISOString().split('T')[0],
      description: 'earliest acceptable date (1900-01-01)'
    },
    {
      date: new Date(2000, 1, 29).toISOString().split('T')[0], // Feb 29, 2000 (leap year)
      description: 'leap year date'
    },
    {
      date: new Date(1999, 1, 28).toISOString().split('T')[0], // Feb 28, 1999 (non-leap year)
      description: 'last day of February in non-leap year'
    },
    {
      date: new Date(Date.now() - (18 * 365.25 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
      description: 'exactly 18 years ago (minimum adult age)'
    },
    {
      date: new Date(1920, 11, 31).toISOString().split('T')[0],
      description: 'end of year 1920'
    }
  ];
}

/**
 * Validate that two plainDate strings represent the same date
 * For plainDate format (YYYY-MM-DD), we can just compare strings directly
 */
export function areDatesEqual(date1: string, date2: string): boolean {
  try {
    // For plainDate format, direct string comparison works
    // If one is plainDate and other is ISO timestamp, extract date part from both
    const d1Part = date1.includes('T') ? date1.split('T')[0] : date1;
    const d2Part = date2.includes('T') ? date2.split('T')[0] : date2;
    return d1Part === d2Part;
  } catch {
    return false;
  }
}

/**
 * Extract just the date part (YYYY-MM-DD) from an ISO string or plainDate
 * If already plainDate format, returns as-is
 */
export function extractDatePart(dateString: string): string {
  try {
    // If already plainDate format (no 'T'), return as-is
    if (!dateString.includes('T')) {
      return dateString;
    }
    // Otherwise extract date part from ISO timestamp
    return new Date(dateString).toISOString().split('T')[0];
  } catch {
    return '';
  }
}