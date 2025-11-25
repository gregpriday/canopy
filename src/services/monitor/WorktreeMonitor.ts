import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import type { Worktree, WorktreeChanges, WorktreeMood } from '../../types/index.js';
import { getWorktreeChangesWithStats, invalidateGitStatusCache } from '../../utils/git.js';
import { generateWorktreeSummary } from '../ai/worktree.js';
import { categorizeWorktree } from '../../utils/worktreeMood.js';
import { logWarn, logError, logInfo } from '../../utils/logger.js';
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
  private isGeneratingSummary: boolean = false;

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

    // Start polling timer
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
        // Dirty worktrees: Schedule buffer to prevent API burst on startup
        this.scheduleAISummary();
      }
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
   * This replaces the file watcher approach with a simpler polling model where
   * git itself is the source of truth for what changed.
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
      this.previousStateHash = currentHash;

      // Handle clean/dirty transitions
      const wasClean = prevChanges ? prevChanges.changedFileCount === 0 : false;
      const isNowClean = newChanges.changedFileCount === 0;

      if (!wasClean && isNowClean) {
        // Transitioned to clean: Cancel buffer and update immediately
        if (this.aiUpdateTimer) {
          clearTimeout(this.aiUpdateTimer);
          this.aiUpdateTimer = null;
        }
        // Clear AI hash so next dirty state forces regeneration
        this.lastSummarizedHash = null;
        await this.updateCleanSummary();
      } else if (newChanges.changedFileCount > 0 && stateChanged) {
        // Dirty and state changed
        // If we just became dirty from clean, show loading indicator immediately
        if (wasClean) {
          this.state.summaryLoading = true;
        }
        // Schedule AI summary (buffered)
        this.scheduleAISummary();
      }

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
          this.state.summaryLoading = false;
          this.emitUpdate();
          return;
        }
      } catch (e) {
        // Git log failed (empty repo?)
      }

      // Edge case: no commits exist yet
      this.state.summary = this.branch ? `Clean: ${this.branch}` : 'No changes';
      this.state.modifiedCount = 0;
      this.state.summaryLoading = false;
      this.emitUpdate();
    } catch (error) {
      logError('Failed to fetch clean summary', error as Error, { id: this.id });
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
    if (!this.isRunning || this.isGeneratingSummary) {
      return;
    }

    // Don't generate summary if we don't have changes data yet
    if (!this.state.worktreeChanges) {
      return;
    }

    const currentHash = this.calculateStateHash(this.state.worktreeChanges);

    // Dedup logic: don't run AI on exact same state unless forced
    if (!forceUpdate && this.lastSummarizedHash === currentHash) {
      this.state.summaryLoading = false;
      this.emitUpdate();
      return;
    }

    this.isGeneratingSummary = true;

    try {
      this.state.summaryLoading = true;
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

        // Mark as processed
        this.lastSummarizedHash = currentHash;
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
