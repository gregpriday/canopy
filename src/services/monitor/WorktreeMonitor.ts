import { EventEmitter } from 'events';
import type { Worktree, WorktreeChanges, WorktreeMood } from '../../types/index.js';
import { createFileWatcher, type FileWatcher, type FileChangeEvent, buildIgnorePatterns } from '../../utils/fileWatcher.js';
import { getWorktreeChangesWithStats, invalidateGitStatusCache } from '../../utils/git.js';
import { generateWorktreeSummary } from '../ai/worktree.js';
import { categorizeWorktree } from '../../utils/worktreeMood.js';
import { debounce, type DebouncedFunction } from '../../utils/debounce.js';
import { logWarn, logError, logInfo } from '../../utils/logger.js';
import { loadGitignorePatterns } from '../../utils/fileTree.js';
import { events } from '../events.js';

const GIT_STATUS_DEBOUNCE_MS = 1000; // Update git status 1s after file changes
const AI_SUMMARY_DEBOUNCE_MS = 10000; // Update AI summary 10s after file changes
const AI_SUMMARY_MIN_INTERVAL_MS = AI_SUMMARY_DEBOUNCE_MS / 2; // Hard throttle: minimum 5s between AI calls
const TRAFFIC_LIGHT_GREEN_DURATION = 30000; // Green state: 0-30 seconds after file change
const TRAFFIC_LIGHT_YELLOW_DURATION = 60000; // Yellow state: additional 60 seconds (30-90s total)

/**
 * Represents the complete state of a monitored worktree.
 * This is what gets emitted on every update.
 */
export interface WorktreeState extends Worktree {
  worktreeId: string;
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
      worktreeId: worktree.id,
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
      // Load ignore patterns (Standard + .gitignore) to prevent noise
      // Note: loadGitignorePatterns handles its own errors and returns [] on failure
      const gitIgnores = await loadGitignorePatterns(this.path);
      const ignoredPatterns = buildIgnorePatterns(gitIgnores);

      try {
        this.watcher = createFileWatcher(this.path, {
          ignored: ignoredPatterns,
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

    // Initial fetch and AI summary generation
    await this.updateGitStatus(true); // Initial force fetch

    // Trigger initial AI summary generation for startup
    if (this.state.worktreeChanges) {
      const isClean = this.state.worktreeChanges.changedFileCount === 0;

      if (isClean) {
        // Clean worktrees: Generate immediately (fast git log, no AI)
        await this.updateCleanSummary();
      } else {
        // Dirty worktrees: Use debounced generation to prevent API burst on startup
        // This gives user time to review the UI before generating all summaries
        this.aiSummaryDebounced();
      }
    }
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
    // Allow manual invocations (tests/polling) even when monitor is not started
    const isActiveRun = this.isRunning;

    // Update activity timestamp
    this.state.lastActivityTimestamp = Date.now();
    this.state.isActive = true;

    // Set traffic light to green (active) ONLY if batch contains non-deletion events
    // Per spec: "File deletions currently do NOT trigger traffic light changes"
    const hasNonDeletionEvents = fileChanges.some(
      event => event.type !== 'unlink' && event.type !== 'unlinkDir'
    );

    if (hasNonDeletionEvents) {
      this.setTrafficLight('green');
    }

    // Emit change event for activity tracking
    for (const event of fileChanges) {
      events.emit('watcher:change', { type: event.type, path: event.path });
    }

    if (isActiveRun) {
      // Queue git status update (debounced)
      this.gitStatusDebounced();

      // Queue AI summary update (debounced with longer delay)
      this.aiSummaryDebounced();
    }
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

      const newChanges = await getWorktreeChangesWithStats(this.path, forceRefresh);

      // Check if monitor was stopped while waiting for git status
      if (!this.isRunning) {
        return;
      }

      // PERFORMANCE FIX: Deep equality check to prevent render loops
      // The git util returns a new object every time, so strictly checking references fails.
      const prevChanges = this.state.worktreeChanges;

      // Compare both aggregate stats AND the actual change list to catch renames, mode changes, etc.
      const isUnchanged = prevChanges &&
        prevChanges.changedFileCount === newChanges.changedFileCount &&
        prevChanges.latestFileMtime === newChanges.latestFileMtime &&
        prevChanges.totalInsertions === newChanges.totalInsertions &&
        prevChanges.totalDeletions === newChanges.totalDeletions &&
        this.areChangeListsEqual(prevChanges.changes, newChanges.changes);

      if (isUnchanged && !forceRefresh) {
        return; // Stop propagation if data is effectively same
      }

      // Update state (both the full worktreeChanges and the inherited changes array)
      this.state.worktreeChanges = newChanges;
      this.state.changes = newChanges.changes;
      this.state.modifiedCount = newChanges.changedFileCount;

      // Logic: Transition from Dirty -> Clean
      const wasClean = prevChanges ? prevChanges.changedFileCount === 0 : false;
      const isNowClean = newChanges.changedFileCount === 0;

      // If transitioned to clean, update summary immediately with last commit
      // Don't use updateAISummary because it might be blocked by isGeneratingSummary
      if (!wasClean && isNowClean) {
        // Cancel pending debounced AI update
        this.aiSummaryDebounced.cancel();
        // Get clean summary directly (fast git log call, no AI)
        await this.updateCleanSummary();
      }

      // Update mood based on changes
      await this.updateMood();

      // If clean, transition traffic light to gray
      if (isNowClean) {
        this.setTrafficLight('gray');
        this.state.isActive = false;
      } else if (!isUnchanged) {
        // For polling-only mode: if we detected new dirty changes, queue AI update
        // This ensures AI summaries update even without file watcher events
        this.aiSummaryDebounced();
      }

      this.emitUpdate();
    } catch (error) {
      logError('Failed to update git status', error as Error, { id: this.id });
      this.state.mood = 'error';
      this.emitUpdate();
    }
  }

  /**
   * Update summary for clean worktree (show last commit).
   * This bypasses the AI generation and isGeneratingSummary lock.
   */
  private async updateCleanSummary(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Use simple-git to get last commit message
      const simpleGit = (await import('simple-git')).default;
      const git = simpleGit(this.path);

      try {
        const log = await git.log({ maxCount: 1 });
        const lastCommitMsg = log.latest?.message ?? '';

        if (lastCommitMsg) {
          const firstLine = lastCommitMsg.split('\n')[0].trim();
          this.state.summary = `✅ ${firstLine}`;
          this.state.modifiedCount = 0;
          this.emitUpdate();
          return;
        }
      } catch (e) {
        // Git log failed (empty repo?)
      }

      // Edge case: no commits exist yet
      this.state.summary = this.branch ? `Clean: ${this.branch}` : 'No changes';
      this.state.modifiedCount = 0;
      this.emitUpdate();
    } catch (error) {
      logError('Failed to fetch clean summary', error as Error, { id: this.id });
    }
  }

