import simpleGit from 'simple-git';
import fs from 'fs-extra';
import path from 'node:path';
import { globby } from 'globby';

interface ContextPayload {
  diff: string;
  readme: string;
}

interface FileWithMtime {
  file: string;
  mtime: Date;
}

export async function gatherContext(rootPath: string): Promise<ContextPayload> {
  const git = simpleGit(rootPath);

  // 1. Get list of modified and added files from git status
  let diff = '';
  try {
    const status = await git.status();
    const renamedTargets = (status.renamed ?? []).map((renamed) => renamed.to || renamed.from);
    const relevantFiles = [
      ...status.modified,
      ...status.created,
      ...status.not_added, // Untracked files
      ...status.deleted,
      ...renamedTargets
    ];
    const changedFiles = Array.from(new Set(relevantFiles));

    // 2. Get modification times for each file
    const filesWithMtime: FileWithMtime[] = [];

    for (const file of changedFiles) {
      const filePath = path.join(rootPath, file);
      try {
        const stats = await fs.stat(filePath);
        filesWithMtime.push({ file, mtime: stats.mtime });
      } catch (e) {
        // Still include deleted/symlinked files; send them to the back of the queue
        filesWithMtime.push({ file, mtime: new Date(0) });
      }
    }

    // 3. Sort by mtime descending (most recent first)
    filesWithMtime.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // 4. Take only the last 5 files
    const recentFiles = filesWithMtime.slice(0, 5);

    // 5. Generate diff for only these files
    for (const { file } of recentFiles) {
      try {
        // Try diff against HEAD first
        const fileDiff = await git.diff(['HEAD', '--', file]);
        if (fileDiff) {
          diff += fileDiff;
        } else {
          // For untracked files, show the file content as a new file diff
          const fileDiffUntracked = await git.diff(['--', file]);
          if (fileDiffUntracked) {
            diff += fileDiffUntracked;
          } else {
            // If neither works, read the file and create a pseudo-diff
            try {
              const content = await fs.readFile(path.join(rootPath, file), 'utf-8');
              diff += `\nNew file: ${file}\n${content.substring(0, 500)}\n`;
            } catch {
              // If we can't read it, just mention it
              diff += `\nNew file: ${file}\n`;
            }
          }
        }
      } catch (e) {
        // Skip files that cause diff errors
        continue;
      }
    }
  } catch (e) {
    // Fallback for new repos or git errors - return empty diff
    diff = '';
  }

  // Truncate to 10k characters to keep it "Nano" friendly
  const truncatedDiff = diff.length > 10000
    ? diff.substring(0, 10000) + '\n...(diff truncated)'
    : diff;

  // 3. Get README Context (Max 2,000 chars)
  let readmeContent = '';
  try {
    const readmeFiles = await globby(['README.md', 'readme.md', 'README.txt'], {
      cwd: rootPath,
      deep: 1,
      absolute: true
    });

    if (readmeFiles.length > 0) {
      const content = await fs.readFile(readmeFiles[0], 'utf-8');
      readmeContent = content.substring(0, 2000);
    }
  } catch (e) {
    // Ignore readme errors, it's optional context
  }

  return {
    diff: truncatedDiff,
    readme: readmeContent
  };
}
