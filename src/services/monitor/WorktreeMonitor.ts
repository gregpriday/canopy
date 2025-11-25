import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import type { Worktree, WorktreeChanges, WorktreeMood } from '../../types/index.js';
import { getWorktreeChangesWithStats, invalidateGitStatusCache } from '../../utils/git.js';
import { generateWorktreeSummary } from '../ai/worktree.js';
import { categorizeWorktree } from '../../utils/worktreeMood.js';
import { logWarn, logError, logInfo, logDebug } from '../../utils/logger.js';
import { events } from '../events.js';

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
  private mainBranch: string;

  // Hash-based change detection
  private previousStateHash: string = '';
  private lastSummarizedHash: string | null = null;

  // Timers
  private trafficLightTimer: NodeJS.Timeout | null = null;
  private pollingTimer: NodeJS.Timeout | null = null;
  private aiUpdateTimer: NodeJS.Timeout | null = null;

  // Configuration
  private pollingInterval: number = 2000; // Default 2s for active worktree
  private readonly AI_BUFFER_DELAY = 14000; // 14 seconds (7 cycles * 2s)

  // Flags
  private isRunning: boolean = false;
  private isUpdating: boolean = false;
  private isGeneratingSummary: boolean = false;
  private hasGeneratedInitialSummary: boolean = false;

  constructor(worktree: Worktree, mainBranch: string = 'main') {
    super();

    this.id = worktree.id;
    this.path = worktree.path;
    this.name = worktree.name;
    this.branch = worktree.branch;
    this.isCurrent = worktree.isCurrent;
    this.mainBranch = mainBranch;

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
  }

  /**
   * Start monitoring this worktree.
   * Uses git polling (no file watcher) with hash-based change detection.
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logWarn('WorktreeMonitor already running', { id: this.id });
      return;
    }

    this.isRunning = true;
    logInfo('Starting WorktreeMonitor (polling-based)', { id: this.id, path: this.path });

    // 1. Perform initial fetch immediately
    // This will trigger summary generation via updateGitStatus
    await this.updateGitStatus(true);

    // 2. Start polling timer ONLY after initial fetch completes
    // Check isRunning in case stop() was called during the await above
    if (this.isRunning) {
      this.startPolling();
    }
  }

  /**
   * Stop monitoring this worktree.
   * Cleans up timers and event listeners.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logInfo('Stopping WorktreeMonitor', { id: this.id });

    // Clear timers
    this.stopPolling();

    if (this.trafficLightTimer) {
      clearTimeout(this.trafficLightTimer);
      this.trafficLightTimer = null;
    }

    if (this.aiUpdateTimer) {
      clearTimeout(this.aiUpdateTimer);
      this.aiUpdateTimer = null;
    }

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
      // Bypass buffer for forced refresh
      await this.updateAISummary(true);
    }
  }

  /**
   * Calculate a stable hash of the current git state.
   * This hash represents the exact state of all tracked files and their changes.
   *
   * @param changes - Current worktree changes from git
   * @returns MD5 hash of the changes
   */
  private calculateStateHash(changes: WorktreeChanges): string {
    // Create a lightweight signature: Path + Status + Insertions + Deletions
    // Sort by path to ensure order doesn't affect hash
    const signature = changes.changes
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(f => `${f.path}:${f.status}:${f.insertions || 0}:${f.deletions || 0}`)
      .join('|');

    return createHash('md5').update(signature).digest('hex');
  }

  /**
   * Emit file activity events to replace watcher events.
   * This maintains UI compatibility with useActivity.ts and other components
   * that expect real-time file change notifications.
   *
   * @param newState - New worktree changes
   * @param oldState - Previous worktree changes (nullable)
   */
  private emitFileActivityEvents(newState: WorktreeChanges, oldState: WorktreeChanges | null): void {
    if (!oldState) {
      // First load - emit all changed files
      for (const change of newState.changes.slice(0, 50)) { // Limit to 50 for performance
        events.emit('watcher:change', {
          type: change.status === 'added' ? 'add' : 'change',
          path: change.path
        });
      }
      return;
    }

    // Compare old vs new to find what changed
    const oldPaths = new Set(oldState.changes.map(c => c.path));
    const newPaths = new Set(newState.changes.map(c => c.path));

    // Find added/modified files
    let emittedCount = 0;
    const MAX_EVENTS = 50;

    for (const change of newState.changes) {
      if (emittedCount >= MAX_EVENTS) break;

      const wasTracked = oldPaths.has(change.path);
      if (!wasTracked || this.hasFileChanged(change, oldState)) {
        events.emit('watcher:change', {
          type: wasTracked ? 'change' : 'add',
          path: change.path
        });
        emittedCount++;
      }
    }

    // Find deleted files
    for (const oldChange of oldState.changes) {
      if (emittedCount >= MAX_EVENTS) break;

      if (!newPaths.has(oldChange.path)) {
        events.emit('watcher:change', {
          type: 'unlink',
          path: oldChange.path
        });
        emittedCount++;
      }
    }
  }

  /**
   * Check if a file has changed between states.
   */
  private hasFileChanged(newFile: {path: string; status: string; insertions?: number | null; deletions?: number | null}, oldState: WorktreeChanges): boolean {
    const oldFile = oldState.changes.find(c => c.path === newFile.path);
    if (!oldFile) return true;

    return oldFile.status !== newFile.status ||
           (oldFile.insertions ?? 0) !== (newFile.insertions ?? 0) ||
           (oldFile.deletions ?? 0) !== (newFile.deletions ?? 0);
  }

  /**
   * Update git status for this worktree using hash-based change detection.
   * Uses atomic state updates to prevent UI flickering.
   *
   * ATOMIC UPDATE PATTERN (Fetch-Then-Commit):
   * 1. Fetch Phase: Get git status
   * 2. Logic Phase: Determine next state values (draft variables)
   * 3. Fetch Phase: If clean, fetch git log synchronously before updating state
   * 4. Commit Phase: Update entire state object at once
   * 5. Emit Phase: Single event emission
   */
  private async updateGitStatus(forceRefresh: boolean = false): Promise<void> {
    // Prevent overlapping updates
    if (!this.isRunning || this.isUpdating) {
      return;
    }

    this.isUpdating = true; // Lock

    try {
      // ============================================
      // PHASE 1: FETCH GIT STATUS
      // ============================================
      if (forceRefresh) {
        invalidateGitStatusCache(this.path);
      }

      const newChanges = await getWorktreeChangesWithStats(this.path, forceRefresh);

      // Check if monitor was stopped while waiting for git status
      if (!this.isRunning) {
        return;
      }

      // ============================================
      // PHASE 2: DETECT CHANGES (Hash Check)
      // ============================================
      const currentHash = this.calculateStateHash(newChanges);
      const stateChanged = currentHash !== this.previousStateHash;

      // Optimization: Skip if nothing changed and not forced
      if (!stateChanged && !forceRefresh) {
        return;
      }

      // Store previous state for comparison
      const prevChanges = this.state.worktreeChanges;
      const isInitialLoad = this.previousStateHash === '';
      const wasClean = prevChanges ? prevChanges.changedFileCount === 0 : true;
      const isNowClean = newChanges.changedFileCount === 0;

      // ============================================
      // PHASE 3: PREPARE DRAFT STATE VALUES
      // All state changes are drafted here before committing
      // ============================================
      let nextSummary = this.state.summary;
      let nextSummaryLoading = this.state.summaryLoading;
      let nextTrafficLight = this.state.trafficLight;
      let nextIsActive = this.state.isActive;
      let nextLastActivityTimestamp = this.state.lastActivityTimestamp;
      let shouldStartTrafficLightTimer = false;

      // Handle activity (traffic light) - draft values only, timer started later
      if (stateChanged && !isInitialLoad) {
        nextLastActivityTimestamp = Date.now();
        nextIsActive = true;
        nextTrafficLight = 'green';
        shouldStartTrafficLightTimer = true;

        // Emit file activity events for UI (replaces watcher events)
        this.emitFileActivityEvents(newChanges, prevChanges);
      }

      // ============================================
      // PHASE 4: HANDLE SUMMARY LOGIC (The Sync Fix)
      // Fetch last commit SYNCHRONOUSLY when clean so stats + summary update together
      // ============================================
      let shouldTriggerAI = false;
      let shouldScheduleAI = false;

      // Cancel any pending AI buffer if transitioning to clean
      if (isNowClean && this.aiUpdateTimer) {
        clearTimeout(this.aiUpdateTimer);
        this.aiUpdateTimer = null;
        this.lastSummarizedHash = null;
      }

      if (isNowClean) {
        // CLEAN STATE: Fetch commit message IMMEDIATELY so stats + summary update together
        nextSummary = await this.fetchLastCommitMessage();
        nextSummaryLoading = false;

        // If we just became clean, traffic light goes gray immediately
        // Also cancel the traffic light timer since we're settling to gray
        if (stateChanged && !isInitialLoad) {
          nextTrafficLight = 'gray';
          nextIsActive = false;
          shouldStartTrafficLightTimer = false; // Don't start timer for clean state
        }
      } else {
        // DIRTY STATE: Show last commit as fallback, then trigger AI if needed
        const isFirstDirty = isInitialLoad || wasClean;

        if (isFirstDirty) {
          // First time becoming dirty: Fetch last commit as placeholder, then trigger AI
          nextSummary = await this.fetchLastCommitMessage();
          nextSummaryLoading = false;

          // Guard: Prevent duplicate AI calls on initial load
          if (!(isInitialLoad && this.hasGeneratedInitialSummary)) {
            this.hasGeneratedInitialSummary = true;
            shouldTriggerAI = true;
            logDebug('Will trigger AI summary generation', { id: this.id, isInitialLoad });
          }
        } else {
          // Subsequent change while dirty: Schedule AI with buffer
          shouldScheduleAI = true;
          logDebug('Will schedule AI summary (14s buffer)', { id: this.id });
        }
      }

      // ============================================
      // PHASE 5: UPDATE MOOD
      // This is computed before the atomic commit
      // ============================================
      let nextMood = this.state.mood;
      try {
        nextMood = await categorizeWorktree(
          {
            id: this.id,
            path: this.path,
            name: this.name,
            branch: this.branch,
            isCurrent: this.isCurrent,
          },
          newChanges || undefined,
          this.mainBranch
        );
      } catch (error) {
        logWarn('Failed to categorize worktree mood', {
          id: this.id,
          message: (error as Error).message,
        });
        nextMood = 'error';
      }

      // ============================================
      // PHASE 6: ATOMIC COMMIT
      // Apply all state changes at once
      // ============================================
      this.previousStateHash = currentHash;
      this.state = {
        ...this.state,
        worktreeChanges: newChanges,
        changes: newChanges.changes,
        modifiedCount: newChanges.changedFileCount,
        summary: nextSummary,
        summaryLoading: nextSummaryLoading,
        trafficLight: nextTrafficLight,
        isActive: nextIsActive,
        lastActivityTimestamp: nextLastActivityTimestamp,
        mood: nextMood,
      };

      // ============================================
      // PHASE 7: SINGLE EMISSION
      // ============================================
      this.emitUpdate();

      // ============================================
      // PHASE 8: POST-EMIT ASYNC WORK
      // Start traffic light timer only if we're staying dirty (not transitioning to clean)
      // AI summary is fire-and-forget with its own emission
      // ============================================
      if (shouldStartTrafficLightTimer) {
        this.startTrafficLightTimer();
      }

      if (shouldTriggerAI) {
        void this.triggerAISummary();
      } else if (shouldScheduleAI) {
        this.scheduleAISummary();
      }

    } catch (error) {
      // Handle index.lock collision gracefully (don't set mood to error)
      const errorMessage = (error as Error).message || '';
      if (errorMessage.includes('index.lock')) {
        logWarn('Git index locked, skipping this poll cycle', { id: this.id });
        return; // Silent skip - wait for next poll
      }

      logError('Failed to update git status', error as Error, { id: this.id });
      this.state.mood = 'error';
      this.emitUpdate();
    } finally {
      this.isUpdating = false; // Unlock
    }
  }

  /**
   * CENTRAL SUMMARY UPDATE LOGIC (DEPRECATED)
   *
   * @deprecated This method is no longer used. Summary logic is now inlined
   * in updateGitStatus() for atomic state updates.
   *
   * The logic has been moved to Phase 4 of updateGitStatus() to ensure
   * stats and summary are updated atomically in the same render frame.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async _handleSummaryUpdate_deprecated(
    _isClean: boolean,
    _wasClean: boolean,
    _isInitialLoad: boolean
  ): Promise<void> {
    // This method is preserved for reference but no longer called.
    // See updateGitStatus() Phase 4 for the current implementation.
  }

  /**
   * Fetch the last commit message.
   * Returns the string directly, does not modify state.
   * This is the pure helper used by the atomic update cycle.
   */
  private async fetchLastCommitMessage(): Promise<string> {
    try {
      const simpleGit = (await import('simple-git')).default;
      const git = simpleGit(this.path);

      const log = await git.log({ maxCount: 1 });
      const lastCommitMsg = log.latest?.message ?? '';

      if (lastCommitMsg) {
        const firstLine = lastCommitMsg.split('\n')[0].trim();
        return `✅ ${firstLine}`;
      }
      return '🌱 Ready to get started';
    } catch (error) {
      logError('Failed to fetch last commit message', error as Error, { id: this.id });
      return '🌱 Ready to get started';
    }
  }

  /**
   * Set summary to last commit message (fallback).
   * Does not trigger loading states or AI generation.
   * If no commits exist, shows friendly "ready to start" message.
   *
   * @param emit - Whether to emit update after setting summary (default: true)
   * @deprecated Use fetchLastCommitMessage() in updateCycle() for atomic updates
   */
  private async setLastCommitAsSummary(emit: boolean = true): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const summary = await this.fetchLastCommitMessage();
    this.state.summary = summary;
    this.state.summaryLoading = false;

    if (emit) {
      this.emitUpdate();
    }
  }

  /**
   * Schedule AI summary generation with a fixed buffer.
   * Ignores calls if a timer is already active.
   */
  private scheduleAISummary(): void {
    if (this.aiUpdateTimer) {
      return; // Already buffered
    }

    this.aiUpdateTimer = setTimeout(() => {
      this.aiUpdateTimer = null;
      void this.updateAISummary();
    }, this.AI_BUFFER_DELAY);
  }

  /**
   * Trigger AI summary generation immediately (fire and forget).
   * This method updates state and emits its own update when AI completes.
   * Used by the atomic updateGitStatus() after the main state emission.
   */
  private async triggerAISummary(): Promise<void> {
    await this.updateAISummary();
  }

  /**
   * Update AI summary for this worktree.
   * Emits its own update when the summary is ready.
   */
  private async updateAISummary(forceUpdate: boolean = false): Promise<void> {
    logDebug('updateAISummary called', {
      id: this.id,
      isRunning: this.isRunning,
      isGeneratingSummary: this.isGeneratingSummary,
      forceUpdate
    });

    if (!this.isRunning || this.isGeneratingSummary) {
      logDebug('Skipping AI summary (not running or already generating)', { id: this.id });
      return;
    }

    // Don't generate summary if we don't have changes data yet
    if (!this.state.worktreeChanges) {
      logDebug('Skipping AI summary (no changes data)', { id: this.id });
      return;
    }

    const currentHash = this.calculateStateHash(this.state.worktreeChanges);

    // Dedup logic: don't run AI on exact same state unless forced
    if (!forceUpdate && this.lastSummarizedHash === currentHash) {
      logDebug('Skipping AI summary (same hash)', { id: this.id, currentHash });
      this.state.summaryLoading = false;
      this.emitUpdate();
      return;
    }

    this.isGeneratingSummary = true;
    logDebug('Starting AI summary generation', { id: this.id, currentHash });

    try {
      // Keep showing old summary while AI generates new one
      // No loading state - just swap when ready

      const result = await generateWorktreeSummary(
        this.path,
        this.branch,
        this.mainBranch,
        this.state.worktreeChanges
      );

      if (!this.isRunning) return;

      if (result) {
        logDebug('AI summary generated successfully', {
          id: this.id,
          summary: result.summary.substring(0, 50) + '...'
        });
        this.state.summary = result.summary;
        this.state.modifiedCount = result.modifiedCount;

        // Mark as processed
        this.lastSummarizedHash = currentHash;
        this.emitUpdate();
      }
      // If result is null, keep showing last commit (already set)

      // Ensure loading flag is off (defensive cleanup)
      this.state.summaryLoading = false;

    } catch (error) {
      logError('AI summary generation failed', error as Error, { id: this.id });
      this.state.summaryLoading = false;
      // Keep showing last commit on error (don't change summary)
    } finally {
      this.isGeneratingSummary = false;
      logDebug('AI summary generation complete', { id: this.id });
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
   * Start the traffic light timer for automatic green → yellow → gray transitions.
   * This method only starts/resets the timer, it doesn't set the traffic light color.
   * Used by atomic updateGitStatus() where color is set via draft variables.
   */
  private startTrafficLightTimer(): void {
    // Clear existing timer
    if (this.trafficLightTimer) {
      clearTimeout(this.trafficLightTimer);
      this.trafficLightTimer = null;
    }

    // Green → Yellow after 30s
    this.trafficLightTimer = setTimeout(() => {
      this.state.trafficLight = 'yellow';
      this.emitUpdate();

      // Yellow → Gray after 60s more (90s total)
      this.trafficLightTimer = setTimeout(() => {
        this.state.trafficLight = 'gray';
        this.state.isActive = false;
        this.emitUpdate();
      }, TRAFFIC_LIGHT_YELLOW_DURATION);
    }, TRAFFIC_LIGHT_GREEN_DURATION);
  }

  /**
   * Set traffic light state with automatic transitions.
   *
   * Green (0-30s) → Yellow (30-90s) → Gray (>90s)
   * @deprecated Use startTrafficLightTimer() with draft variables in updateGitStatus()
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
    logDebug('emitUpdate called', {
      id: this.id,
      summary: state.summary?.substring(0, 50) + '...',
      modifiedCount: state.modifiedCount,
      mood: state.mood,
      stack: new Error().stack?.split('\n').slice(2, 5).join(' <- ')
    });
    this.emit('update', state);
    events.emit('sys:worktree:update', state);
  }
}
