import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from 'ink';
import type { Worktree, WorktreeChanges, DevServerState } from '../types/index.js';
import { WorktreeCard } from './WorktreeCard.js';
import { useTerminalMouse } from '../hooks/useTerminalMouse.js';
import { devServerManager } from '../services/server/index.js';
import { events } from '../services/events.js';

export interface DevServerConfig {
  /** Enable/disable dev server feature entirely */
  enabled: boolean;
  /** Custom command override (applies to all worktrees) */
  command?: string;
}

export interface WorktreeOverviewProps {
  worktrees: Worktree[];
  worktreeChanges: Map<string, WorktreeChanges>;
  activeWorktreeId: string | null;
  activeRootPath: string;
  focusedWorktreeId: string | null;
  expandedWorktreeIds: Set<string>;
  visibleStart?: number;
  visibleEnd?: number;
  onToggleExpand: (id: string) => void;
  onCopyTree: (id: string, profile?: string) => void;
  onOpenEditor: (id: string) => void;
  onOpenExplorer: (id: string) => void;
  /** Dev server configuration */
  devServerConfig?: DevServerConfig;
}

const FALLBACK_CHANGES: WorktreeChanges = {
  worktreeId: '',
  rootPath: '',
  changes: [],
  changedFileCount: 0,
  totalInsertions: 0,
  totalDeletions: 0,
  lastUpdated: 0,
};

/**
 * Sort worktrees by Most Recently Used (MRU) ordering.
 *
 * Sorting rules:
 * 1. Pin main/master branches to the very top (standard navigational anchor)
 * 2. Sort all other worktrees by lastActivityTimestamp (most recent first)
 * 3. Alphabetical fallback when timestamps are equal or missing
 *
 * Note: Mood-based visual indicators (border colors) remain but don't affect sort order.
 */
export function sortWorktrees(worktrees: Worktree[]): Worktree[] {
  if (worktrees.length === 0) {
    return [];
  }

  // Find main/master to pin at top
  const mainIndex = worktrees.findIndex(
    wt => wt.branch === 'main' || wt.branch === 'master'
  );

  // Sort by recency (most recent first), then alphabetically as tie-breaker
  const sorted = [...worktrees].sort((a, b) => {
    // Primary sort: Most recent activity first
    const timeA = a.lastActivityTimestamp ?? 0;
    const timeB = b.lastActivityTimestamp ?? 0;

    if (timeA !== timeB) {
      return timeB - timeA; // Descending (newest first)
    }

    // Fallback: Alphabetical by branch/name
    const labelA = a.branch || a.name;
    const labelB = b.branch || b.name;
    return labelA.localeCompare(labelB);
  });

  // Prepend main/master at the top
  if (mainIndex >= 0) {
    const mainWorktree = worktrees[mainIndex];
    const filtered = sorted.filter(wt => wt.id !== mainWorktree.id);
    return [mainWorktree, ...filtered];
  }

  return sorted;
}

