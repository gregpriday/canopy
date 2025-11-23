import type { Worktree, WorktreeChanges, CanopyConfig, GitStatus } from '../../src/types/index.js';

/**
 * Mock worktrees for dashboard integration testing.
 * Provides realistic test data for multi-worktree scenarios.
 */
export const mockWorktrees: Worktree[] = [
  {
    id: '/test/repo/main',
    path: '/test/repo/main',
    name: 'main',
    branch: 'main',
    isCurrent: true,
    summary: 'Main development branch with latest stable code',
    modifiedCount: 0,
    summaryLoading: false,
    mood: 'stable',
    changes: [],
  },
  {
    id: '/test/repo/feature-auth',
    path: '/test/repo/feature-auth',
    name: 'feature/auth',
    branch: 'feature/auth',
    isCurrent: false,
    summary: 'Adding OAuth2 authentication with JWT tokens',
    modifiedCount: 5,
    summaryLoading: false,
    mood: 'active',
    changes: [
      { path: 'src/auth/oauth.ts', status: 'modified' as GitStatus },
      { path: 'src/auth/jwt.ts', status: 'added' as GitStatus },
      { path: 'src/auth/types.ts', status: 'modified' as GitStatus },
      { path: 'tests/auth/oauth.test.ts', status: 'added' as GitStatus },
      { path: 'package.json', status: 'modified' as GitStatus },
    ],
  },
  {
    id: '/test/repo/bugfix-123',
    path: '/test/repo/bugfix-123',
    name: 'bugfix/memory-leak',
    branch: 'bugfix/memory-leak',
    isCurrent: false,
    summary: 'Fixing memory leak in file watcher cleanup',
    modifiedCount: 2,
    summaryLoading: false,
    mood: 'active',
    changes: [
      { path: 'src/hooks/useWatcher.ts', status: 'modified' as GitStatus },
      { path: 'tests/hooks/useWatcher.test.ts', status: 'modified' as GitStatus },
    ],
  },
  {
    id: '/test/repo/old-feature',
    path: '/test/repo/old-feature',
    name: 'feature/old-experiment',
    branch: 'feature/old-experiment',
    isCurrent: false,
    summary: 'Experimental feature from last month',
    modifiedCount: 0,
    summaryLoading: false,
    mood: 'stale',
    changes: [],
  },
];

/**
 * Mock worktree changes map for testing git status integration.
 */
export const mockWorktreeChanges = new Map<string, WorktreeChanges>([
  [
    '/test/repo/main',
    {
      worktreeId: '/test/repo/main',
      rootPath: '/test/repo/main',
      changes: [],
      changedFileCount: 0,
      lastUpdated: Date.now(),
    },
  ],
  [
    '/test/repo/feature-auth',
    {
      worktreeId: '/test/repo/feature-auth',
      rootPath: '/test/repo/feature-auth',
      changes: mockWorktrees[1].changes || [],
      changedFileCount: 5,
      lastUpdated: Date.now(),
    },
  ],
  [
    '/test/repo/bugfix-123',
    {
      worktreeId: '/test/repo/bugfix-123',
      rootPath: '/test/repo/bugfix-123',
      changes: mockWorktrees[2].changes || [],
      changedFileCount: 2,
      lastUpdated: Date.now(),
    },
  ],
  [
    '/test/repo/old-feature',
    {
      worktreeId: '/test/repo/old-feature',
      rootPath: '/test/repo/old-feature',
      changes: [],
      changedFileCount: 0,
      lastUpdated: Date.now(),
    },
  ],
]);

/**
 * Mock config for dashboard testing with predictable CopyTree profiles.
 */
export const mockDashboardConfig: CanopyConfig = {
  editor: 'code',
  editorArgs: ['-r'],
  openers: {
    default: { cmd: 'code', args: ['-r'] },
    byExtension: {},
    byGlob: {},
  },
  showGitStatus: true,
  showHidden: false,
  respectGitignore: true,
  customIgnores: [],
  sortBy: 'name',
  sortDirection: 'asc',
  maxDepth: null,
  refreshDebounce: 100,
  ui: {
    leftClickAction: 'select',
    compactMode: true,
    theme: 'default',
  },
  copytree: {
    profiles: {
      default: {
        args: ['--format', 'tree'],
        description: 'Default CopyTree profile',
      },
      detailed: {
        args: ['--format', 'detailed', '--include-git'],
        description: 'Detailed profile with git info',
      },
    },
  },
  search: {
    excludePatterns: ['node_modules/**', '.git/**'],
    maxResults: 100,
    fuzzyThreshold: 0.6,
  },
  activity: {
    maxEvents: 50,
    retentionMinutes: 60,
  },
};
