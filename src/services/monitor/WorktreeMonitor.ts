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
  private lastEmittedState: {
    summary?: string;
    modifiedCount?: number;
    trafficLight?: 'green' | 'yellow' | 'gray';
    mood?: WorktreeMood;
  } | null = null;

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
   *
   * NOTE: Polling is now managed centrally by WorktreeService to prevent
   * parallel git processes. The monitor only handles initial fetch and
   * responds to service-initiated polls.
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logWarn('WorktreeMonitor already running', { id: this.id });
      return;
    }

    this.isRunning = true;
    logInfo('Starting WorktreeMonitor (service-managed polling)', { id: this.id, path: this.path });

    // Perform initial fetch immediately
    // This will trigger summary generation via updateGitStatus
    await this.updateGitStatus(true);

    // NOTE: We no longer start our own polling timer here.
    // WorktreeService manages all polling through its serial queue.
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
   *
   * NOTE: This method no longer starts internal polling timers. Polling is
   * managed centrally by WorktreeService to prevent parallel git processes.
   * The interval value is stored but only used by WorktreeService for scheduling.
   */
  public setPollingInterval(ms: number): void {
    if (this.pollingInterval === ms) {
      return;
    }

    this.pollingInterval = ms;
    // NOTE: We intentionally do NOT restart polling here.
    // WorktreeService manages all polling through its serial queue.
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
   * Public method for WorktreeService to trigger a git status update.
   * This allows the service to manage polling timing centrally.
   */
  public async updateGitStatusFromService(): Promise<void> {
    await this.updateGitStatus(false);
  }

  /**
   * Update git status for this worktree using hash-based change detection.
   * This replaces the file watcher approach with a simpler polling model where
   * git itself is the source of truth for what changed.
   */
  private async updateGitStatus(forceRefresh: boolean = false): Promise<void> {
    // Prevent overlapping updates
    if (!this.isRunning || this.isUpdating) {
      return;
    }

    this.isUpdating = true; // Lock

    try {
      if (forceRefresh) {
        invalidateGitStatusCache(this.path);
      }

      const newChanges = await getWorktreeChangesWithStats(this.path, forceRefresh);

      // Check if monitor was stopped while waiting for git status
      if (!this.isRunning) {
        return;
      }

      // HASH-BASED CHANGE DETECTION
      // Calculate stable hash of the current git state
      const currentHash = this.calculateStateHash(newChanges);

      // Check if the git state actually changed
      const stateChanged = currentHash !== this.previousStateHash;

      if (!stateChanged && !forceRefresh) {
        return; // No changes detected, skip update
      }

      // Store previous state before updating
      const prevChanges = this.state.worktreeChanges;

      // Update state
      this.state.worktreeChanges = newChanges;
      this.state.changes = newChanges.changes;
      this.state.modifiedCount = newChanges.changedFileCount;

      // TRAFFIC LIGHT ACTIVATION
      // If hash changed (and not first load), something happened - activate traffic light
      if (stateChanged && this.previousStateHash !== '') {
        // Update timestamp and set green (even if reverting to clean)
        // Reverting IS activity - the user/agent did work
        this.state.lastActivityTimestamp = Date.now();
        this.state.isActive = true;
        this.setTrafficLight('green');

        // Emit file activity events for UI (replaces watcher events)
        this.emitFileActivityEvents(newChanges, prevChanges);
      }

      // Update the hash for next comparison
      const isInitialLoad = this.previousStateHash === '';
      this.previousStateHash = currentHash;

      // CENTRAL SUMMARY UPDATE - only place that decides when to generate
      const wasClean = prevChanges ? prevChanges.changedFileCount === 0 : true;
      const isNowClean = newChanges.changedFileCount === 0;

      // Cancel any pending buffer if transitioning to clean
      if (isNowClean && this.aiUpdateTimer) {
        clearTimeout(this.aiUpdateTimer);
        this.aiUpdateTimer = null;
        this.lastSummarizedHash = null;
      }

      // Handle summary update through central method
      await this.handleSummaryUpdate(isNowClean, wasClean, isInitialLoad);

      // Update mood based on changes
      await this.updateMood();

      // If clean, ensure traffic light goes gray (overrides green from above)
      // This handles the case where we reverted all changes
      if (isNowClean && stateChanged) {
        this.setTrafficLight('gray');
        this.state.isActive = false;
      }

      this.emitUpdate();
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
   * CENTRAL SUMMARY UPDATE LOGIC
   * This is the ONLY method that decides when to generate AI summaries.
   * All other code paths must call this method.
   *
   * @param isClean - Whether worktree is clean (no changes)
   * @param wasClean - Whether worktree was clean before this update
   * @param isInitialLoad - Whether this is the first load (previousStateHash === '')
   */
  private async handleSummaryUpdate(
    isClean: boolean,
    wasClean: boolean,
    isInitialLoad: boolean
  ): Promise<void> {
    logDebug('handleSummaryUpdate called', {
      id: this.id,
      isClean,
      wasClean,
      isInitialLoad,
      hasGeneratedInitialSummary: this.hasGeneratedInitialSummary
    });

    if (isClean) {
      // Clean state: Always show last commit immediately
      await this.setLastCommitAsSummary(false);
      return;
    }

    // Dirty state: Always show last commit as fallback immediately
    await this.setLastCommitAsSummary(false);

    // Decide when to generate AI summary
    const isFirstDirty = isInitialLoad || wasClean;

    if (isFirstDirty) {
      // Guard: If this is the initial load and we've already triggered generation,
      // stop here to prevent duplicate AI calls/updates.
      if (isInitialLoad && this.hasGeneratedInitialSummary) {
        logDebug('Skipping duplicate AI generation (initial load guard)', { id: this.id });
        return;
      }

      // First time becoming dirty: Generate AI asynchronously
      // Set flag BEFORE starting to prevent race condition with polling timer
      this.hasGeneratedInitialSummary = true;
      logDebug('Triggering AI summary generation', { id: this.id, isInitialLoad });

      // Fire and forget - AI will emit when ready (or fail gracefully if offline)
      void this.updateAISummary();
    } else {
      // Subsequent change while already dirty: Use 14s buffer
      logDebug('Scheduling AI summary (14s buffer)', { id: this.id });
      this.scheduleAISummary();
    }
  }

  /**
   * Set summary to last commit message (fallback).
   * Does not trigger loading states or AI generation.
   * If no commits exist, shows friendly "ready to start" message.
   *
   * @param emit - Whether to emit update after setting summary (default: true)
   */
  private async setLastCommitAsSummary(emit: boolean = true): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      const simpleGit = (await import('simple-git')).default;
      const git = simpleGit(this.path);

      const log = await git.log({ maxCount: 1 });
      const lastCommitMsg = log.latest?.message ?? '';

      if (lastCommitMsg) {
        const firstLine = lastCommitMsg.split('\n')[0].trim();
        this.state.summary = `✅ ${firstLine}`;
      } else {
        // No commits yet - friendly welcome message
        this.state.summary = '🌱 Ready to get started';
      }

      this.state.summaryLoading = false;
      if (emit) {
        this.emitUpdate();
      }
    } catch (error) {
      logError('Failed to set last commit summary', error as Error, { id: this.id });
      // On error, show friendly message
      this.state.summary = '🌱 Ready to get started';
      this.state.summaryLoading = false;
      if (emit) {
        this.emitUpdate();
      }
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
   * Update AI summary for this worktree.
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
   * Check if the current state differs meaningfully from the last emitted state.
   * This prevents unnecessary re-renders when only non-visible data changed.
   *
   * Only emit if user-visible fields changed:
   * - summary
   * - modifiedCount
   * - trafficLight
   * - mood
   */
  private shouldEmitUpdate(): boolean {
    const current = this.state;

    // Always emit on first update
    if (!this.lastEmittedState) {
      return true;
    }

    const prev = this.lastEmittedState;

    // Check user-visible fields only
    return (
      prev.summary !== current.summary ||
      prev.modifiedCount !== current.modifiedCount ||
      prev.trafficLight !== current.trafficLight ||
      prev.mood !== current.mood
    );
  }

  /**
   * Emit state update event only if something user-visible changed.
   * This is a key performance optimization that prevents cascade re-renders.
   */
  private emitUpdate(): void {
    if (!this.shouldEmitUpdate()) {
      logDebug('Skipping emit (no visible changes)', { id: this.id });
      return;
    }

    const state = this.getState();

    // Update last emitted state for next comparison
    this.lastEmittedState = {
      summary: state.summary,
      modifiedCount: state.modifiedCount,
      trafficLight: state.trafficLight,
      mood: state.mood,
    };

    logDebug('emitUpdate called', {
      id: this.id,
      summary: state.summary?.substring(0, 50) + '...',
      modifiedCount: state.modifiedCount,
      mood: state.mood,
    });
    this.emit('update', state);
    events.emit('sys:worktree:update', state);
  }

  /**
   * Force emit an update regardless of change detection.
   * Used for initial load and forced refreshes.
   */
  private forceEmitUpdate(): void {
    const state = this.getState();

    // Update last emitted state
    this.lastEmittedState = {
      summary: state.summary,
      modifiedCount: state.modifiedCount,
      trafficLight: state.trafficLight,
      mood: state.mood,
    };

    logDebug('forceEmitUpdate called', {
      id: this.id,
      summary: state.summary?.substring(0, 50) + '...',
      modifiedCount: state.modifiedCount,
      mood: state.mood,
    });
    this.emit('update', state);
    events.emit('sys:worktree:update', state);
  }
}
