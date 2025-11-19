import type { CommandDefinition, CommandContext, CommandResult } from './types.js';
import type { TreeNode } from '../types/index.js';
import { filterTreeByName } from '../utils/filter.js';

/**
 * Count total number of files in a tree (not directories).
 */
function countFiles(tree: TreeNode[]): number {
  let count = 0;

  function traverse(nodes: TreeNode[]) {
    for (const node of nodes) {
      if (node.type === 'file') {
        count++;
      }
      if (node.children) {
        traverse(node.children);
      }
    }
  }

  traverse(tree);
  return count;
}

/**
 * Filter command: /filter <pattern>
 * Alias: /f <pattern>
 *
 * Filters the file tree by name using fuzzy matching.
 * Preserves folder hierarchy so users can see context.
 */
export const filterCommand: CommandDefinition = {
  name: 'filter',
  aliases: ['f'],
  description: 'Filter files by name pattern (fuzzy matching)',
  usage: '/filter <pattern> | /filter clear',
  examples: [
    '/filter component',
    '/f .ts',
    '/filter src/util',
    '/filter clear',
  ],

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    const { originalFileTree, setFilterActive, setFilterQuery, setFileTree, notify } = context;

    // Handle /filter clear or /filter with no args
    if (args.length === 0 || args[0] === 'clear') {
      setFilterActive(false);
      setFilterQuery('');
      // Note: We don't restore the original tree here - that should be handled
      // by the app logic that maintains both filtered and unfiltered trees
      notify({
        type: 'info',
        message: 'Filter cleared',
      });

      return {
        success: true,
        notification: {
          type: 'info',
          message: 'Filter cleared',
        },
      };
    }

    // Join all args to support patterns with spaces
    const pattern = args.join(' ');

    // Apply filter using utility - always filter from original unfiltered tree
    const filteredTree = filterTreeByName(originalFileTree, pattern);
    const fileCount = countFiles(filteredTree);

    // Empty result = no matches
    if (fileCount === 0) {
      setFilterActive(true);
      setFilterQuery(pattern);
      setFileTree(filteredTree); // Empty tree

      const notification = {
        type: 'warning' as const,
        message: `No files match "${pattern}"`,
      };

      notify(notification);

      return {
        success: true,
        notification,
      };
    }

    // Success - show filtered tree
    setFilterActive(true);
    setFilterQuery(pattern);
    setFileTree(filteredTree);

    const notification = {
      type: 'success' as const,
      message: `Filtered to ${fileCount} file${fileCount === 1 ? '' : 's'}`,
    };

    notify(notification);

    return {
      success: true,
      notification,
    };
  },
};
