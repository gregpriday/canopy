import { EventEmitter } from 'events';
import type { Worktree, WorktreeChanges, WorktreeMood } from '../../types/index.js';
import { createFileWatcher, type FileWatcher, type FileChangeEvent } from '../../utils/fileWatcher.js';
import { getWorktreeChangesWithStats, invalidateGitStatusCache } from '../../utils/git.js';
import { generateWorktreeSummary } from '../ai/worktree.js';
import { categorizeWorktree } from '../../utils/worktreeMood.js';
import { debounce, type DebouncedFunction } from '../../utils/debounce.js';
import { logWarn, logError, logInfo } from '../../utils/logger.js';
import { events } from '../events.js';

const GIT_STATUS_DEBOUNCE_MS = 1000; // Update git status 1s after file changes
const AI_SUMMARY_DEBOUNCE_MS = 10000; // Update AI summary 10s after file changes (Reduced from 30s)
const AI_SUMMARY_MIN_INTERVAL_MS = AI_SUMMARY_DEBOUNCE_MS / 2; // Hard throttle: minimum 5s between AI calls
const TRAFFIC_LIGHT_FLASH_DURATION = 2000; // "Flash" state lasts 2 seconds
const TRAFFIC_LIGHT_COOLDOWN_DURATION = 10000; // "Cooldown" state lasts 10 seconds

/**
 * Represents the complete state of a monitored worktree.
 * This is what gets emitted on every update.
 */
export interface WorktreeState extends Worktree {
  // Full worktree changes (includes all file details)
  worktreeChanges: WorktreeChanges | null;

  // Traffic light state (activity indicator)
  trafficLight: 'green' | 'yellow' | 'gray';

  // Activity tracking
  lastActivityTimestamp: number | null;
  isActive: boolean; // True if currently in "flash" or "cooldown" state
}

/**
 * WorktreeMonitor is responsible for monitoring a single git worktree.
 *
 * It encapsulates all the logic for:
 * - File watching
 * - Git status polling
 * - AI summary generation
 * - Mood categorization
 * - Activity tracking (traffic light)
 *
 * The monitor emits 'update' events whenever its state changes.
 * React components can subscribe to these updates via the WorktreeService.
 */
export class WorktreeMonitor extends EventEmitter {
  public readonly id: string;
  public readonly path: string;
  public readonly name: string;
  public readonly branch: string | undefined;
  public readonly isCurrent: boolean;

  private state: WorktreeState;
  private watcher: FileWatcher | null = null;
  private gitStatusDebounced: DebouncedFunction<() => Promise<void>>;
  private aiSummaryDebounced: DebouncedFunction<() => Promise<void>>;
  private mainBranch: string;

  // Timers for traffic light transitions
  private trafficLightTimer: NodeJS.Timeout | null = null;

  // Polling timer for git status (fallback when file watching is disabled)
  private pollingTimer: NodeJS.Timeout | null = null;
  private pollingInterval: number = 1500; // Default 1.5s, can be adjusted by WorktreeService

  // Flags
  private isRunning: boolean = false;
  private watchingEnabled: boolean = true;

  // Throttling: Track last AI request to prevent cascade
  private lastAIRequestTime: number = 0;

  // Track last processed state to avoid redundant AI calls
  private lastProcessedMtime: number = -1; // -1 = never processed
  private lastProcessedChangeCount: number = -1;

  // Prevent concurrent AI processing
  private isGeneratingSummary: boolean = false;

  constructor(worktree: Worktree, mainBranch: string = 'main', watchingEnabled: boolean = true) {
    super();

    this.id = worktree.id;
    this.path = worktree.path;
    this.name = worktree.name;
    this.branch = worktree.branch;
    this.isCurrent = worktree.isCurrent;
    this.mainBranch = mainBranch;
    this.watchingEnabled = watchingEnabled;

    // Initialize state
    this.state = {
      id: worktree.id,
      path: worktree.path,
      name: worktree.name,
      branch: worktree.branch,
      isCurrent: worktree.isCurrent,
      worktreeChanges: null,
      mood: 'stable',
      summary: worktree.summary,
      summaryLoading: false,
      modifiedCount: worktree.modifiedCount || 0,
      changes: worktree.changes,
      trafficLight: 'gray',
      lastActivityTimestamp: null,
      isActive: false,
    };

    // Create debounced update functions
    this.gitStatusDebounced = debounce(
      () => this.updateGitStatus(),
      GIT_STATUS_DEBOUNCE_MS
    );

    this.aiSummaryDebounced = debounce(
      () => this.updateAISummary(),
      AI_SUMMARY_DEBOUNCE_MS
    );
  }

