import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInput } from 'ink';
import type { Worktree } from '../types/index.js';
import { HOME_SEQUENCES, END_SEQUENCES } from '../utils/keySequences.js';

export interface DashboardNavProps {
  worktrees: Worktree[];
  focusedWorktreeId: string | null;
  expandedWorktreeIds: Set<string>;
  isModalOpen: boolean;
  viewportSize?: number;
  onFocusChange: (worktreeId: string) => void;
  onToggleExpand: (worktreeId: string) => void;
  onCopyTree: (worktreeId: string) => void;
  onOpenEditor: (worktreeId: string) => void;
  onToggleServer?: (worktreeId: string) => void;
  /** Map of worktreeId -> hasDevScript for guarding 's' key */
  devScriptMap?: Map<string, boolean>;
}

export interface DashboardNavResult {
  visibleStart: number;
  visibleEnd: number;
}

export function useDashboardNav({
  worktrees,
  focusedWorktreeId,
  expandedWorktreeIds,
  isModalOpen,
  viewportSize = 6,
  onFocusChange,
  onToggleExpand,
  onCopyTree,
  onOpenEditor,
  onToggleServer,
  devScriptMap,
}: DashboardNavProps): DashboardNavResult {
  const [visibleStart, setVisibleStart] = useState(0);

  const clampedViewport = Math.max(1, viewportSize);
  const focusedIndex = useMemo(
    () => worktrees.findIndex(wt => wt.id === focusedWorktreeId),
    [focusedWorktreeId, worktrees]
  );

  const ensureVisible = useCallback(
    (targetIndex: number) => {
      const maxStart = Math.max(0, worktrees.length - clampedViewport);
      setVisibleStart(prev => {
        let nextStart = prev;
        if (targetIndex < prev) {
          nextStart = targetIndex;
        } else if (targetIndex >= prev + clampedViewport) {
          nextStart = targetIndex - clampedViewport + 1;
        }
        return Math.min(Math.max(0, nextStart), maxStart);
      });
    },
    [clampedViewport, worktrees.length]
  );

  useEffect(() => {
    if (worktrees.length === 0) {
      setVisibleStart(0);
      return;
    }

    const safeIndex = focusedIndex >= 0 ? focusedIndex : 0;
    ensureVisible(safeIndex);
  }, [ensureVisible, focusedIndex, worktrees.length]);

  const resolveFocused = useCallback(() => {
    if (focusedIndex >= 0) {
      return { id: focusedWorktreeId, index: focusedIndex };
    }
    if (worktrees.length > 0) {
      return { id: worktrees[0].id, index: 0 };
    }
    return { id: null, index: -1 };
  }, [focusedIndex, focusedWorktreeId, worktrees]);

  const moveFocus = useCallback(
    (delta: number) => {
      if (worktrees.length === 0) {
        return;
      }
      const { index } = resolveFocused();
      const nextIndex = Math.max(0, Math.min(worktrees.length - 1, index + delta));
      if (nextIndex === index || !worktrees[nextIndex]) {
        return;
      }
      onFocusChange(worktrees[nextIndex].id);
      ensureVisible(nextIndex);
    },
    [ensureVisible, onFocusChange, resolveFocused, worktrees]
  );

  const focusExact = useCallback(
    (index: number) => {
      if (worktrees[index]) {
        onFocusChange(worktrees[index].id);
        ensureVisible(index);
      }
    },
    [ensureVisible, onFocusChange, worktrees]
  );

  const toggleExpansion = useCallback(
    (id: string, intent: 'toggle' | 'expand' | 'collapse') => {
      if (intent === 'expand' && expandedWorktreeIds.has(id)) {
        return;
      }
      if (intent === 'collapse' && !expandedWorktreeIds.has(id)) {
        return;
      }
      onToggleExpand(id);
    },
    [expandedWorktreeIds, onToggleExpand]
  );

  const handlePrimaryActions = useCallback(
    (input: string, key: { return?: boolean; space?: boolean; leftArrow?: boolean; rightArrow?: boolean }) => {
      const { id, index } = resolveFocused();
      if (!id || index < 0) {
        return;
      }

      if (key.return) {
        onOpenEditor(id);
        return;
      }

      if (input === 'c') {
        onCopyTree(id);
        return;
      }

      // 's' key toggles dev server for focused worktree (only if dev script exists)
      if (input === 's') {
        const hasDevScript = devScriptMap?.get(id) ?? false;
        if (hasDevScript) {
          onToggleServer?.(id);
        }
        return;
      }

      if (input === ' ') {
        toggleExpansion(id, 'toggle');
        return;
      }

      if (key.rightArrow) {
        toggleExpansion(id, 'expand');
        return;
      }

      if (key.leftArrow) {
        toggleExpansion(id, 'collapse');
      }
    },
    [devScriptMap, onCopyTree, onOpenEditor, onToggleServer, resolveFocused, toggleExpansion]
  );

  useInput(
    (input, key) => {
      if (worktrees.length === 0) {
        return;
      }

      if (key.upArrow) {
        moveFocus(-1);
        return;
      }

      if (key.downArrow) {
        moveFocus(1);
        return;
      }

      if (key.pageUp) {
        moveFocus(-3);
        return;
      }

      if (key.pageDown) {
        moveFocus(3);
        return;
      }

      // Home and End keys use escape sequences (not in Ink's Key type)
      if (HOME_SEQUENCES.has(input)) {
        focusExact(0);
        return;
      }

      if (END_SEQUENCES.has(input)) {
        focusExact(worktrees.length - 1);
        return;
      }

      handlePrimaryActions(input, key);
    },
    { isActive: !isModalOpen }
  );

  const visibleEnd = Math.min(visibleStart + clampedViewport, worktrees.length);

  return {
    visibleStart,
    visibleEnd,
  };
}
