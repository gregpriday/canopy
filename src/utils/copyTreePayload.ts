import path from 'node:path';
import type { CopyTreePayload } from '../services/events.js';
import type { Worktree, WorktreeChanges } from '../types/index.js';

interface CopyTreeRequestParams {
  worktreeId: string;
  worktrees: Worktree[];
  changes: Map<string, WorktreeChanges>;
  profile?: string;
  lastCopyProfile?: string;
}

interface CopyTreeRequest {
  payload: CopyTreePayload;
  profile: string;
}

export function buildCopyTreeRequest({
  worktreeId,
  worktrees,
  changes,
  profile,
  lastCopyProfile,
}: CopyTreeRequestParams): CopyTreeRequest | null {
  const target = worktrees.find(wt => wt.id === worktreeId);
  if (!target) {
    return null;
  }

  const resolvedProfile = profile || lastCopyProfile || 'default';
  const changeSet = changes.get(worktreeId);
  const targetRoot = changeSet?.rootPath || target.path;

  const changedFiles =
    changeSet?.changes
      ?.map(change => {
        const relativePath = path.isAbsolute(change.path)
          ? path.relative(targetRoot, change.path)
          : change.path;
        return relativePath || change.path;
      })
      .filter(Boolean) ?? [];

  const payload: CopyTreePayload = {
    rootPath: targetRoot,
    profile: resolvedProfile,
    // Run from the worktree root; include changed files if any, else "." to copy entire tree
    files: changedFiles.length > 0 ? changedFiles : ['.'],
  };

  return { payload, profile: resolvedProfile };
}
