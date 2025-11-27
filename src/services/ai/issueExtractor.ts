import { getAIClient } from './client.js';
import { extractOutputText } from './utils.js';
import { logDebug } from '../../utils/logger.js';

// Regex patterns to try before using AI (fast, no API cost)
const ISSUE_PATTERNS = [
  /issue-(\d+)/i,           // feature/issue-158-description
  /issues?\/(\d+)/i,        // fix/issues/42
  /#(\d+)/,                 // feature/#42-description
  /gh-(\d+)/i,              // fix/GH-42-login-bug or gh-123
  /jira-(\d+)/i,            // feature/jira-456-task
];

// In-memory cache: branch name -> issue number (or null if no issue found)
const issueCache = new Map<string, number | null>();

// Branches that should never have issue numbers
const SKIP_BRANCHES = ['main', 'master', 'develop', 'staging', 'production', 'release', 'hotfix'];

/**
 * Extract issue number from a branch name.
 * Tries regex patterns first (fast, no API cost), falls back to AI for unusual formats.
 * Results are cached in memory since branch names don't change during a session.
 *
 * @param branchName - Git branch name to extract issue number from
 * @returns Issue number if found, null otherwise
 */
export async function extractIssueNumber(branchName: string): Promise<number | null> {
  // Handle empty or invalid input
  if (!branchName || typeof branchName !== 'string') {
    return null;
  }

  const trimmedBranch = branchName.trim();
  if (!trimmedBranch) {
    return null;
  }

  // Check cache first
  if (issueCache.has(trimmedBranch)) {
    return issueCache.get(trimmedBranch)!;
  }

  // Skip obvious non-issue branches
  const lowerBranch = trimmedBranch.toLowerCase();
  if (SKIP_BRANCHES.some(skip => lowerBranch === skip || lowerBranch.startsWith(`${skip}/`))) {
    issueCache.set(trimmedBranch, null);
    return null;
  }

  // Try regex patterns first (fast, no API cost)
  for (const pattern of ISSUE_PATTERNS) {
    const match = trimmedBranch.match(pattern);
    if (match?.[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0) {
        issueCache.set(trimmedBranch, num);
        return num;
      }
    }
  }

  // AI fallback for unusual patterns
  const result = await extractIssueNumberWithAI(trimmedBranch);
  issueCache.set(trimmedBranch, result);
  return result;
}

/**
 * Use AI to extract issue number from unusual branch name formats.
 * This is called only when regex patterns fail to match.
 */
async function extractIssueNumberWithAI(branchName: string): Promise<number | null> {
  const client = getAIClient();
  if (!client) {
    return null;
  }

  try {
    const response = await client.responses.create({
      model: 'gpt-5-nano',
      instructions: `Extract the GitHub issue number from this git branch name.
Return JSON: {"issueNumber": <number or null>}

Rules:
- Look for numbers that represent issue references (like "issue-123", "#42", "GH-15")
- If multiple numbers exist, prefer the one that looks like an issue reference
- Return null if no issue number is found or the branch doesn't reference an issue
- Common non-issue branches: main, develop, feature/general-refactor

Examples:
"feature/issue-158-add-button" -> {"issueNumber": 158}
"fix/GH-42-login-bug" -> {"issueNumber": 42}
"feature/add-dark-mode" -> {"issueNumber": null}
"refactor/cleanup-v2" -> {"issueNumber": null}`,
      input: branchName,
      text: {
        format: {
          type: 'json_schema',
          name: 'issue_extraction',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              issueNumber: {
                oneOf: [
                  { type: 'number' },
                  { type: 'null' }
                ],
                description: 'The extracted issue number, or null if none found'
              }
            },
            required: ['issueNumber'],
            additionalProperties: false
          }
        }
      },
      reasoning: { effort: 'minimal' },
      max_output_tokens: 64
    } as any);

    const text = extractOutputText(response);
    if (!text) {
      return null;
    }

    // Parse the JSON response
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.issueNumber === 'number' && parsed.issueNumber > 0) {
        return parsed.issueNumber;
      }
    } catch {
      // Try regex extraction as last resort
      const match = text.match(/"issueNumber"\s*:\s*(\d+)/);
      if (match?.[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > 0) {
          return num;
        }
      }
    }

    return null;
  } catch (error) {
    // Log error for debugging but don't fail the feature
    logDebug('AI issue extraction failed', { branch: branchName, error: (error as Error).message });
    return null;
  }
}

/**
 * Synchronously extract issue number using only regex patterns.
 * Use this when you need immediate results without waiting for AI.
 *
 * @param branchName - Git branch name to extract issue number from
 * @returns Issue number if found via regex, null otherwise
 */
export function extractIssueNumberSync(branchName: string): number | null {
  if (!branchName || typeof branchName !== 'string') {
    return null;
  }

  const trimmedBranch = branchName.trim();
  if (!trimmedBranch) {
    return null;
  }

  // Check cache first
  if (issueCache.has(trimmedBranch)) {
    return issueCache.get(trimmedBranch)!;
  }

  // Skip obvious non-issue branches and cache the result
  const lowerBranch = trimmedBranch.toLowerCase();
  if (SKIP_BRANCHES.some(skip => lowerBranch === skip || lowerBranch.startsWith(`${skip}/`))) {
    issueCache.set(trimmedBranch, null);
    return null;
  }

  // Try regex patterns only
  for (const pattern of ISSUE_PATTERNS) {
    const match = trimmedBranch.match(pattern);
    if (match?.[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0) {
        // Cache successful regex match
        issueCache.set(trimmedBranch, num);
        return num;
      }
    }
  }

  // Don't cache null here - let async path try AI fallback
  return null;
}

/**
 * Clear the issue number cache.
 * Useful for testing or when branch names might have changed.
 */
export function clearIssueCache(): void {
  issueCache.clear();
}