  /**
   * Update AI summary for this worktree.
   */
  private async updateAISummary(forceUpdate: boolean = false): Promise<void> {
    if (!this.isRunning || this.isGeneratingSummary) {
      return;
    }

    // Don't generate summary if we don't have changes data yet
    if (!this.state.worktreeChanges) {
      return;
    }

    const currentMtime = this.state.worktreeChanges.latestFileMtime ?? 0;
    const currentCount = this.state.worktreeChanges.changedFileCount;

    // Dedup logic: don't run AI on exact same state unless forced
    if (!forceUpdate &&
        this.lastProcessedMtime === currentMtime &&
        this.lastProcessedChangeCount === currentCount) {
      return;
    }

    // Throttle logic
    const now = Date.now();
    if (!forceUpdate && (now - this.lastAIRequestTime < AI_SUMMARY_MIN_INTERVAL_MS)) {
      return;
    }

    this.isGeneratingSummary = true;

    try {
      this.lastAIRequestTime = now;

      this.state.summaryLoading = true;
      this.setTrafficLight('yellow');
      this.emitUpdate();

      const result = await generateWorktreeSummary(
        this.path,
        this.branch,
        this.mainBranch,
        this.state.worktreeChanges
      );

      if (!this.isRunning) return;

      if (result) {
        this.state.summary = result.summary;
        this.state.modifiedCount = result.modifiedCount;

        // Only mark as processed AFTER successful generation
        // This allows retry if generation fails
        this.lastProcessedMtime = currentMtime;
        this.lastProcessedChangeCount = currentCount;
      }

      this.state.summaryLoading = false;
      this.emitUpdate();

    } catch (error) {
      logError('AI summary generation failed', error as Error, { id: this.id });
      this.state.summaryLoading = false;
      this.state.summary = 'Summary unavailable';
      this.emitUpdate();
    } finally {
      this.isGeneratingSummary = false;
    }
  }

  /**
   * Compare two change lists for equality.
   * Checks if both lists contain the same files with the same statuses.
   */
  private areChangeListsEqual(
    list1: Array<{ path: string; status: string }> | undefined,
    list2: Array<{ path: string; status: string }> | undefined
  ): boolean {
    if (!list1 || !list2) return list1 === list2;
    if (list1.length !== list2.length) return false;

    // Create a map of path -> status for quick lookup
    const map1 = new Map(list1.map(c => [c.path, c.status]));

    // Check if all entries in list2 match list1
    for (const change of list2) {
      if (map1.get(change.path) !== change.status) {
        return false;
      }
    }

    return true;
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
   * Green (0-30s) → Yellow (30-90s) → Gray (>90s)
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
      // Green → Yellow after 30s
      this.trafficLightTimer = setTimeout(() => {
        this.setTrafficLight('yellow');
        this.emitUpdate();
      }, TRAFFIC_LIGHT_GREEN_DURATION);
    } else if (color === 'yellow') {
      // Yellow → Gray after 60s more (90s total)
      this.trafficLightTimer = setTimeout(() => {
        this.setTrafficLight('gray');
        this.state.isActive = false;
        this.emitUpdate();
      }, TRAFFIC_LIGHT_YELLOW_DURATION);
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
    const state = this.getState();
    this.emit('update', state);
    events.emit('sys:worktree:update', state);
  }
}
