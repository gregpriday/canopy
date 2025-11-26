import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInput } from 'ink';
import type { Worktree } from '../types/index.js';
import { HOME_SEQUENCES, END_SEQUENCES } from '../utils/keySequences.js';

export interface DashboardNavProps {
  worktrees: Worktree[];
  focusedWorktreeId: string | null;
  isModalOpen: boolean;
  viewportSize?: number;
  onFocusChange: (worktreeId: string) => void;
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
  isModalOpen,
  viewportSize = 6,
  onFocusChange,
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
        if (targetIndex < prev) return targetIndex;
        if (targetIndex >= prev + clampedViewport)
          return Math.min(targetIndex - clampedViewport + 1, maxStart);
        return prev;
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

  useInput(
    (input, key) => {
      if (isModalOpen || worktrees.length === 0) return;

      const currentIndex = focusedIndex >= 0 ? focusedIndex : 0;

      // Navigation
      if (key.upArrow) {
        const prev = Math.max(0, currentIndex - 1);
        onFocusChange(worktrees[prev].id);
        ensureVisible(prev);
        return;
      }

      if (key.downArrow) {
        const next = Math.min(worktrees.length - 1, currentIndex + 1);
        onFocusChange(worktrees[next].id);
        ensureVisible(next);
        return;
      }

      if (key.pageUp) {
        const prev = Math.max(0, currentIndex - clampedViewport);
        onFocusChange(worktrees[prev].id);
        ensureVisible(prev);
        return;
      }

      if (key.pageDown) {
        const next = Math.min(worktrees.length - 1, currentIndex + clampedViewport);
        onFocusChange(worktrees[next].id);
        ensureVisible(next);
        return;
      }

      if (HOME_SEQUENCES.has(input)) {
        onFocusChange(worktrees[0].id);
        ensureVisible(0);
        return;
      }

      if (END_SEQUENCES.has(input)) {
        onFocusChange(worktrees[worktrees.length - 1].id);
        ensureVisible(worktrees.length - 1);
        return;
      }

      // Actions (no more expansion toggle)
      if (input === 'c') {
        onCopyTree(worktrees[currentIndex].id);
        return;
      }

      if (key.return) {
        onOpenEditor(worktrees[currentIndex].id);
        return;
      }

      // 's' key toggles dev server for focused worktree (only if dev script exists)
      if (input === 's') {
        const hasDevScript = devScriptMap?.get(worktrees[currentIndex].id) ?? false;
        if (hasDevScript) {
          onToggleServer?.(worktrees[currentIndex].id);
        }
      }
    },
    { isActive: !isModalOpen }
  );

  const visibleEnd = Math.min(visibleStart + clampedViewport, worktrees.length);

  return {
    visibleStart,
    visibleEnd,
  };
}
