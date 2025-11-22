/**
 * Terminal escape sequences for special keys
 * These sequences are not exposed in Ink's Key type but are available via the raw input string
 */

export const HOME_SEQUENCES = new Set([
  '\u001B[H',   // Standard
  '\u001BOH',   // Alternative
  '\u001B[1~',  // VT100
  '\u001B[7~',  // xterm
  '\u001B[7$',  // shift-modified
  '\u001B[7^',  // ctrl-modified
]);

export const END_SEQUENCES = new Set([
  '\u001B[F',   // Standard
  '\u001BOF',   // Alternative
  '\u001B[4~',  // VT100
  '\u001B[8~',  // xterm
  '\u001B[8$',  // shift-modified
  '\u001B[8^',  // ctrl-modified
]);
