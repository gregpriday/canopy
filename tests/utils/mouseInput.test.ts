import { describe, it, expect } from 'vitest';
import { parseMouseSequences } from '../../src/utils/mouseInput.js';

describe('parseMouseSequences', () => {
  it('should parse single left click press', () => {
    const result = parseMouseSequences('\x1b[<0;32;15M');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      x: 31,
      y: 14,
      button: 'left',
      action: 'down',
      shift: false,
      alt: false,
      ctrl: false,
    });
  });

  it('should parse multiple batched sequences', () => {
    // Press left (at 10,10) then release left (at 10,10)
    const data = '\x1b[<0;10;10M\x1b[<0;10;10m';
    const result = parseMouseSequences(data);
    
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ button: 'left', action: 'down' });
    expect(result[1]).toMatchObject({ button: 'left', action: 'up' });
  });

  it('should parse drag events', () => {
    // Left button (0) + Drag (32) = 32
    // At 10,10
    const result = parseMouseSequences('\x1b[<32;10;10M');
    expect(result[0]).toEqual({
      x: 9,
      y: 9,
      button: 'left',
      action: 'drag',
      shift: false,
      alt: false,
      ctrl: false,
    });
  });

  it('should parse drag with modifiers', () => {
    // Left (0) + Drag (32) + Shift (4) = 36
    const result = parseMouseSequences('\x1b[<36;10;10M');
    expect(result[0]).toMatchObject({
      button: 'left',
      action: 'drag',
      shift: true,
    });
  });

  it('should parse scroll wheel', () => {
    const result = parseMouseSequences('\x1b[<64;1;1M');
    expect(result[0]).toMatchObject({ button: 'wheel-up', action: 'down' });
  });
});