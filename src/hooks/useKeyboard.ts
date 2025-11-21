import { useEffect, useRef } from 'react';
import { useInput, useStdin } from 'ink';
import { events } from '../services/events.js';

/**
 * Keyboard handlers for various actions.
 * All handlers are optional - only provide the ones you need.
 */
export interface KeyboardHandlers {
  enabled?: boolean;
  // File/Folder Actions
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
  onToggleGitOnlyMode?: () => void; // Shift+G key

  // Copy Actions
  onOpenCopyTreeBuilder?: () => void;  // Shift+C key
  
  // UI Actions
  onRefresh?: () => void;          // r key
  onOpenHelp?: () => void;         // ? key
  onOpenContextMenu?: () => void;  // m key
  onQuit?: () => void;             // q key
  onForceExit?: () => void;        // Ctrl+C (second press)
  onWarnExit?: () => void;         // Ctrl+C (first press)
}

const HOME_SEQUENCES = new Set(['\u001B[H', '\u001BOH', '\u001B[1~', '\u001B[7~', '\u001B[7$', '\u001B[7^']);
const END_SEQUENCES = new Set(['\u001B[F', '\u001BOF', '\u001B[4~', '\u001B[8~', '\u001B[8$', '\u001B[8^']);

export function useKeyboard(handlers: KeyboardHandlers): void {
  const { stdin } = useStdin();
  const enabled = handlers.enabled ?? true;
  // Use ref instead of state to prevent stale closures in useInput callback
  const exitConfirmRef = useRef(false);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!stdin) {
      return undefined;
    }
    if (!enabled) {
      return undefined;
    }

    const handleData = (data: Buffer | string) => {
      const chunk = typeof data === 'string' ? data : data.toString();

      if (HOME_SEQUENCES.has(chunk)) {
        events.emit('nav:move', { direction: 'home' });
        return;
      }

      if (END_SEQUENCES.has(chunk)) {
        events.emit('nav:move', { direction: 'end' });
        return;
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
  }, [stdin, enabled]); // Removed handlers.onHome, handlers.onEnd from dependencies

  useInput((input, key) => {
    if (!enabled) {
      return;
    }
    // Handle Ctrl+C (Exit)
    if ((key.ctrl && input === 'c') || input === '\u0003') {
      if (exitConfirmRef.current) {
        if (handlers.onForceExit) {
          handlers.onForceExit();
        }
      } else {
        exitConfirmRef.current = true;
        if (handlers.onWarnExit) {
          handlers.onWarnExit();
        }

        if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
        exitTimeoutRef.current = setTimeout(() => {
          exitConfirmRef.current = false;
          exitTimeoutRef.current = null;
        }, 2000);
      }
      return; 
    }

    if (exitConfirmRef.current) {
      exitConfirmRef.current = false;
      if (exitTimeoutRef.current) {
        clearTimeout(exitTimeoutRef.current);
        exitTimeoutRef.current = null;
      }
    }

    // Navigation - Arrow keys
    if (key.upArrow) {
      events.emit('nav:move', { direction: 'up' });
      return;
    }

    if (key.downArrow) {
      events.emit('nav:move', { direction: 'down' });
      return;
    }

    if (key.leftArrow) {
      events.emit('nav:move', { direction: 'left' });
      return;
    }

    if (key.rightArrow) {
      events.emit('nav:move', { direction: 'right' });
      return;
    }

    // Navigation - Page Up/Down
    if (key.pageUp) {
      events.emit('nav:move', { direction: 'pageUp' });
      return;
    }

    if (key.pageDown) {
      events.emit('nav:move', { direction: 'pageDown' });
      return;
    }

    // Navigation - Ctrl+U/D (alternate page up/down)
    if (key.ctrl && input === 'u') {
      events.emit('nav:move', { direction: 'pageUp' });
      return;
    }

    if (key.ctrl && input === 'd') {
      events.emit('nav:move', { direction: 'pageDown' });
      return;
    }

    // File/Folder Actions
    if (key.return) {
      events.emit('nav:primary');
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

    if (input === 'W') {
      events.emit('ui:modal:open', { id: 'worktree' });
      return;
    }

    // Command/Filter Actions
    if (input === '/') {
      events.emit('ui:modal:open', { id: 'command-bar' });
      return;
    }

    if (key.ctrl && input === 'f') {
      events.emit('ui:modal:open', { id: 'command-bar', context: { initialInput: '/filter ' } });
      return;
    }

    if (key.escape && handlers.onClearFilter) {
      handlers.onClearFilter();
      return;
    }

    // Git Actions
    if (input === 'g' && !key.shift && handlers.onToggleGitStatus) {
      handlers.onToggleGitStatus();
      return;
    }

    if (input === 'G' && handlers.onToggleGitOnlyMode) {
      handlers.onToggleGitOnlyMode();
      return;
    }

    // Copy Actions
    if (input === 'C' && handlers.onOpenCopyTreeBuilder) {
      handlers.onOpenCopyTreeBuilder();
      return;
    }

    // Use Event Bus for CopyTree Shortcut (Cmd+C)
    if (key.meta && input === 'c') {
      events.emit('file:copy-tree', {}); // Use empty payload, handled by listener
      return;
    }

    // UI Actions
    if (input === 'r' && handlers.onRefresh) {
      handlers.onRefresh();
      return;
    }

    if (input === '?') {
      events.emit('ui:modal:open', { id: 'help' });
      return;
    }

    if (input === 'm') {
      if (handlers.onOpenContextMenu) {
        handlers.onOpenContextMenu();
        return;
      }
      events.emit('ui:modal:open', { id: 'context-menu' });
      return;
    }

    if (input === 'q' && handlers.onQuit) {
      handlers.onQuit();
      return;
    }
  });
}
