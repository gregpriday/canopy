export interface TerminalMouseEvent {
  x: number;
  y: number;
  button: 'left' | 'right' | 'middle' | 'wheel-up' | 'wheel-down';
  action: 'down' | 'up' | 'drag';
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
}

/**
 * Parses SGR mouse sequences from a data string.
 * Handles batched sequences (multiple events in one chunk).
 * 
 * Format: \x1b[<b;x;yM (or m)
 * b = button/modifiers
 * x, y = 1-based coordinates
 * M = press, m = release
 */
export function parseMouseSequences(data: string): TerminalMouseEvent[] {
  const events: TerminalMouseEvent[] = [];
  // Regex for SGR format with global flag to match all occurrences
  const regex = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
  
  let match;
  while ((match = regex.exec(data)) !== null) {
    const rawButton = parseInt(match[1], 10);
    const x = parseInt(match[2], 10) - 1; // Convert to 0-based
    const y = parseInt(match[3], 10) - 1; // Convert to 0-based
    const type = match[4]; // M = down, m = up

    // Decode modifiers (Shift=4, Alt=8, Ctrl=16)
    const isShift = !!(rawButton & 4);
    const isAlt = !!(rawButton & 8);
    const isCtrl = !!(rawButton & 16);
    
    // Decode drag (32)
    const isDrag = !!(rawButton & 32);
    
    // Strip modifiers and drag bit to check base code
    // Mask out 4, 8, 16, 32 (sum = 60)
    const baseCode = rawButton & ~60;

    let button: TerminalMouseEvent['button'] = 'left';
    
    if (baseCode === 0) button = 'left';
    else if (baseCode === 1) button = 'middle';
    else if (baseCode === 2) button = 'right';
    else if (baseCode === 64) button = 'wheel-up';
    else if (baseCode === 65) button = 'wheel-down';
    else if (baseCode === 3) button = 'left'; // Often released as 3? No, 3 is just 'released' in X10 but SGR uses 'm'
    
    // Determine action
    let action: TerminalMouseEvent['action'];
    if (type === 'm') {
      action = 'up';
    } else if (isDrag) {
      action = 'drag';
    } else {
      action = 'down';
    }

    events.push({ 
      x, 
      y, 
      button, 
      action, 
      shift: isShift, 
      alt: isAlt, 
      ctrl: isCtrl 
    });
  }

  return events;
}

/**
 * Legacy single parser for backward compatibility or simple use cases.
 * Returns the first event found.
 */
export function parseMouseSequence(data: string): TerminalMouseEvent | null {
  const events = parseMouseSequences(data);
  return events.length > 0 ? events[0] : null;
}