  /**
   * Start monitoring this worktree.
   * Initializes file watcher and performs initial git status fetch.
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logWarn('WorktreeMonitor already running', { id: this.id });
      return;
    }

    this.isRunning = true;
    logInfo('Starting WorktreeMonitor', { id: this.id, path: this.path });

    // Start file watcher if enabled
    if (this.watchingEnabled) {
      try {
        this.watcher = createFileWatcher(this.path, {
          onBatch: (events) => this.handleFileChanges(events),
          onError: (error) => this.handleWatcherError(error),
        });
        this.watcher.start();
      } catch (error) {
        logError('Failed to start file watcher', error as Error, { id: this.id });
        // Continue without watching - will fall back to polling
      }
    }

    // Start polling timer (works even if watching is enabled as a backup)
    this.startPolling();

    // Initial fetch (Git status only - AI summary waits for changes)
    await this.updateGitStatus();
  }

  /**
   * Stop monitoring this worktree.
   * Cleans up file watcher, timers, and event listeners.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logInfo('Stopping WorktreeMonitor', { id: this.id });

    // Stop file watcher
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }

    // Clear timers
    this.stopPolling();
    if (this.trafficLightTimer) {
      clearTimeout(this.trafficLightTimer);
      this.trafficLightTimer = null;
    }

    // Cancel debounced functions
    this.gitStatusDebounced.cancel();
    this.aiSummaryDebounced.cancel();

    // Remove all event listeners
    this.removeAllListeners();
  }

  /**
   * Get the current state of this worktree.
   */
  public getState(): WorktreeState {
    return { ...this.state };
  }

  /**
   * Set the polling interval for git status updates.
   * Used by WorktreeService to adjust intervals based on active/background status.
   */
  public setPollingInterval(ms: number): void {
    if (this.pollingInterval === ms) {
      return;
    }

    this.pollingInterval = ms;

    // Restart polling with new interval if currently running
    if (this.isRunning) {
      this.stopPolling();
      this.startPolling();
    }
  }

  /**
   * Force refresh of git status and AI summary.
   */
  public async refresh(forceAI: boolean = false): Promise<void> {
    await this.updateGitStatus(true);
    if (forceAI) {
      await this.updateAISummary(true);
    }
  }

  /**
   * Handle file change events from the watcher.
   */
  private handleFileChanges(fileChanges: FileChangeEvent[]): void {
    if (!this.isRunning) {
      return;
    }

    // Update activity timestamp
    this.state.lastActivityTimestamp = Date.now();
    this.state.isActive = true;

    // Set traffic light to green (active)
    this.setTrafficLight('green');

    // Emit change event for activity tracking
    for (const event of fileChanges) {
      events.emit('watcher:change', { type: event.type, path: event.path });
    }

    // Queue git status update (debounced)
    this.gitStatusDebounced();

    // Queue AI summary update (debounced with longer delay)
    this.aiSummaryDebounced();
  }

  /**
   * Handle file watcher errors.
   */
  private handleWatcherError(error: Error): void {
    logError('File watcher error in WorktreeMonitor', error, { id: this.id });

    // Set mood to error
    this.state.mood = 'error';
    this.emitUpdate();

    // Emit global notification
    events.emit('ui:notify', {
      type: 'warning',
      message: `File watching failed for ${this.name}: ${error.message}`,
    });
  }

  /**
   * Update git status for this worktree.
   */
  private async updateGitStatus(forceRefresh: boolean = false): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      if (forceRefresh) {
        invalidateGitStatusCache(this.path);
      }

      const worktreeChanges = await getWorktreeChangesWithStats(this.path, forceRefresh);

      // Check if monitor was stopped while waiting for git status
      if (!this.isRunning) {
        return;
      }

      // Update state (both the full worktreeChanges and the inherited changes array)
      this.state.worktreeChanges = worktreeChanges;
      this.state.changes = worktreeChanges.changes;
      this.state.modifiedCount = worktreeChanges.changedFileCount;

      // Determine if worktree transitioned to clean
      const wasClean = this.state.worktreeChanges?.changedFileCount === 0;
      const isNowClean = worktreeChanges.changedFileCount === 0;

      // If transitioned to clean, trigger immediate AI summary update
      if (!wasClean && isNowClean) {
        // Cancel pending debounced AI update
        this.aiSummaryDebounced.cancel();
        // Trigger immediate update
        await this.updateAISummary(true);
      }

      // Update mood based on changes
      await this.updateMood();

      // If clean, transition traffic light to gray
      if (isNowClean) {
        this.setTrafficLight('gray');
        this.state.isActive = false;
      }

