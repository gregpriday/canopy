import { useEffect, useRef } from 'react';
import { useInput, useStdin } from 'ink';

/**
 * Keyboard handlers for various actions.
 * All handlers are optional - only provide the ones you need.
 */
export interface KeyboardHandlers {
  // Navigation
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onNavigateLeft?: () => void;
  onNavigateRight?: () => void;
  onPageUp?: () => void;
  onPageDown?: () => void;
  onHome?: () => void;
  onEnd?: () => void;

  // File/Folder Actions
  onOpenFile?: () => void;        // Enter key
  onToggleExpand?: () => void;    // Space key

  // Worktree Actions
  onNextWorktree?: () => void;      // w key
  onOpenWorktreePanel?: () => void; // Shift+W key

  // Command/Filter Actions
  onOpenCommandBar?: () => void;  // / key
  onOpenFilter?: () => void;      // Ctrl+F
  onClearFilter?: () => void;     // Escape when filter active

  // Git Actions
  onToggleGitStatus?: () => void; // g key

  // Copy Actions
  onCopyPath?: () => void;             // c key (no modifiers) - REMOVED from keyboard binding but kept for mouse
  onOpenCopyTreeBuilder?: () => void;  // Shift+C key
  onCopyTreeShortcut?: () => void;     // Command+C (meta+c)

  // UI Actions
  onRefresh?: () => void;          // r key
  onOpenHelp?: () => void;         // ? key
  onOpenContextMenu?: () => void;  // m key
  onQuit?: () => void;             // q key
  onForceExit?: () => void;        // Ctrl+C (second press)
  onWarnExit?: () => void;         // Ctrl+C (first press)
}

/**
 * Custom hook for handling keyboard input in Canopy.
 *
 * Uses Ink's useInput hook internally to listen for keyboard events
 * and dispatches to appropriate handlers based on the key pressed.
 *
 * All handlers are optional. Only provide handlers for keys you want to handle.
 *
 * @param handlers - Object containing optional handler functions for each key
 *
 * @example
 * ```typescript
 * useKeyboard({
 *   onNavigateUp: () => setCursor(cursor - 1),
 *   onNavigateDown: () => setCursor(cursor + 1),
 *   onOpenFile: () => openSelectedFile(),
 *   onQuit: () => process.exit(0),
 * });
 * ```
 */
const HOME_SEQUENCES = new Set(['\u001B[H', '\u001BOH', '\u001B[1~', '\u001B[7~', '\u001B[7$', '\u001B[7^']);
const END_SEQUENCES = new Set(['\u001B[F', '\u001BOF', '\u001B[4~', '\u001B[8~', '\u001B[8$', '\u001B[8^']);

export function useKeyboard(handlers: KeyboardHandlers): void {
  const { stdin } = useStdin();
  // Use ref instead of state to prevent stale closures in useInput callback
  const exitConfirmRef = useRef(false);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!stdin || (!handlers.onHome && !handlers.onEnd)) {
      return undefined;
    }

    const handleData = (data: Buffer | string) => {
      const chunk = typeof data === 'string' ? data : data.toString();

      if (handlers.onHome && HOME_SEQUENCES.has(chunk)) {
        handlers.onHome();
        return;
      }

      if (handlers.onEnd && END_SEQUENCES.has(chunk)) {
        handlers.onEnd();
      }
    };

    stdin.on('data', handleData);
    return () => {
      if (typeof stdin.off === 'function') {
        stdin.off('data', handleData);
      } else {
        stdin.removeListener?.('data', handleData);
      }
    };
  }, [stdin, handlers.onHome, handlers.onEnd]);

  useInput((input, key) => {
    // Handle Ctrl+C (Exit)
    // Check for both standard Ink parsing (key.ctrl + c) and raw ETX character (\u0003)
    if ((key.ctrl && input === 'c') || input === '\u0003') {
      if (exitConfirmRef.current) {
        // Second press: quit
        if (handlers.onForceExit) {
          handlers.onForceExit();
        }
      } else {
        // First press: warn
        exitConfirmRef.current = true;
        if (handlers.onWarnExit) {
          handlers.onWarnExit();
        }

        // Reset confirmation state after 2 seconds
        if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
        exitTimeoutRef.current = setTimeout(() => {
          exitConfirmRef.current = false;
          exitTimeoutRef.current = null;
        }, 2000);
      }
      return; // Stop propagation
    }

    // Reset exit confirm if user does anything else
    if (exitConfirmRef.current) {
      exitConfirmRef.current = false;
      if (exitTimeoutRef.current) {
        clearTimeout(exitTimeoutRef.current);
        exitTimeoutRef.current = null;
      }
    }

    // Navigation - Arrow keys
    if (key.upArrow && handlers.onNavigateUp) {
      handlers.onNavigateUp();
      return;
    }

    if (key.downArrow && handlers.onNavigateDown) {
      handlers.onNavigateDown();
      return;
    }

    if (key.leftArrow && handlers.onNavigateLeft) {
      handlers.onNavigateLeft();
      return;
    }

    if (key.rightArrow && handlers.onNavigateRight) {
      handlers.onNavigateRight();
      return;
    }

    // Navigation - Page Up/Down
    if (key.pageUp && handlers.onPageUp) {
      handlers.onPageUp();
      return;
    }

    if (key.pageDown && handlers.onPageDown) {
      handlers.onPageDown();
      return;
    }

    // Navigation - Ctrl+U/D (alternate page up/down)
    if (key.ctrl && input === 'u' && handlers.onPageUp) {
      handlers.onPageUp();
      return;
    }

    if (key.ctrl && input === 'd' && handlers.onPageDown) {
      handlers.onPageDown();
      return;
    }

    // File/Folder Actions
    if (key.return && handlers.onOpenFile) {
      handlers.onOpenFile();
      return;
    }

    if (input === ' ' && handlers.onToggleExpand) {
      handlers.onToggleExpand();
      return;
    }

    // Worktree Actions
    if (input === 'w' && !key.shift && handlers.onNextWorktree) {
      handlers.onNextWorktree();
      return;
    }

    if (input === 'W' && handlers.onOpenWorktreePanel) {
      handlers.onOpenWorktreePanel();
      return;
    }

    // Command/Filter Actions
    if (input === '/' && handlers.onOpenCommandBar) {
      handlers.onOpenCommandBar();
      return;
    }

    if (key.ctrl && input === 'f' && handlers.onOpenFilter) {
      handlers.onOpenFilter();
      return;
    }

    if (key.escape && handlers.onClearFilter) {
      handlers.onClearFilter();
      return;
    }

    // Git Actions
    if (input === 'g' && handlers.onToggleGitStatus) {
      handlers.onToggleGitStatus();
      return;
    }

    // Copy Actions
    // 'c' binding removed as requested - onCopyPath still used for mouse interactions

    if (input === 'C' && handlers.onOpenCopyTreeBuilder) {
      handlers.onOpenCopyTreeBuilder();
      return;
    }

    if (key.meta && input === 'c' && handlers.onCopyTreeShortcut) {
      handlers.onCopyTreeShortcut();
      return;
    }

    // UI Actions
    if (input === 'r' && handlers.onRefresh) {
      handlers.onRefresh();
      return;
    }

    if (input === '?' && handlers.onOpenHelp) {
      handlers.onOpenHelp();
      return;
    }

    if (input === 'm' && handlers.onOpenContextMenu) {
      handlers.onOpenContextMenu();
      return;
    }

    if (input === 'q' && handlers.onQuit) {
      handlers.onQuit();
      return;
    }

    // No handler for this key - ignore it
  });
}
