import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '../../src/utils/time.js';

describe('formatRelativeTime', () => {
  it.each([
    { offset: 0, expected: 'just now' },
    { offset: 500, expected: 'just now' },
    { offset: 30 * 1000, expected: '30s ago' },
    { offset: 60 * 1000, expected: '1m ago' },
    { offset: 2 * 60 * 1000, expected: '2m ago' },
    { offset: 3 * 60 * 60 * 1000, expected: '3h ago' },
    { offset: 5 * 24 * 60 * 60 * 1000, expected: '5d ago' },
  ])('formats $expected for offset $offset ms', ({ offset, expected }) => {
    expect(formatRelativeTime(Date.now() - offset)).toBe(expected);
  });

  it('handles future timestamps gracefully', () => {
    expect(formatRelativeTime(Date.now() + 5000)).toBe('just now');
  });
});
