import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '../../src/utils/time.js';

describe('formatRelativeTime', () => {
  describe('seconds', () => {
    it('formats sub-second as "just now"', () => {
      const result = formatRelativeTime(Date.now() - 500);
      expect(result).toBe('just now');
    });

    it('formats 0 seconds as "just now"', () => {
      const result = formatRelativeTime(Date.now());
      expect(result).toBe('just now');
    });

    it('formats 5 seconds ago', () => {
      const result = formatRelativeTime(Date.now() - 5000);
      expect(result).toBe('5s ago');
    });

    it('formats 30 seconds ago', () => {
      const result = formatRelativeTime(Date.now() - 30000);
      expect(result).toBe('30s ago');
    });

    it('formats 59 seconds ago', () => {
      const result = formatRelativeTime(Date.now() - 59000);
      expect(result).toBe('59s ago');
    });
  });

  describe('minutes', () => {
    it('formats 1 minute ago', () => {
      const result = formatRelativeTime(Date.now() - 60000);
      expect(result).toBe('1m ago');
    });

    it('formats 2 minutes ago', () => {
      const result = formatRelativeTime(Date.now() - 120000);
      expect(result).toBe('2m ago');
    });

    it('formats 30 minutes ago', () => {
      const result = formatRelativeTime(Date.now() - 30 * 60 * 1000);
      expect(result).toBe('30m ago');
    });

    it('formats 59 minutes ago', () => {
      const result = formatRelativeTime(Date.now() - 59 * 60 * 1000);
      expect(result).toBe('59m ago');
    });
  });

  describe('hours', () => {
    it('formats 1 hour ago', () => {
      const result = formatRelativeTime(Date.now() - 60 * 60 * 1000);
      expect(result).toBe('1h ago');
    });

    it('formats 3 hours ago', () => {
      const result = formatRelativeTime(Date.now() - 3 * 60 * 60 * 1000);
      expect(result).toBe('3h ago');
    });

    it('formats 23 hours ago', () => {
      const result = formatRelativeTime(Date.now() - 23 * 60 * 60 * 1000);
      expect(result).toBe('23h ago');
    });
  });

  describe('days', () => {
    it('formats 1 day ago', () => {
      const result = formatRelativeTime(Date.now() - 24 * 60 * 60 * 1000);
      expect(result).toBe('1d ago');
    });

    it('formats 2 days ago', () => {
      const result = formatRelativeTime(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(result).toBe('2d ago');
    });

    it('formats 7 days ago', () => {
      const result = formatRelativeTime(Date.now() - 7 * 24 * 60 * 60 * 1000);
      expect(result).toBe('7d ago');
    });

    it('formats 30 days ago', () => {
      const result = formatRelativeTime(Date.now() - 30 * 24 * 60 * 60 * 1000);
      expect(result).toBe('30d ago');
    });
  });

  describe('edge cases', () => {
    it('handles exact minute boundaries', () => {
      // Exactly 60 seconds should be "1m ago"
      const result = formatRelativeTime(Date.now() - 60 * 1000);
      expect(result).toBe('1m ago');
    });

    it('handles exact hour boundaries', () => {
      // Exactly 60 minutes should be "1h ago"
      const result = formatRelativeTime(Date.now() - 60 * 60 * 1000);
      expect(result).toBe('1h ago');
    });

    it('handles exact day boundaries', () => {
      // Exactly 24 hours should be "1d ago"
      const result = formatRelativeTime(Date.now() - 24 * 60 * 60 * 1000);
      expect(result).toBe('1d ago');
    });

    it('handles future timestamps (negative diff)', () => {
      // Future timestamps should return negative values
      // (This shouldn't happen in normal usage, but we test defensive behavior)
      const result = formatRelativeTime(Date.now() + 5000);
      // Math.floor of negative seconds < 1 should give "just now"
      expect(result).toBe('just now');
    });
  });
});
