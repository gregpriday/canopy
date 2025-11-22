import type { GitStatus } from '../types/index.js';

export type RepositoryMood =
  | 'clean'       // No changes
  | 'additions'   // Only new files
  | 'modifications' // Modified files present
  | 'mixed'       // Mix of additions and modifications
  | 'deletions'   // Any deleted files present
  | 'conflict';   // Git conflicts or errors (future)

export interface MoodGradient {
  start: string;
  end: string;
  mood: RepositoryMood;
}

/**
 * Analyze git status map to determine repository "mood"
 */
export function analyzeRepositoryMood(gitStatus: Map<string, GitStatus>): RepositoryMood {
  if (gitStatus.size === 0) {
    return 'clean';
  }

  const statuses = Array.from(gitStatus.values());

  // Check for deletions first (highest priority)
  const hasDeletions = statuses.some(s => s === 'deleted');
  if (hasDeletions) {
    return 'deletions';
  }

  // Check for mix of modifications and additions
  const hasModified = statuses.some(s => s === 'modified');
  const hasAdded = statuses.some(s => s === 'added' || s === 'untracked');

  if (hasModified && hasAdded) {
    return 'mixed';
  }

  if (hasModified) {
    return 'modifications';
  }

  if (hasAdded) {
    return 'additions';
  }

  // Fallback (ignored files only, treat as clean)
  return 'clean';
}

/**
 * Get gradient colors for repository mood
 * Uses semantic color theory:
 * - Cool colors (blue/teal) = calm/stable/clean
 * - Warm colors (yellow/orange) = activity/attention
 * - Green = growth/additions
 * - Red/magenta = caution/deletions
 */
export function getMoodGradient(mood: RepositoryMood): MoodGradient {
  const gradients: Record<RepositoryMood, MoodGradient> = {
    clean: {
      mood: 'clean',
      start: '#00CED1',  // Dark Turquoise
      end: '#4169E1',    // Royal Blue
    },
    additions: {
      mood: 'additions',
      start: '#00FA9A',  // Medium Spring Green
      end: '#20B2AA',    // Light Sea Green
    },
    modifications: {
      mood: 'modifications',
      start: '#FFD700',  // Gold
      end: '#FFA500',    // Orange
    },
    mixed: {
      mood: 'mixed',
      start: '#FF8C00',  // Dark Orange
      end: '#FF6347',    // Tomato
    },
    deletions: {
      mood: 'deletions',
      start: '#FF1493',  // Deep Pink
      end: '#DC143C',    // Crimson
    },
    conflict: {
      mood: 'conflict',
      start: '#FF0000',  // Pure Red
      end: '#8B0000',    // Dark Red
    },
  };

  return gradients[mood];
}

/**
 * Get mood-based gradient or fall back to project identity colors
 */
export function getHeaderGradient(
  gitStatus: Map<string, GitStatus>,
  projectIdentityGradient: { start: string; end: string },
  useMoodGradients: boolean
): { start: string; end: string } {
  if (!useMoodGradients) {
    return projectIdentityGradient;
  }

  const mood = analyzeRepositoryMood(gitStatus);
  const moodGradient = getMoodGradient(mood);

  return {
    start: moodGradient.start,
    end: moodGradient.end,
  };
}
