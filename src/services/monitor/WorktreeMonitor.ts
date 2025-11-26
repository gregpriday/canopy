import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { readFile, access } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { join as pathJoin } from 'path';
import type { Worktree, WorktreeChanges, WorktreeMood, AISummaryStatus } from '../../types/index.js';
import { DEFAULT_CONFIG } from '../../types/index.js';
import { getWorktreeChangesWithStats, invalidateGitStatusCache } from '../../utils/git.js';
import { WorktreeRemovedError } from '../../utils/errorTypes.js';
import { generateWorktreeSummary } from '../ai/worktree.js';
import { getAIClient } from '../ai/client.js';
import { categorizeWorktree } from '../../utils/worktreeMood.js';
import { logWarn, logError, logInfo, logDebug } from '../../utils/logger.js';
import { events } from '../events.js';

// Default AI debounce (used when config is not provided)
const DEFAULT_AI_DEBOUNCE_MS = DEFAULT_CONFIG.ai?.summaryDebounceMs ?? 10000;

/**
 * Represents the complete state of a monitored worktree.
 * This is what gets emitted on every update.
 */
export interface WorktreeState extends Worktree {
  worktreeId: string;
  // Full worktree changes (includes all file details)
  worktreeChanges: WorktreeChanges | null;

  // Activity tracking (used by ActivityTrafficLight for smooth color transitions)
  lastActivityTimestamp: number | null;

  // AI summary status (active, loading, disabled, error)
  aiStatus: AISummaryStatus;

  // Content from .canopy_note.txt file (for AI agent status)
  aiNote?: string;
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
  private pollingTimer: NodeJS.Timeout | null = null;
  private aiUpdateTimer: NodeJS.Timeout | null = null;

  // Configuration
  private pollingInterval: number = 2000; // Default 2s for active worktree
  private aiBufferDelay: number = DEFAULT_AI_DEBOUNCE_MS; // Configurable AI debounce
  private noteEnabled: boolean = DEFAULT_CONFIG.note?.enabled ?? true;
  private noteFilename: string = DEFAULT_CONFIG.note?.filename ?? '.canopy_note.txt';

  // Flags
  private isRunning: boolean = false;
  private isUpdating: boolean = false;
  private isGeneratingSummary: boolean = false;
  private hasGeneratedInitialSummary: boolean = false;
  private pollingEnabled: boolean = false; // Tracks if polling should be active (false when --no-watch)

