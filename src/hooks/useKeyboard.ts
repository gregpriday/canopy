import { useRef, useMemo } from 'react';
import { useInput } from 'ink';
import { events } from '../services/events.js';
import { isAction } from '../utils/keyMatcher.js';
import { getResolvedKeyMap } from '../utils/keyPresets.js';
import type { CanopyConfig } from '../types/index.js';

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
  onClearFilter?: () => void;     // Escape when filter active

  // Git Actions
  onToggleGitStatus?: () => void; // g key
  onToggleGitOnlyMode?: () => void; // Shift+G key

  // Copy Actions
  onOpenCopyTreeBuilder?: () => void;  // Shift+C key

  // UI Actions
  onRefresh?: () => void;          // r key
  onQuit?: () => void;             // q key
  onForceExit?: () => void;        // Ctrl+C (second press)
  onWarnExit?: () => void;         // Ctrl+C (first press)
}

export function useKeyboard(handlers: KeyboardHandlers, config: CanopyConfig): void {
  const enabled = handlers.enabled ?? true;
  // Use ref instead of state to prevent stale closures in useInput callback
  const exitConfirmRef = useRef(false);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve keymap from config once
  const keyMap = useMemo(
    () => getResolvedKeyMap(config.keys),
    [config.keys],
  );

  // Note: Home/End sequence handling removed with tree view mode

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

    // Note: Navigation events (nav:move, nav:primary) removed with tree view mode
    // Dashboard uses useDashboardNav for its own navigation

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

    // Filter Actions
    if ((key.escape || isAction(input, key, 'ui.escape', keyMap)) && handlers.onClearFilter) {
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

    // UI Actions
    if (isAction(input, key, 'ui.refresh', keyMap) && handlers.onRefresh) {
      handlers.onRefresh();
      return;
    }

    if (isAction(input, key, 'app.quit', keyMap) && handlers.onQuit) {
      handlers.onQuit();
      return;
    }
  });
}
