import type { WorktreeMood } from '../types/index.js';

const BORDER_COLORS: Record<WorktreeMood, string> = {
  stable: 'green',
  active: 'yellow',
  error: 'red',
  stale: 'gray',
};

/**
 * Map a worktree mood to a border color string for Ink components.
 */
export function getBorderColorForMood(mood: WorktreeMood): string {
  return BORDER_COLORS[mood];
}