export const WorktreeOverview: React.FC<WorktreeOverviewProps> = ({
  worktrees,
  worktreeChanges,
  activeRootPath,
  focusedWorktreeId,
  expandedWorktreeIds,
  visibleStart,
  visibleEnd,
  onToggleExpand,
  onCopyTree,
  onOpenEditor,
  onOpenExplorer,
  devServerConfig,
}) => {
  // Check if dev server feature is enabled (default: true)
  const devServerEnabled = devServerConfig?.enabled ?? true;
  const sorted = useMemo(() => sortWorktrees(worktrees), [worktrees]);
  const start = Math.max(0, visibleStart ?? 0);
  const end = visibleEnd ?? sorted.length;
  const sliced = sorted.slice(start, end);

  // Track dev server states and which worktrees have dev scripts
  const [serverStates, setServerStates] = useState<Map<string, DevServerState>>(new Map());
  const [devScriptCache, setDevScriptCache] = useState<Map<string, boolean>>(new Map());

  // Check for dev scripts asynchronously to avoid blocking UI
  useEffect(() => {
    // Skip if dev server feature is disabled
    if (!devServerEnabled) {
      setDevScriptCache(new Map());
      return;
    }

    let cancelled = false;

    const checkDevScripts = async () => {
      // Pre-warm the cache for all worktrees in parallel
      const paths = worktrees.map(wt => wt.path);
      await devServerManager.warmCache(paths);

      if (cancelled) return;

      // Now build the cache map from the warmed cache
      const cache = new Map<string, boolean>();
      for (const wt of worktrees) {
        // This will now be a cache hit (synchronous)
        cache.set(wt.id, devServerManager.hasDevScript(wt.path));
      }
      setDevScriptCache(cache);
    };

    void checkDevScripts();

    return () => {
      cancelled = true;
    };
  }, [worktrees, devServerEnabled]);

  // Subscribe to server state updates
  useEffect(() => {
    // Initialize with current states
    setServerStates(devServerManager.getAllStates());

    const unsubscribe = events.on('server:update', (newState) => {
      setServerStates(prev => {
        const next = new Map(prev);
        next.set(newState.worktreeId, newState);
        return next;
      });
    });

    return unsubscribe;
  }, []);

  // Handler for toggling server state
  const handleToggleServer = useCallback((worktreeId: string, worktreePath: string) => {
    // Pass custom command from config if provided
    void devServerManager.toggle(worktreeId, worktreePath, devServerConfig?.command);
  }, [devServerConfig?.command]);

  const clickRegionsRef = React.useRef(
    new Map<
      string,
      { bounds: { x: number; y: number; width: number; height: number }; handler: () => void }
    >()
  );

  const registerClickRegion = React.useCallback((
    id: string,
    bounds?: { x: number; y: number; width: number; height: number },
    handler?: () => void
  ) => {
    if (!bounds || !handler) {
      clickRegionsRef.current.delete(id);
      return;
    }
    clickRegionsRef.current.set(id, { bounds, handler });
  }, []);

  useTerminalMouse({
    enabled: sliced.length > 0,
    onMouse: event => {
      if (event.button !== 'left' || event.action !== 'down') {
        return;
      }

      for (const { bounds, handler } of clickRegionsRef.current.values()) {
        const withinX = event.x >= bounds.x && event.x < bounds.x + bounds.width;
        const withinY = event.y >= bounds.y && event.y < bounds.y + bounds.height;
        if (withinX && withinY) {
          handler();
          break;
        }
      }
    },
  });

  return (
    <Box flexDirection="column" gap={1} flexGrow={1}>
      {sliced.map((worktree) => {
        const changes = worktreeChanges.get(worktree.id) ?? {
          ...FALLBACK_CHANGES,
          worktreeId: worktree.id,
          rootPath: worktree.path,
        };

        // Only show dev script indicator if feature is enabled
        const hasDevScript = devServerEnabled && (devScriptCache.get(worktree.id) ?? false);
        const serverState = serverStates.get(worktree.id) ?? {
          worktreeId: worktree.id,
          status: 'stopped' as const,
        };

        return (
          <WorktreeCard
            key={worktree.id}
            worktree={worktree}
            changes={changes}
            mood={worktree.mood ?? 'stable'}
            isFocused={worktree.id === focusedWorktreeId}
            isExpanded={expandedWorktreeIds.has(worktree.id)}
            activeRootPath={activeRootPath}
            onToggleExpand={() => onToggleExpand(worktree.id)}
            onCopyTree={() => onCopyTree(worktree.id)}
            onOpenEditor={() => onOpenEditor(worktree.id)}
            onOpenExplorer={() => onOpenExplorer(worktree.id)}
            serverState={serverState}
            hasDevScript={hasDevScript}
            onToggleServer={() => handleToggleServer(worktree.id, worktree.path)}
            aiNote={worktree.aiNote}
            registerClickRegion={registerClickRegion}
          />
        );
      })}
    </Box>
  );
};
