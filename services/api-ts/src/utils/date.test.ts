import { describe, test, expect } from 'bun:test';
import { validateDateOfBirth, validatedDateOfBirth } from './date';
import { ValidationError } from '@/core/errors';

describe('Date Validation Utilities', () => {
  describe('validateDateOfBirth', () => {
    test('should pass for valid past dates', () => {
      const validDate = new Date('1990-01-01');
      expect(() => validateDateOfBirth(validDate)).not.toThrow();
    });

    test('should throw for future dates', () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
      expect(() => validateDateOfBirth(futureDate)).toThrow(ValidationError);
      expect(() => validateDateOfBirth(futureDate)).toThrow('Date of birth cannot be in the future');
    });

    test('should throw for dates before 1900', () => {
      const ancientDate = new Date('1899-12-31');
      expect(() => validateDateOfBirth(ancientDate)).toThrow(ValidationError);
      expect(() => validateDateOfBirth(ancientDate)).toThrow('Date of birth cannot be before 1900');
    });

    test('should throw for invalid dates', () => {
      const invalidDate = new Date('invalid');
      expect(() => validateDateOfBirth(invalidDate)).toThrow(ValidationError);
      expect(() => validateDateOfBirth(invalidDate)).toThrow('Invalid date format');
    });
  });

  describe('validatedDateOfBirth', () => {
    test('should return the date if valid', () => {
      const validDate = new Date('1990-01-01');
      const result = validatedDateOfBirth(validDate);
      expect(result).toEqual(validDate);
    });

    test('should throw for invalid dates', () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      expect(() => validatedDateOfBirth(futureDate)).toThrow(ValidationError);
    });
  });
});