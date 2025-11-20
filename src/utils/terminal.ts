/**
 * Terminal control utilities
 */

const TERMINAL_RESET_SEQUENCE = '\x1Bc';

/**
 * Clears the terminal screen using ANSI escape sequence.
 * Uses ESC c (full terminal reset) which works across all terminal emulators.
 * Guard against non-TTY or closed stdout targets so pipes/redirects do not crash.
 */
export function clearTerminalScreen(): void {
  const { stdout } = process;
  if (!stdout || !stdout.isTTY || !stdout.writable) {
    return;
  }

  try {
    stdout.write(TERMINAL_RESET_SEQUENCE);
  } catch {
    // Ignore write failures (stream may already be closed).
  }
}
