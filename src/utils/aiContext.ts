import simpleGit from 'simple-git';
import fs from 'fs-extra';
import { globby } from 'globby';

interface ContextPayload {
  diff: string;
  readme: string;
}

export async function gatherContext(rootPath: string): Promise<ContextPayload> {
  const git = simpleGit(rootPath);

  // 1. Get Compressed Diff (Max 10,000 chars)
  let diff = '';
  try {
    // Get diff of working directory vs HEAD
    diff = await git.diff(['HEAD']);
  } catch (e) {
    // Fallback for new repos (no commits yet)
    try {
      diff = await git.diff([]);
    } catch (err) {
      diff = '';
    }
  }

  // 2. Append Untracked Files (if any)
  // git diff HEAD doesn't show untracked files, so we list them explicitly
  try {
    const untracked = await git.raw(['ls-files', '--others', '--exclude-standard']);
    if (untracked && untracked.trim().length > 0) {
      const untrackedList = untracked.trim();
      if (diff.length > 0) {
        diff += '\n\n';
      }
      diff += `Untracked files:\n${untrackedList}`;
    }
  } catch (e) {
    // Ignore errors listing untracked files
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