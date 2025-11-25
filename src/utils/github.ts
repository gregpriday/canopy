import { execa } from 'execa';

/**
 * Checks if `gh` CLI is installed and authenticated.
 */
export async function checkGitHubCli(cwd: string): Promise<boolean> {
  try {
    await execa('gh', ['auth', 'status'], { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the count of open issues in the repository.
 * @param cwd - Working directory
 * @returns Number of open issues, or null if gh CLI is unavailable
 */
export async function getIssueCount(cwd: string): Promise<number | null> {
  try {
    // Use gh api to get issue count - more reliable than parsing JSON list output
    const { stdout } = await execa('gh', ['issue', 'list', '--state', 'open', '--json', 'number', '--limit', '1000'], { cwd });
    const issues = JSON.parse(stdout);
    return Array.isArray(issues) ? issues.length : 0;
  } catch {
    return null;
  }
}

/**
 * Get the count of open pull requests in the repository.
 * @param cwd - Working directory
 * @returns Number of open PRs, or null if gh CLI is unavailable
 */
export async function getPrCount(cwd: string): Promise<number | null> {
  try {
    const { stdout } = await execa('gh', ['pr', 'list', '--state', 'open', '--json', 'number', '--limit', '1000'], { cwd });
    const prs = JSON.parse(stdout);
    return Array.isArray(prs) ? prs.length : 0;
  } catch {
    return null;
  }
}

/**
 * Opens the GitHub repository in the default browser.
 * @param cwd - Working directory
 * @param page - Optional page to navigate to ('issues' or 'pulls')
 */
export async function openGitHubUrl(cwd: string, page?: 'issues' | 'pulls'): Promise<void> {
  try {
    const args = ['repo', 'view', '--web'];
    // gh CLI doesn't support appending paths directly, so we need to get the URL and open it
    if (page) {
      // Get the repo URL first
      const { stdout } = await execa('gh', ['repo', 'view', '--json', 'url', '-q', '.url'], { cwd });
      const repoUrl = stdout.trim();
      const targetUrl = `${repoUrl}/${page}`;

      // Open the URL directly using the open command
      const { default: open } = await import('open');
      await open(targetUrl);
    } else {
      // Just open the repo homepage
      await execa('gh', args, { cwd, stdio: 'ignore' });
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('GitHub CLI (gh) not found. Please install it.');
    }
    throw new Error(error.message || 'Failed to open GitHub. Are you logged in via `gh auth login`?');
  }
}

/**
 * Opens the current repository in the default browser using the GitHub CLI.
 * @param cwd - The current working directory (root of the worktree)
 */
export async function openGitHubRepo(cwd: string): Promise<void> {
  return openGitHubUrl(cwd);
}
