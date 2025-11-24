import type {
  Worktree,
  WorktreeChanges,
  FileChangeDetail,
  GitStatus,
  WorktreeMood,
} from '../../src/types/index.js';

/**
 * Factory for creating test worktrees with sensible defaults.
 * Allows easy customization for specific test scenarios.
 */
export const createMockWorktree = (overrides?: Partial<Worktree>): Worktree => ({
  id: 'test-wt-id',
  path: '/path/to/worktree',
  name: 'feature-branch',
  branch: 'feature-branch',
  isCurrent: false,
  summary: undefined,
  modifiedCount: 0,
  summaryLoading: false,
  mood: 'stable',
  trafficLight: 'gray',
  changes: [],
  ...overrides,
});

/**
 * Factory for creating clean worktrees (0 changed files).
 */
export const createCleanWorktree = (overrides?: Partial<Worktree>): Worktree =>
  createMockWorktree({
    summary: '✅ feat: previous commit message',
    modifiedCount: 0,
    mood: 'stable',
    trafficLight: 'gray',
    changes: [],
    ...overrides,
  });

/**
 * Factory for creating dirty worktrees (has changes).
 */
export const createDirtyWorktree = (
  fileCount: number = 3,
  overrides?: Partial<Worktree>
): Worktree =>
  createMockWorktree({
    summary: '🔧 Refactoring authentication middleware',
    modifiedCount: fileCount,
    mood: 'active',
    trafficLight: 'green',
    changes: Array.from({ length: fileCount }, (_, i) => ({
      path: `src/file${i}.ts`,
      status: 'modified' as GitStatus,
      insertions: 10 + i,
      deletions: 2 + i,
    })),
    ...overrides,
  });

/**
 * Factory for creating detached HEAD worktree.
 */
export const createDetachedWorktree = (overrides?: Partial<Worktree>): Worktree =>
  createMockWorktree({
    branch: undefined,
    name: 'abc1234',
    summary: '✅ Previous commit on detached HEAD',
    ...overrides,
  });

/**
 * Factory for creating worktree with loading state.
 */
export const createLoadingWorktree = (overrides?: Partial<Worktree>): Worktree =>
  createMockWorktree({
    summaryLoading: true,
    modifiedCount: 5,
    ...overrides,
  });

/**
 * Factory for creating WorktreeChanges with sensible defaults.
 */
export const createMockChanges = (
  files: Array<{
    path: string;
    status: GitStatus;
    insertions?: number;
    deletions?: number;
  }>,
  overrides?: Partial<WorktreeChanges>
): WorktreeChanges => {
  const changes: FileChangeDetail[] = files.map(f => ({
    path: f.path,
    status: f.status,
    insertions: f.insertions ?? null,
    deletions: f.deletions ?? null,
  }));

  const totalInsertions = changes.reduce((acc, c) => acc + (c.insertions ?? 0), 0);
  const totalDeletions = changes.reduce((acc, c) => acc + (c.deletions ?? 0), 0);

  return {
    worktreeId: 'test-wt-id',
    rootPath: '/path/to/worktree',
    changes,
    changedFileCount: files.length,
    totalInsertions,
    totalDeletions,
    insertions: totalInsertions,
    deletions: totalDeletions,
    latestFileMtime: Date.now(),
    lastUpdated: Date.now(),
    ...overrides,
  };
};

/**
 * Factory for creating empty/clean WorktreeChanges.
 */
export const createEmptyChanges = (overrides?: Partial<WorktreeChanges>): WorktreeChanges =>
  createMockChanges([], {
    changedFileCount: 0,
    totalInsertions: 0,
    totalDeletions: 0,
    latestFileMtime: 0,
    ...overrides,
  });

/**
 * Factory for creating a specific file change scenario.
 */
export const createFileChange = (
  path: string,
  status: GitStatus,
  insertions: number = 0,
  deletions: number = 0
): FileChangeDetail => ({
  path,
  status,
  insertions,
  deletions,
});

/**
 * Scenario: Multiple files sorted by priority.
 * Modified (high churn) > Modified (low churn) > Added > Deleted > Untracked
 */
export const createPrioritySortedChanges = (): WorktreeChanges =>
  createMockChanges([
    { path: 'z-untracked.ts', status: 'untracked', insertions: 0, deletions: 0 },
    { path: 'a-low-churn.ts', status: 'modified', insertions: 1, deletions: 1 },
    { path: 'b-high-churn.ts', status: 'modified', insertions: 100, deletions: 50 },
    { path: 'c-added.ts', status: 'added', insertions: 50, deletions: 0 },
    { path: 'd-deleted.ts', status: 'deleted', insertions: 0, deletions: 20 },
  ]);

/**
 * Scenario: More than 10 files (tests overflow display).
 */
export const createOverflowChanges = (fileCount: number = 15): WorktreeChanges =>
  createMockChanges(
    Array.from({ length: fileCount }, (_, i) => ({
      path: `file${String(i).padStart(2, '0')}.ts`, // Pad with zeros for proper sorting
      status: 'modified' as GitStatus,
      insertions: 1,
      deletions: 1,
    }))
  );

/**
 * Scenario: Binary files with no insertions/deletions stats.
 */
export const createBinaryFileChanges = (): WorktreeChanges =>
  createMockChanges([
    { path: 'image.png', status: 'modified', insertions: 0, deletions: 0 },
    { path: 'data.bin', status: 'added', insertions: 0, deletions: 0 },
  ]);

/**
 * Scenario: Long path names that need truncation.
 */
export const createLongPathChanges = (): WorktreeChanges =>
  createMockChanges([
    {
      path: 'src/very/long/nested/directory/path/that/exceeds/the/limit/for/display/file.ts',
      status: 'modified',
      insertions: 10,
      deletions: 5,
    },
  ]);
