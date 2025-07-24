import { jest } from '@jest/globals';
import { parseRelativeTime, isValidRelativeTime } from '../../src/utilities/time-parser.js';

describe('TimeParser', () => {
  const referenceDate = new Date('2024-01-15T12:00:00.000Z');

  describe('parseRelativeTime', () => {
    it('should parse "just now" correctly', () => {
      const result = parseRelativeTime('just now', referenceDate);
      expect(result).toEqual(referenceDate);
    });

    it('should parse "now" correctly', () => {
      const result = parseRelativeTime('now', referenceDate);
      expect(result).toEqual(referenceDate);
    });

    it('should parse "1 hour ago" correctly', () => {
      const result = parseRelativeTime('1 hour ago', referenceDate);
      const expected = new Date('2024-01-15T11:00:00.000Z');
      expect(result).toEqual(expected);
    });

    it('should parse "2 days ago" correctly', () => {
      const result = parseRelativeTime('2 days ago', referenceDate);
      const expected = new Date('2024-01-13T12:00:00.000Z');
      expect(result).toEqual(expected);
    });

    it('should parse "1 week ago" correctly', () => {
      const result = parseRelativeTime('1 week ago', referenceDate);
      const expected = new Date('2024-01-08T12:00:00.000Z');
      expect(result).toEqual(expected);
    });

    it('should parse "3 minutes ago" correctly', () => {
      const result = parseRelativeTime('3 minutes ago', referenceDate);
      const expected = new Date('2024-01-15T11:57:00.000Z');
      expect(result).toEqual(expected);
    });

    it('should parse "30 seconds ago" correctly', () => {
      const result = parseRelativeTime('30 seconds ago', referenceDate);
      const expected = new Date('2024-01-15T11:59:30.000Z');
      expect(result).toEqual(expected);
    });

    it('should parse "1 month ago" correctly', () => {
      const result = parseRelativeTime('1 month ago', referenceDate);
      const expected = new Date('2023-12-15T12:00:00.000Z');
      expect(result).toEqual(expected);
    });

    it('should parse "1 year ago" correctly', () => {
      const result = parseRelativeTime('1 year ago', referenceDate);
      const expected = new Date('2023-01-15T12:00:00.000Z');
      expect(result).toEqual(expected);
    });

    it('should handle plural forms correctly', () => {
      const result = parseRelativeTime('2 hours ago', referenceDate);
      const expected = new Date('2024-01-15T10:00:00.000Z');
      expect(result).toEqual(expected);
    });

    it('should handle case insensitive input', () => {
      const result = parseRelativeTime('1 HOUR AGO', referenceDate);
      const expected = new Date('2024-01-15T11:00:00.000Z');
      expect(result).toEqual(expected);
    });

    it('should return null for invalid input', () => {
      expect(parseRelativeTime('')).toBeNull();
      expect(parseRelativeTime(null)).toBeNull();
      expect(parseRelativeTime(undefined)).toBeNull();
      expect(parseRelativeTime('invalid string')).toBeNull();
      expect(parseRelativeTime('abc hours ago')).toBeNull();
    });

    it('should return null for negative numbers', () => {
      const result = parseRelativeTime('-1 hour ago', referenceDate);
      expect(result).toBeNull();
    });

    it('should use current time as default reference date', () => {
      const before = new Date();
      const result = parseRelativeTime('just now');
      const after = new Date();

      expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should handle short form notation', () => {
      const result1 = parseRelativeTime('1h', referenceDate);
      const expected1 = new Date('2024-01-15T11:00:00.000Z');
      expect(result1).toEqual(expected1);

      const result2 = parseRelativeTime('2d', referenceDate);
      const expected2 = new Date('2024-01-13T12:00:00.000Z');
      expect(result2).toEqual(expected2);
    });
  });

  describe('isValidRelativeTime', () => {
    it('should return true for valid time strings', () => {
      expect(isValidRelativeTime('1 hour ago')).toBe(true);
      expect(isValidRelativeTime('just now')).toBe(true);
      expect(isValidRelativeTime('2 days ago')).toBe(true);
      expect(isValidRelativeTime('1h')).toBe(true);
    });

    it('should return false for invalid time strings', () => {
      expect(isValidRelativeTime('')).toBe(false);
      expect(isValidRelativeTime('invalid')).toBe(false);
      expect(isValidRelativeTime('abc hours ago')).toBe(false);
      expect(isValidRelativeTime(null)).toBe(false);
      expect(isValidRelativeTime(undefined)).toBe(false);
    });
  });
});
