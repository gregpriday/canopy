import { execa } from 'execa';

export interface RepoStats {
  issueCount: number;
  prCount: number;
}

export interface RepoStatsResult {
  stats: RepoStats | null;
  error?: string;
}

/**
 * Get issue and PR counts using a single GraphQL API call.
 * Much more efficient than fetching full lists - uses only 1 API call instead of 2.
 * Handles auth errors gracefully without needing a separate auth check.
 * @param cwd - Working directory
 * @returns Issue and PR counts with optional error message
 */
export async function getRepoStats(cwd: string): Promise<RepoStatsResult> {
  try {
    // GraphQL query to get both counts in a single API call
    const query = `
      query {
        repository(owner: "{owner}", name: "{repo}") {
          issues(states: OPEN) { totalCount }
          pullRequests(states: OPEN) { totalCount }
        }
      }
    `;

    // First get the owner/repo from the current directory
    const { stdout: repoInfo } = await execa(
      'gh',
      ['repo', 'view', '--json', 'owner,name', '-q', '.owner.login + "/" + .name'],
      { cwd }
    );
    const [owner, repo] = repoInfo.trim().split('/');

    if (!owner || !repo) {
      return { stats: null, error: 'not a GitHub repository' };
    }

    // Execute the GraphQL query
    const { stdout } = await execa(
      'gh',
      ['api', 'graphql', '-f', `query=${query.replace('{owner}', owner).replace('{repo}', repo)}`],
      { cwd }
    );

    const data = JSON.parse(stdout);
    const repository = data?.data?.repository;

    if (!repository) {
      return { stats: null, error: 'repository not found' };
    }

    return {
      stats: {
        issueCount: repository.issues?.totalCount ?? 0,
        prCount: repository.pullRequests?.totalCount ?? 0,
      },
    };
  } catch (error: any) {
    // Check if gh CLI is not installed
    if (error.code === 'ENOENT') {
      return { stats: null, error: 'gh CLI not installed' };
    }

    // Parse stderr for common errors
    const stderr = error.stderr || error.message || '';

    if (stderr.includes('auth') || stderr.includes('login') || stderr.includes('token')) {
      return { stats: null, error: 'gh auth required - run: gh auth login' };
    }
    if (stderr.includes('Could not resolve to a Repository')) {
      return { stats: null, error: 'not a GitHub repository' };
    }
    if (stderr.includes('rate limit')) {
      return { stats: null, error: 'GitHub rate limit exceeded' };
    }

    // Generic failure
    return { stats: null, error: 'GitHub API unavailable' };
  }
}

/**
 * @deprecated Use getRepoStats() instead for efficiency (single API call)
 */
export async function getIssueCount(cwd: string): Promise<number | null> {
  const result = await getRepoStats(cwd);
  return result.stats?.issueCount ?? null;
}

/**
 * @deprecated Use getRepoStats() instead for efficiency (single API call)
 */
export async function getPrCount(cwd: string): Promise<number | null> {
  const result = await getRepoStats(cwd);
  return result.stats?.prCount ?? null;
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
