import { WorktreeMonitor, type WorktreeState } from './WorktreeMonitor.js';
import type { Worktree } from '../../types/index.js';
import { logInfo, logWarn, logDebug } from '../../utils/logger.js';
import { events } from '../events.js';

const ACTIVE_WORKTREE_INTERVAL_MS = 2000; // 2s for active worktree (fast polling since no file watcher)
const BACKGROUND_WORKTREE_INTERVAL_MS = 30000; // 30s for background worktrees (increased from 10s for performance)

// Serial queue configuration
const QUEUE_PROCESSING_DELAY_MS = 50; // Delay between queue items to let UI breathe
const MASTER_POLL_INTERVAL_MS = 500; // Master poll timer interval

/**
 * WorktreeService manages all WorktreeMonitor instances.
 *
 * Responsibilities:
 * - Create monitors for new worktrees
 * - Destroy monitors for removed worktrees
 * - Adjust polling intervals based on active/background status
 * - Forward monitor updates to the global event bus
 * - **PERFORMANCE**: Serialize git operations through a queue to prevent CPU spikes
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

  // Serial queue for git operations - prevents parallel git spawning
  private pollQueue: string[] = [];
  private isProcessingQueue: boolean = false;
  private masterPollTimer: NodeJS.Timeout | null = null;
  private lastPollTime = new Map<string, number>(); // Track when each worktree was last polled

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

        // Clean up queue state for removed worktree
        this.lastPollTime.delete(id);
        const queueIndex = this.pollQueue.indexOf(id);
        if (queueIndex !== -1) {
          this.pollQueue.splice(queueIndex, 1);
        }

        // Emit removal event so hooks can clean up cached state
        events.emit('sys:worktree:remove', { worktreeId: id });
      }
    }

    // 2. Create new monitors and update existing ones
    for (const wt of worktrees) {
      const existingMonitor = this.monitors.get(wt.id);
      const isActive = wt.id === activeWorktreeId;

      if (existingMonitor) {
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

        // Start monitoring
        await monitor.start();

        this.monitors.set(wt.id, monitor);
      }
    }

      // Start the master poll timer if not already running
      this.startMasterPollTimer();

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
   * Start the master poll timer that schedules git status updates.
   *
   * Instead of each monitor having its own timer, we use a single master timer
   * that cycles through monitors and adds them to a serial queue.
   * This prevents the "thundering herd" problem where multiple git processes
   * spawn simultaneously.
   */
  private startMasterPollTimer(): void {
    if (this.masterPollTimer) {
      return; // Already running
    }

    logDebug('Starting master poll timer', { intervalMs: MASTER_POLL_INTERVAL_MS });

    this.masterPollTimer = setInterval(() => {
      this.scheduleDuePolls();
    }, MASTER_POLL_INTERVAL_MS);
  }

  /**
   * Stop the master poll timer.
   */
  private stopMasterPollTimer(): void {
    if (this.masterPollTimer) {
      clearInterval(this.masterPollTimer);
      this.masterPollTimer = null;
      logDebug('Stopped master poll timer');
    }
  }

  /**
   * Check which worktrees are due for polling and add them to the queue.
   * Active worktree gets polled more frequently than background worktrees.
   */
  private scheduleDuePolls(): void {
    const now = Date.now();

    for (const [id, _monitor] of this.monitors) {
      const lastPoll = this.lastPollTime.get(id) || 0;
      const isActive = id === this.activeWorktreeId;
      const interval = isActive ? ACTIVE_WORKTREE_INTERVAL_MS : BACKGROUND_WORKTREE_INTERVAL_MS;

      if (now - lastPoll >= interval) {
        // Only add to queue if not already queued
        if (!this.pollQueue.includes(id)) {
          this.pollQueue.push(id);
          logDebug('Queued worktree for polling', { id, isActive });
        }
      }
    }

    // Process the queue
    this.processQueue();
  }

  /**
   * Process the poll queue serially.
   * Only one git status operation runs at a time to prevent CPU spikes.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.pollQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    const worktreeId = this.pollQueue.shift();
    if (!worktreeId) {
      this.isProcessingQueue = false;
      return;
    }

    const monitor = this.monitors.get(worktreeId);
    if (monitor) {
      try {
        logDebug('Processing queue item', { worktreeId, queueLength: this.pollQueue.length });
        await monitor.updateGitStatusFromService();
        this.lastPollTime.set(worktreeId, Date.now());
      } catch (error) {
        logWarn('Error processing queue item', { worktreeId, error: (error as Error).message });
      }
    }

    this.isProcessingQueue = false;

    // Schedule next item with a small delay to let UI breathe
    if (this.pollQueue.length > 0) {
      setTimeout(() => this.processQueue(), QUEUE_PROCESSING_DELAY_MS);
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

    // Stop the master poll timer first
    this.stopMasterPollTimer();

    // Clear the queue
    this.pollQueue = [];
    this.lastPollTime.clear();

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
