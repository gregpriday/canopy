import { WorktreeMonitor, type WorktreeState } from './WorktreeMonitor.js';
import type { Worktree } from '../../types/index.js';
import { logInfo, logWarn } from '../../utils/logger.js';
import { events } from '../events.js';

const ACTIVE_WORKTREE_INTERVAL_MS = 2000; // 2s for active worktree (fast polling since no file watcher)
const BACKGROUND_WORKTREE_INTERVAL_MS = 10000; // 10s for background worktrees

/**
 * WorktreeService manages all WorktreeMonitor instances.
 *
 * Responsibilities:
 * - Create monitors for new worktrees
 * - Destroy monitors for removed worktrees
 * - Adjust polling intervals based on active/background status
 * - Forward monitor updates to the global event bus
 *
 * This service is a singleton and should be accessed via the exported instance.
 */
interface PendingSyncRequest {
  worktrees: Worktree[];
  activeWorktreeId: string | null;
  mainBranch: string;
  watchingEnabled: boolean;
}

class WorktreeService {
  private monitors = new Map<string, WorktreeMonitor>();
  private mainBranch: string = 'main';
  private watchingEnabled: boolean = true;
  private activeWorktreeId: string | null = null;
  private isSyncing: boolean = false;
  private pendingSync: PendingSyncRequest | null = null;

  /**
   * Initialize or update monitors to match the current worktree list.
   *
   * This should be called:
   * - On app startup
   * - When worktrees are added/removed
   * - When the active worktree changes
   *
   * @param worktrees - Current list of worktrees
   * @param activeWorktreeId - ID of the currently active worktree
   * @param mainBranch - Main branch name (default: 'main')
   * @param watchingEnabled - Enable file watching (default: true)
   */
  public async sync(
    worktrees: Worktree[],
    activeWorktreeId: string | null = null,
    mainBranch: string = 'main',
    watchingEnabled: boolean = true
  ): Promise<void> {
    // If already syncing, queue this request and return
    if (this.isSyncing) {
      logWarn('Sync already in progress, queuing request');
      this.pendingSync = { worktrees, activeWorktreeId, mainBranch, watchingEnabled };
      return;
    }

    this.isSyncing = true;

    try {
      this.mainBranch = mainBranch;
      this.watchingEnabled = watchingEnabled;
      this.activeWorktreeId = activeWorktreeId;

      const currentIds = new Set(worktrees.map(wt => wt.id));

    // 1. Remove stale monitors (worktrees that no longer exist)
    for (const [id, monitor] of this.monitors) {
      if (!currentIds.has(id)) {
        logInfo('Removing stale WorktreeMonitor', { id });
        await monitor.stop();
        this.monitors.delete(id);
        // Emit removal event so hooks can clean up cached state
        events.emit('sys:worktree:remove', { worktreeId: id });
      }
    }

    // 2. Create new monitors and update existing ones
    for (const wt of worktrees) {
      const existingMonitor = this.monitors.get(wt.id);
      const isActive = wt.id === activeWorktreeId;

      if (existingMonitor) {
        // Update metadata (branch, name) if changed (e.g., after git checkout)
        existingMonitor.updateMetadata(wt);

        // Update polling interval based on active status
        const interval = isActive
          ? ACTIVE_WORKTREE_INTERVAL_MS
          : BACKGROUND_WORKTREE_INTERVAL_MS;

        existingMonitor.setPollingInterval(interval);
      } else {
        // Create new monitor
        logInfo('Creating new WorktreeMonitor', { id: wt.id, path: wt.path });

        const monitor = new WorktreeMonitor(wt, mainBranch);

        // Set initial polling interval
        const interval = isActive
          ? ACTIVE_WORKTREE_INTERVAL_MS
          : BACKGROUND_WORKTREE_INTERVAL_MS;

        monitor.setPollingInterval(interval);

        // Start monitoring only if watching is enabled
        // When --no-watch is passed, we only do initial status fetch
        if (this.watchingEnabled) {
          await monitor.start();
        } else {
          // Just fetch initial status without starting polling
          await monitor.fetchInitialStatus();
        }

        this.monitors.set(wt.id, monitor);
      }
    }

      logInfo('WorktreeService sync complete', {
        totalMonitors: this.monitors.size,
        activeWorktreeId,
      });
    } finally {
      this.isSyncing = false;

      // Check if there's a pending sync request and execute it
      if (this.pendingSync) {
        const pending = this.pendingSync;
        this.pendingSync = null;
        logInfo('Executing pending sync request');
        // Execute pending sync asynchronously (don't await to avoid blocking)
        void this.sync(
          pending.worktrees,
          pending.activeWorktreeId,
          pending.mainBranch,
          pending.watchingEnabled
        );
      }
    }
  }

  /**
   * Get the monitor for a specific worktree.
   *
   * @param worktreeId - Worktree ID
   * @returns WorktreeMonitor instance or undefined
   */
  public getMonitor(worktreeId: string): WorktreeMonitor | undefined {
    return this.monitors.get(worktreeId);
  }

  /**
   * Get all monitor states.
   *
   * @returns Map of worktree ID to WorktreeState
   */
  public getAllStates(): Map<string, WorktreeState> {
    const states = new Map<string, WorktreeState>();
    for (const [id, monitor] of this.monitors) {
      states.set(id, monitor.getState());
    }
    return states;
  }

  /**
   * Refresh a specific worktree or all worktrees.
   *
   * @param worktreeId - Optional worktree ID. If not provided, refreshes all.
   * @param forceAI - Force AI summary regeneration (default: false)
   */
  public async refresh(worktreeId?: string, forceAI: boolean = false): Promise<void> {
    if (worktreeId) {
      const monitor = this.monitors.get(worktreeId);
      if (monitor) {
        await monitor.refresh(forceAI);
      } else {
        logWarn('Attempted to refresh non-existent worktree', { worktreeId });
      }
    } else {
      // Refresh all
      const promises = Array.from(this.monitors.values()).map(monitor =>
        monitor.refresh(forceAI)
      );
      await Promise.all(promises);
    }
  }

  /**
   * Stop all monitors and clean up resources.
   * Should be called on app shutdown.
   */
  public async stopAll(): Promise<void> {
    logInfo('Stopping all WorktreeMonitors', { count: this.monitors.size });

    const promises = Array.from(this.monitors.values()).map(monitor =>
      monitor.stop()
    );

    await Promise.all(promises);
    this.monitors.clear();
  }

  /**
   * Get count of active monitors.
   */
  public getMonitorCount(): number {
    return this.monitors.size;
  }
}

export const worktreeService = new WorktreeService();