  constructor(worktree: Worktree, mainBranch: string = 'main') {
    super();

    this.id = worktree.id;
    this.path = worktree.path;
    this.name = worktree.name;
    this.branch = worktree.branch;
    this.isCurrent = worktree.isCurrent;
    this.mainBranch = mainBranch;

    // Initialize state - determine initial AI status based on API key availability
    const initialAIStatus: AISummaryStatus = getAIClient() ? 'active' : 'disabled';

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
      lastActivityTimestamp: null,
      aiStatus: initialAIStatus,
      aiNote: undefined,
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
    this.pollingEnabled = true; // Enable polling for normal start
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
   * Fetch initial status without starting polling.
   * Used when --no-watch flag is passed to provide a static snapshot.
   * Manual refresh (pressing 'r') will still work via the refresh() method.
   */
  public async fetchInitialStatus(): Promise<void> {
    logInfo('Fetching initial status (no polling)', { id: this.id, path: this.path });

    // Mark as running to allow updateGitStatus to proceed
    // but we won't start the polling timer
    this.isRunning = true;
    this.pollingEnabled = false; // Explicitly disable polling for --no-watch mode

    // Perform initial fetch
    await this.updateGitStatus(true);

    // Note: We DON'T call startPolling() here
    // The monitor remains "running" so refresh() works, but no automatic polling
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

    // Restart polling with new interval if currently running AND polling is enabled
    // When --no-watch is used, pollingEnabled is false so we don't restart polling
    if (this.isRunning && this.pollingEnabled) {
      this.stopPolling();
      this.startPolling();
    }
  }

  /**
   * Set the AI buffer delay for summary generation.
   * Used by WorktreeService to apply user-configured debounce settings.
   * Cancels any pending AI timer so the new delay takes effect immediately.
   */
  public setAIBufferDelay(ms: number): void {
    if (this.aiBufferDelay === ms) {
      return;
    }

    this.aiBufferDelay = ms;

    // Cancel any pending AI timer so the new delay takes effect immediately
    // The next scheduleAISummary() call will use the updated delay
    if (this.aiUpdateTimer) {
      clearTimeout(this.aiUpdateTimer);
      this.aiUpdateTimer = null;
      // Reschedule with new delay if there was a pending timer
      this.scheduleAISummary();
    }
  }

  /**
   * Configure the AI note feature.
   * @param enabled - Whether to poll for note file
   * @param filename - Override the default filename
   */
  public setNoteConfig(enabled: boolean, filename?: string): void {
    this.noteEnabled = enabled;
    if (filename !== undefined) {
      this.noteFilename = filename;
    }
  }

  /**
   * Update metadata (branch, name) from a refreshed worktree object.
   * This is called by WorktreeService.sync() when worktree metadata changes
   * (e.g., after a `git checkout` or `git switch` in the worktree).
   *
   * Only updates the mutable state object, not the readonly instance properties.
   * Emits an update event if metadata actually changed.
   *
   * @param worktree - Updated worktree data from git worktree list
   */
  public updateMetadata(worktree: Worktree): void {
    const branchChanged = this.state.branch !== worktree.branch;
    const nameChanged = this.state.name !== worktree.name;

    if (branchChanged || nameChanged) {
      // Capture old values from state before updating
      const oldBranch = this.state.branch;
      const oldName = this.state.name;

      this.state.branch = worktree.branch;
      this.state.name = worktree.name;
      logInfo('WorktreeMonitor metadata updated', {
        id: this.id,
        oldBranch,
        newBranch: worktree.branch,
        oldName,
        newName: worktree.name,
      });
      this.emitUpdate();
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
      let nextLastActivityTimestamp = this.state.lastActivityTimestamp;

      // Update activity timestamp when changes are detected
      // (ActivityTrafficLight component uses this for smooth color transitions)
      if (stateChanged && !isInitialLoad) {
        nextLastActivityTimestamp = Date.now();

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
      // PHASE 5.5: READ AI NOTE FILE
      // Polled at same interval as git status
      // ============================================
      const nextAiNote = await this.readNoteFile();

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
        lastActivityTimestamp: nextLastActivityTimestamp,
        mood: nextMood,
        aiNote: nextAiNote,
      };

      // ============================================
      // PHASE 7: SINGLE EMISSION
      // ============================================
      this.emitUpdate();

      // ============================================
      // PHASE 8: POST-EMIT ASYNC WORK
      // AI summary is fire-and-forget with its own emission
      // ============================================
      if (shouldTriggerAI) {
        void this.triggerAISummary();
      } else if (shouldScheduleAI) {
        this.scheduleAISummary();
      }

    } catch (error) {
      // FIX: Handle worktree directory access errors resiliently
      // Instead of stopping the monitor (which creates a "zombie" state where the UI
      // removes the card but the service thinks the monitor is still valid), we set
      // the mood to 'error' and keep the monitor running. This allows:
      // 1. Recovery if the filesystem error was transient (e.g., ENOENT during heavy IO)
      // 2. The worktree card to remain visible (with error indicator)
      // 3. The useAppLifecycle hook to detect actual worktree removal via `git worktree list`
      //    and properly clean up through WorktreeService.sync()
      if (error instanceof WorktreeRemovedError) {
        logWarn('Worktree directory not accessible (transient or deleted)', { id: this.id, path: this.path });

        this.state = {
          ...this.state,
          mood: 'error',
          summary: '⚠️ Directory not accessible',
          summaryLoading: false,
        };

        this.emitUpdate();
        // Do NOT call this.stop()
        // Do NOT emit sys:worktree:remove
        // Let polling continue - if directory returns, we recover automatically.
        // If it's truly gone, useAppLifecycle will detect it via git worktree list
        // and call WorktreeService.sync(), which stops us properly.
        return;
      }

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
   * Read the AI note file content.
   * Returns undefined if the file doesn't exist or is empty.
   * Content is truncated to 500 chars and only the last line is returned.
   */
  private async readNoteFile(): Promise<string | undefined> {
    if (!this.noteEnabled) {
      return undefined;
    }

    const notePath = pathJoin(this.path, this.noteFilename);

    try {
      // Check if file exists first
      await access(notePath, fsConstants.R_OK);

      // Read file content
      const content = await readFile(notePath, 'utf-8');
      const trimmed = content.trim();

      // Treat empty file as non-existent
      if (!trimmed) {
        return undefined;
      }

      // Get last line only and truncate to 500 chars
      const lines = trimmed.split('\n');
      const lastLine = lines[lines.length - 1].trim();
      if (lastLine.length > 500) {
        return lastLine.slice(0, 497) + '...';
      }
      return lastLine;
    } catch (error) {
      // File doesn't exist or permission error - treat as non-existent
      // Only log if it's not a simple ENOENT (file not found)
      const code = (error as NodeJS.ErrnoException).code;
      if (code && code !== 'ENOENT') {
        logWarn('Failed to read AI note file', { id: this.id, error: (error as Error).message });
      }
      return undefined;
    }
  }

  /**
   * Schedule AI summary generation with a configurable buffer.
   * Ignores calls if a timer is already active.
   */
  private scheduleAISummary(): void {
    if (this.aiUpdateTimer) {
      return; // Already buffered
    }

    this.aiUpdateTimer = setTimeout(() => {
      this.aiUpdateTimer = null;
      void this.updateAISummary();
    }, this.aiBufferDelay);
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
   * Tracks aiStatus throughout the lifecycle:
   * - 'loading' while generating
   * - 'active' on success
   * - 'disabled' if no API key
   * - 'error' on failure
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

    // Check if AI is available before proceeding
    if (!getAIClient()) {
      this.state.aiStatus = 'disabled';
      this.state.summaryLoading = false;
      logDebug('Skipping AI summary (no API key)', { id: this.id });
      this.emitUpdate();
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
    this.state.aiStatus = 'loading';
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
        this.state.aiStatus = 'active';

        // Mark as processed
        this.lastSummarizedHash = currentHash;
        this.emitUpdate();
      } else {
        // generateWorktreeSummary returns null when AI client is unavailable
        this.state.aiStatus = 'disabled';
        this.emitUpdate();
      }

      // Ensure loading flag is off (defensive cleanup)
      this.state.summaryLoading = false;

    } catch (error) {
      logError('AI summary generation failed', error as Error, { id: this.id });
      this.state.summaryLoading = false;
      this.state.aiStatus = 'error';
      this.emitUpdate();
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
