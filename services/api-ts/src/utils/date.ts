/**
 * Date Utilities
 * Domain-specific date validation functions
 * For date manipulation, use date-fns directly in your code
 */

import { isAfter, isBefore, isValid } from 'date-fns';
import { ValidationError } from '@/core/errors';

/**
 * Validates a date of birth for person records
 * Throws ValidationError if the date is invalid, in the future, or before 1900
 *
 * @param date - The date to validate
 * @throws ValidationError for invalid dates, future dates, or dates before 1900
 */
export function validateDateOfBirth(date: Date): void {
  // Check if date is valid
  if (!isValid(date)) {
    throw new ValidationError('Invalid date format');
  }

  // Check for future dates
  const now = new Date();
  if (isAfter(date, now)) {
    throw new ValidationError('Date of birth cannot be in the future');
  }

  // Check for dates before 1900
  const minDate = new Date('1900-01-01');
  if (isBefore(date, minDate)) {
    throw new ValidationError('Date of birth cannot be before 1900');
  }
}

/**
 * Validates a date of birth and returns it if valid
 * Convenience function for use in object creation/updates
 *
 * @param date - The date to validate
 * @returns The validated date
 * @throws ValidationError for invalid dates
 */
export function validatedDateOfBirth(date: Date): Date {
  validateDateOfBirth(date);
  return date;
}
