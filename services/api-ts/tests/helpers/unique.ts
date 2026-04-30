/**
 * Unique test data generation utilities
 * Provides functions to generate unique test data to avoid conflicts in parallel tests
 */

import { faker } from '@faker-js/faker';

/**
 * Generate a unique email address for testing
 * Uses timestamp and random suffix to ensure uniqueness across parallel tests
 */
export function generateUniqueEmail(): string {
  const timestamp = Date.now();
  const randomSuffix = faker.string.alphanumeric(6);
  const domain = faker.helpers.arrayElement(['test.com', 'example.com', 'fake.email']);
  return `test-${timestamp}-${randomSuffix}@${domain}`;
}

/**
 * Generate a unique username for testing
 * Uses timestamp and random suffix to ensure uniqueness
 */
export function generateUniqueUsername(): string {
  const timestamp = Date.now();
  const randomSuffix = faker.string.alphanumeric(4);
  return `user_${timestamp}_${randomSuffix}`;
}

/**
 * Generate a unique identifier with a prefix
 * Useful for any test data that needs to be unique
 */
export function generateUniqueId(prefix = 'test'): string {
  const timestamp = Date.now();
  const randomSuffix = faker.string.alphanumeric(6);
  return `${prefix}_${timestamp}_${randomSuffix}`;
}

/**
 * Generate a unique phone number for testing
 * Uses timestamp to ensure uniqueness while maintaining phone format
 */
export function generateUniquePhone(): string {
  const timestamp = Date.now().toString().slice(-10); // Last 10 digits of timestamp
  return `+1${timestamp}`;
}