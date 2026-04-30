/**
 * Database schema for persons - matches TypeSpec API definition
 * Uses Drizzle ORM with PostgreSQL
 */

import { pgTable, varchar, timestamp, date, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { baseEntityFields } from '@/core/database.schema';

// Gender enum - matches TypeSpec definition
export const genderEnum = pgEnum('gender', [
  'male',
  'female',
  'non-binary',
  'other',
  'prefer-not-to-say'
]);

// Persons table - matches TypeSpec Person model
export const persons = pgTable('person', {
  // Base entity fields (includes id, timestamps, version, audit fields)
  ...baseEntityFields,

  // Person-specific fields from TypeSpec
  firstName: varchar('first_name', { length: 50 }).notNull(),
  lastName: varchar('last_name', { length: 50 }),
  middleName: varchar('middle_name', { length: 50 }),
  dateOfBirth: date('date_of_birth'), // Date-only field (no time/timezone) to avoid timezone issues
  gender: genderEnum('gender'),
  
  // Complex fields (stored as JSONB)
  primaryAddress: jsonb('primary_address').$type<Address>(),
  contactInfo: jsonb('contact_info').$type<ContactInfo>(), // Contains email, phone
  avatar: jsonb('avatar').$type<MaybeStoredFile>(), // Avatar image
  languagesSpoken: jsonb('languages_spoken').$type<string[]>(), // Array of language codes
  timezone: varchar('timezone', { length: 50 }), // IANA timezone identifier
}, (table) => ({
  // Indexes for search operations
  nameIdx: index('persons_name_idx').on(table.firstName, table.lastName),

}));

// Type exports for TypeScript
export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;

// Address type - matches TypeSpec Address model
export interface Address {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string; // Country code
  coordinates?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
}

// Contact info type - matches TypeSpec ContactInfo model
export interface ContactInfo {
  email?: string;
  phone?: string;
}

// MaybeStoredFile type - matches TypeSpec MaybeStoredFile model
export interface MaybeStoredFile {
  file?: string; // UUID reference to stored file
  url: string;   // Direct URL to file
}

// MaybeStoredFileUpdate type - matches TypeSpec MaybeStoredFileUpdate model
export interface MaybeStoredFileUpdate {
  file?: string | null; // UUID reference to stored file - can be null to clear
  url?: string;         // Direct URL to file
}

// AddressUpdate type - matches TypeSpec AddressUpdate model
export interface AddressUpdate {
  street1?: string;
  street2?: string | null; // Can be null to clear
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  coordinates?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  } | null; // Can be null to clear
}


// Request types - matches TypeSpec PersonCreateRequest
export interface PersonCreateRequest {
  firstName: string;
  lastName?: string;
  middleName?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'non-binary' | 'other' | 'prefer-not-to-say';
  primaryAddress?: Address;
  contactInfo?: ContactInfo;
  avatar?: MaybeStoredFile;
  languagesSpoken?: string[];
  timezone?: string;
}

// Update request - matches TypeSpec PersonUpdateRequest
export interface PersonUpdateRequest {
  firstName?: string;
  lastName?: string | null;  // Can be null to clear
  middleName?: string | null; // Can be null to clear
  dateOfBirth?: string | null; // Can be null to clear
  gender?: 'male' | 'female' | 'non-binary' | 'other' | 'prefer-not-to-say' | null; // Can be null to clear
  primaryAddress?: AddressUpdate | null; // Use AddressUpdate for partial updates, null to clear
  contactInfo?: ContactInfo | null; // Can be null to clear
  avatar?: MaybeStoredFileUpdate | null; // Use MaybeStoredFileUpdate for updates, null to clear
  languagesSpoken?: string[] | null; // Can be null to clear
  timezone?: string | null; // Can be null to clear
}

