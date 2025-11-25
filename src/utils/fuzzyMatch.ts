/**
 * Fuzzy matching utility for file search with scoring algorithm.
 * Provides relevance-based ranking for search results.
 */

export interface FuzzyMatchResult {
  path: string;
  score: number;
  matchIndices: number[]; // Indices of matched characters in the path
}

/**
 * Performs fuzzy matching on a search query against a file path.
 * Returns a score indicating match quality (higher is better).
 *
 * Scoring bonuses:
 * - Consecutive character matches: +5 per character
 * - Match at start of basename: +20
 * - Match at start of path segment: +10
 * - Exact basename match: +100
 * - Case-sensitive match: +2
 *
 * @param query - Search query string
 * @param path - File path to match against
 * @returns Match result with score and indices, or null if no match
 */
export function fuzzyMatch(query: string, path: string): FuzzyMatchResult | null {
  if (!query) {
    return { path, score: 0, matchIndices: [] };
  }

  const lowerQuery = query.toLowerCase();
  const lowerPath = path.toLowerCase();
  const basename = path.split('/').pop() || path;
  const lowerBasename = basename.toLowerCase();

  // Check for exact basename match (case-insensitive)
  if (lowerBasename === lowerQuery) {
    return {
      path,
      score: 100 + (basename === query ? 50 : 0), // Bonus for case match
      matchIndices: Array.from({ length: query.length }, (_, i) => path.lastIndexOf(basename) + i),
    };
  }

  // Fuzzy match logic
  let score = 0;
  let queryIndex = 0;
  let pathIndex = 0;
  const matchIndices: number[] = [];
  let consecutiveMatches = 0;
  let lastMatchIndex = -1;

  while (queryIndex < lowerQuery.length && pathIndex < lowerPath.length) {
    if (lowerQuery[queryIndex] === lowerPath[pathIndex]) {
      // Character match found
      matchIndices.push(pathIndex);

      // Bonus for case-sensitive match
      if (query[queryIndex] === path[pathIndex]) {
        score += 2;
      }

      // Bonus for consecutive matches
      if (lastMatchIndex === pathIndex - 1) {
        consecutiveMatches++;
        score += 5 * consecutiveMatches;
      } else {
        consecutiveMatches = 0;
      }

      // Bonus for match at start of basename
      const basenameStart = path.lastIndexOf('/') + 1;
      if (pathIndex === basenameStart) {
        score += 20;
      }

      // Bonus for match at start of any path segment
      if (pathIndex === 0 || path[pathIndex - 1] === '/') {
        score += 10;
      }

      lastMatchIndex = pathIndex;
      queryIndex++;
    }
    pathIndex++;
  }

  // Return null if not all query characters were matched
  if (queryIndex < lowerQuery.length) {
    return null;
  }

  // Base score: inverse of path length (prefer shorter paths)
  score += Math.max(0, 100 - path.length);

  // Bonus for matches concentrated in basename vs full path
  const basenameMatchCount = matchIndices.filter(i => i >= path.lastIndexOf('/') + 1).length;
  score += basenameMatchCount * 3;

  return { path, score, matchIndices };
}
