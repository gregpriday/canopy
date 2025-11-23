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

  const changeSet = changes.get(worktreeId);
  const resolvedProfile = profile || lastCopyProfile || 'default';
  const changedFiles =
    changeSet?.changes
      ?.map(change => {
        const relativePath = path.isAbsolute(change.path)
          ? path.relative(changeSet.rootPath || target.path, change.path)
          : change.path;
        return relativePath || change.path;
      })
      .filter(Boolean) ?? [];

  const payload: CopyTreePayload = {
    rootPath: changeSet?.rootPath || target.path,
    profile: resolvedProfile,
    files: changedFiles.length > 0 ? changedFiles : undefined,
  };

  return { payload, profile: resolvedProfile };
}
