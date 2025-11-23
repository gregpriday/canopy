import { useEffect, useRef, useMemo } from 'react';
import { useInput, useStdin } from 'ink';
import { events } from '../services/events.js';
import { HOME_SEQUENCES, END_SEQUENCES } from '../utils/keySequences.js';
import { isAction } from '../utils/keyMatcher.js';
import { getResolvedKeyMap } from '../utils/keyPresets.js';
import type { CanopyConfig } from '../types/index.js';
import type { KeyAction } from '../types/keymap.js';

/**
 * Keyboard handlers for various actions.
 * All handlers are optional - only provide the ones you need.
 */
export interface KeyboardHandlers {
  enabled?: boolean;
  navigationEnabled?: boolean;
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

// Home/End sequences moved to shared utils/keySequences.ts

export function useKeyboard(handlers: KeyboardHandlers, config: CanopyConfig): void {
  const { stdin } = useStdin();
  const enabled = handlers.enabled ?? true;
  const navigationEnabled = handlers.navigationEnabled ?? true;
  // Use ref instead of state to prevent stale closures in useInput callback
  const exitConfirmRef = useRef(false);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve keymap from config once
  const keyMap = useMemo(
    () => getResolvedKeyMap(config.keys),
    [config.keys],
  );

  useEffect(() => {
    if (!stdin) {
      return undefined;
    }
    if (!enabled) {
      return undefined;
    }

    const handleData = (data: Buffer | string) => {
      const chunk = typeof data === 'string' ? data : data.toString();

      if (!navigationEnabled) {
        return;
      }

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
  }, [stdin, enabled, navigationEnabled]); // Removed handlers.onHome, handlers.onEnd from dependencies

  useInput((input, key) => {
    if (!enabled) {
      return;
    }

    // Handle force exit (Ctrl+C) - always uses hardcoded binding for safety
    if (isAction(input, key, 'app.forceQuit', keyMap)) {
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

    // Navigation - Using semantic actions
    if (navigationEnabled && isAction(input, key, 'nav.up', keyMap)) {
      events.emit('nav:move', { direction: 'up' });
      return;
    }

    if (navigationEnabled && isAction(input, key, 'nav.down', keyMap)) {
      events.emit('nav:move', { direction: 'down' });
      return;
    }

    if (navigationEnabled && isAction(input, key, 'nav.left', keyMap)) {
      events.emit('nav:move', { direction: 'left' });
      return;
    }

    if (navigationEnabled && isAction(input, key, 'nav.right', keyMap)) {
      events.emit('nav:move', { direction: 'right' });
      return;
    }

    if (navigationEnabled && isAction(input, key, 'nav.pageUp', keyMap)) {
      events.emit('nav:move', { direction: 'pageUp' });
      return;
    }

    if (navigationEnabled && isAction(input, key, 'nav.pageDown', keyMap)) {
      events.emit('nav:move', { direction: 'pageDown' });
      return;
    }

    // Primary action (Enter/Return)
    if (navigationEnabled && isAction(input, key, 'nav.primary', keyMap)) {
      events.emit('nav:primary');
      return;
    }

    // Expand/Collapse (Space)
    if (isAction(input, key, 'nav.expand', keyMap) && handlers.onToggleExpand) {
      handlers.onToggleExpand();
      return;
    }

    // Worktree Actions
    if (isAction(input, key, 'worktree.next', keyMap) && handlers.onNextWorktree) {
      handlers.onNextWorktree();
      return;
    }

    if (isAction(input, key, 'worktree.panel', keyMap)) {
      events.emit('ui:modal:open', { id: 'worktree' });
      return;
    }

    // Command/Filter Actions
    if (isAction(input, key, 'ui.command', keyMap)) {
      events.emit('ui:modal:open', { id: 'fuzzy-search', context: { initialQuery: '' } });
      return;
    }

    if (isAction(input, key, 'ui.filter', keyMap)) {
      events.emit('ui:modal:open', { id: 'command-bar', context: { initialInput: '/filter ' } });
      return;
    }

    if (isAction(input, key, 'ui.escape', keyMap) && handlers.onClearFilter) {
      handlers.onClearFilter();
      return;
    }

    // Git Actions
    if (isAction(input, key, 'git.toggle', keyMap) && handlers.onToggleGitStatus) {
      handlers.onToggleGitStatus();
      return;
    }

    // Note: Git only mode (Shift+G) not yet mapped to semantic action
    // Keep legacy check for now to avoid breaking changes
    if (input === 'G' && handlers.onToggleGitOnlyMode) {
      handlers.onToggleGitOnlyMode();
      return;
    }

    // Copy Actions
    // Note: CopyTree builder (Shift+C) not yet mapped to semantic action
    if (input === 'C' && handlers.onOpenCopyTreeBuilder) {
      handlers.onOpenCopyTreeBuilder();
      return;
    }

    // CopyTree shortcut - mapped to file.copyTree
    if (isAction(input, key, 'file.copyTree', keyMap)) {
      events.emit('file:copy-tree', {});
      return;
    }

    // Recent Activity (not yet configurable - keeping legacy behavior)
    if (input === 'a' && !key.shift && !key.ctrl && !key.meta) {
      events.emit('ui:modal:open', { id: 'recent-activity' });
      return;
    }

    // UI Actions
    if (isAction(input, key, 'ui.refresh', keyMap) && handlers.onRefresh) {
      handlers.onRefresh();
      return;
    }

    if (isAction(input, key, 'ui.help', keyMap)) {
      events.emit('ui:modal:open', { id: 'help' });
      return;
    }

    if (isAction(input, key, 'ui.contextMenu', keyMap)) {
      if (handlers.onOpenContextMenu) {
        handlers.onOpenContextMenu();
        return;
      }
      events.emit('ui:modal:open', { id: 'context-menu' });
      return;
    }

    if (isAction(input, key, 'app.quit', keyMap) && handlers.onQuit) {
      handlers.onQuit();
      return;
    }
  });
}
