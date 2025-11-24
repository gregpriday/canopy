import { execa } from 'execa';

/**
 * Opens the current repository in the default browser using the GitHub CLI.
 * @param cwd - The current working directory (root of the worktree)
 */
export async function openGitHubRepo(cwd: string): Promise<void> {
  try {
    // 'gh repo view --web' automatically finds the remote and opens the browser
    await execa('gh', ['repo', 'view', '--web'], { cwd, stdio: 'ignore' });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('GitHub CLI (gh) not found. Please install it.');
    }
    // Often gh returns non-zero if it's not a git repo or not logged in
    throw new Error(error.message || 'Failed to open GitHub. Are you logged in via `gh auth login`?');
  }
}