      this.emitUpdate();
    } catch (error) {
      logError('Failed to update git status', error as Error, { id: this.id });
      this.state.mood = 'error';
      this.emitUpdate();
    }
  }

  /**
   * Update AI summary for this worktree.
   */
  private async updateAISummary(forceUpdate: boolean = false): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Guard against concurrent AI calls
    if (this.isGeneratingSummary) {
      logWarn('AI summary already in progress', { id: this.id });
      return;
    }

    // Don't generate summary if we don't have changes data yet
    if (!this.state.worktreeChanges) {
      return;
    }

    const currentMtime = this.state.worktreeChanges.latestFileMtime ?? 0;
    const currentCount = this.state.worktreeChanges.changedFileCount;

    // Skip if we already processed this exact state (unless forced)
    if (!forceUpdate &&
        this.lastProcessedMtime === currentMtime &&
        this.lastProcessedChangeCount === currentCount) {
      logInfo('AI summary skipped (state unchanged)', {
        id: this.id,
        mtime: currentMtime,
        count: currentCount,
      });
      return;
    }

    // Hard throttle: Prevent rapid-fire updates even if debounce fails
    // Ensures minimum interval between AI calls (unless forced)
    const now = Date.now();
    const timeSinceLast = now - this.lastAIRequestTime;

    if (!forceUpdate && timeSinceLast < AI_SUMMARY_MIN_INTERVAL_MS) {
      logWarn('AI summary throttled (too soon)', {
        id: this.id,
        timeSinceLast: `${timeSinceLast}ms`,
        minInterval: `${AI_SUMMARY_MIN_INTERVAL_MS}ms`,
      });
      return;
    }

    // Lock processing
    this.isGeneratingSummary = true;

    try {
      // Update tracking state
      this.lastAIRequestTime = now;
      this.lastProcessedMtime = currentMtime;
      this.lastProcessedChangeCount = currentCount;

      // Set loading state
      this.state.summaryLoading = true;
      this.setTrafficLight('yellow'); // Yellow = "thinking"
      this.emitUpdate();

      const summary = await generateWorktreeSummary(
        this.path,
        this.branch,
        this.mainBranch,
        this.state.worktreeChanges
      );

      // Check if monitor was stopped while waiting for AI summary
      if (!this.isRunning) {
        return;
      }

      if (summary) {
        this.state.summary = summary.summary;
        this.state.modifiedCount = summary.modifiedCount;
      }

      this.state.summaryLoading = false;

      // Transition traffic light to gray (idle) after AI finishes
      if (this.state.worktreeChanges.changedFileCount === 0) {
        this.setTrafficLight('gray');
        this.state.isActive = false;
      }

      this.emitUpdate();
    } catch (error) {
      logError('Failed to generate AI summary', error as Error, { id: this.id });
      this.state.summaryLoading = false;
      this.state.summary = 'Summary unavailable';
      this.setTrafficLight('gray');
      this.emitUpdate();
    } finally {
      this.isGeneratingSummary = false;
    }
  }

  /**
   * Update worktree mood categorization.
   */
  private async updateMood(): Promise<void> {
    try {
      const mood = await categorizeWorktree(
        {
          id: this.id,
          path: this.path,
          name: this.name,
          branch: this.branch,
          isCurrent: this.isCurrent,
        },
        this.state.worktreeChanges || undefined,
        this.mainBranch
      );

      this.state.mood = mood;
    } catch (error) {
      logWarn('Failed to categorize worktree mood', {
        id: this.id,
        message: (error as Error).message,
      });
      this.state.mood = 'error';
    }
  }

  /**
   * Set traffic light state with automatic transitions.
   *
   * Green (active) → Yellow (cooldown after 2s) → Gray (idle after 10s)
   */
  private setTrafficLight(color: 'green' | 'yellow' | 'gray'): void {
    // Clear existing timer
    if (this.trafficLightTimer) {
      clearTimeout(this.trafficLightTimer);
      this.trafficLightTimer = null;
    }

    this.state.trafficLight = color;

    // Set up automatic transitions
    if (color === 'green') {
      // Green → Yellow after 2s
      this.trafficLightTimer = setTimeout(() => {
        this.setTrafficLight('yellow');
        this.emitUpdate();
      }, TRAFFIC_LIGHT_FLASH_DURATION);
    } else if (color === 'yellow') {
      // Yellow → Gray after 10s
      this.trafficLightTimer = setTimeout(() => {
        this.setTrafficLight('gray');
        this.state.isActive = false;
        this.emitUpdate();
      }, TRAFFIC_LIGHT_COOLDOWN_DURATION);
    }
  }

  /**
   * Start polling for git status updates.
   */
  private startPolling(): void {
    if (this.pollingTimer) {
      return;
    }

    this.pollingTimer = setInterval(() => {
      void this.updateGitStatus();
    }, this.pollingInterval);
  }

  /**
   * Stop polling for git status updates.
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Emit state update event.
   */
  private emitUpdate(): void {
    this.emit('update', this.getState());
  }
}
