import { describe, it, expect } from 'vitest';
import { buildCopyTreeRequest } from '../../src/utils/copyTreePayload.js';
import type { Worktree, WorktreeChanges } from '../../src/types/index.js';

const worktree: Worktree = {
  id: 'wt-1',
  path: '/repo/main',
  name: 'main',
  branch: 'main',
  isCurrent: true,
};

const changeSet: WorktreeChanges = {
  worktreeId: worktree.id,
  rootPath: worktree.path,
  changes: [
    { path: 'src/index.ts', status: 'modified', insertions: 10, deletions: 2 },
    { path: 'README.md', status: 'added', insertions: 3, deletions: 0 },
  ],
  changedFileCount: 2,
  totalInsertions: 13,
  totalDeletions: 2,
  lastUpdated: Date.now(),
};

describe('buildCopyTreeRequest', () => {
  it('builds payload with changed files and last used profile', () => {
    const result = buildCopyTreeRequest({
      worktreeId: worktree.id,
      worktrees: [worktree],
      changes: new Map([[worktree.id, changeSet]]),
      lastCopyProfile: 'debug',
    });

    expect(result?.profile).toBe('debug');
    expect(result?.payload).toEqual({
      rootPath: '/repo/main',
      profile: 'debug',
      files: ['src/index.ts', 'README.md'],
    });
  });

  it('prefers explicit profile and omits files when none are available', () => {
    const result = buildCopyTreeRequest({
      worktreeId: worktree.id,
      worktrees: [worktree],
      changes: new Map(),
      profile: 'minimal',
      lastCopyProfile: 'debug',
    });

    expect(result?.profile).toBe('minimal');
    expect(result?.payload.rootPath).toBe('/repo/main');
    expect(result?.payload.profile).toBe('minimal');
    expect(result?.payload.files).toBeUndefined();
  });

  it('returns null when worktree cannot be resolved', () => {
    const result = buildCopyTreeRequest({
      worktreeId: 'missing',
      worktrees: [worktree],
      changes: new Map([[worktree.id, changeSet]]),
    });

    expect(result).toBeNull();
  });
});
