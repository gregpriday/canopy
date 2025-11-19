import type { CommandDefinition, CommandContext, CommandResult } from './types.js';
import type { Worktree } from '../types/index.js';

/**
 * Worktree command: /wt <subcommand> [args]
 *
 * Provides keyboard-driven worktree navigation:
 * - `/wt` or `/wt list` - List all worktrees with current marker
 * - `/wt next` - Switch to next worktree (circular)
 * - `/wt prev` - Switch to previous worktree (circular)
 * - `/wt <name-or-index>` - Switch by name (fuzzy) or index (1-based)
 *
 * Examples:
 *   /wt list
 *   /wt next
 *   /wt prev
 *   /wt feature/login
 *   /wt 2
 */

/**
 * List all worktrees with current marker and indices.
 * Output format: "1. [main] /path  2. feature/login /path..."
 */
async function listWorktreesCommand(
  args: string[],
  context: CommandContext
): Promise<CommandResult> {
  const { worktrees, activeWorktreeId, notify } = context;

  if (worktrees.length === 0) {
    return {
      success: false,
      error: 'No worktrees found',
      notification: {
        type: 'warning',
        message: 'No worktrees found',
      },
    };
  }

  // Build formatted list with indices and current marker
  const lines = worktrees.map((wt, index) => {
    const isCurrent = wt.id === activeWorktreeId ? '→' : ' ';
    const marker = wt.id === activeWorktreeId ? ' [current]' : '';
    return `${isCurrent} ${index + 1}. ${wt.name}${marker}`;
  });

  const message = `Worktrees (${worktrees.length} total):\n${lines.join('\n')}`;

  notify({
    type: 'info',
    message,
  });

  return {
    success: true,
    notification: {
      type: 'info',
      message,
    },
  };
}

/**
 * Switch to next worktree (circular navigation).
 */
async function nextWorktreeCommand(
  args: string[],
  context: CommandContext
): Promise<CommandResult> {
  const { worktrees, activeWorktreeId, switchToWorktree, notify } = context;

  if (worktrees.length === 0) {
    return {
      success: false,
      error: 'No worktrees found',
      notification: {
        type: 'warning',
        message: 'No worktrees found',
      },
    };
  }

  if (worktrees.length === 1) {
    return {
      success: true,
      notification: {
        type: 'info',
        message: 'Only one worktree available',
      },
    };
  }

  // Find current worktree index
  const currentIndex = worktrees.findIndex(wt => wt.id === activeWorktreeId);
  const normalizedIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (normalizedIndex + 1) % worktrees.length;
  const nextWorktree = worktrees[nextIndex];

  // Switch to next worktree if switching is available
  if (switchToWorktree) {
    try {
      await switchToWorktree(nextWorktree);
      notify({
        type: 'success',
        message: `Switched to worktree: ${nextWorktree.name}`,
      });
      return {
        success: true,
        notification: {
          type: 'success',
          message: `Switched to worktree: ${nextWorktree.name}`,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to switch worktree: ${errorMessage}`,
        notification: {
          type: 'error',
          message: `Failed to switch worktree: ${errorMessage}`,
        },
      };
    }
  }

  // Fallback if switchToWorktree is not available
  return {
    success: true,
    notification: {
      type: 'info',
      message: `Next worktree: ${nextWorktree.name} (switching not available)`,
    },
  };
}

/**
 * Switch to previous worktree (circular navigation).
 */
async function prevWorktreeCommand(
  args: string[],
  context: CommandContext
): Promise<CommandResult> {
  const { worktrees, activeWorktreeId, switchToWorktree, notify } = context;

  if (worktrees.length === 0) {
    return {
      success: false,
      error: 'No worktrees found',
      notification: {
        type: 'warning',
        message: 'No worktrees found',
      },
    };
  }

  if (worktrees.length === 1) {
    return {
      success: true,
      notification: {
        type: 'info',
        message: 'Only one worktree available',
      },
    };
  }

  // Find current worktree index
  const currentIndex = worktrees.findIndex(wt => wt.id === activeWorktreeId);
  const normalizedIndex = currentIndex >= 0 ? currentIndex : 0;
  const prevIndex = (normalizedIndex - 1 + worktrees.length) % worktrees.length;
  const prevWorktree = worktrees[prevIndex];

  // Switch to previous worktree if switching is available
  if (switchToWorktree) {
    try {
      await switchToWorktree(prevWorktree);
      notify({
        type: 'success',
        message: `Switched to worktree: ${prevWorktree.name}`,
      });
      return {
        success: true,
        notification: {
          type: 'success',
          message: `Switched to worktree: ${prevWorktree.name}`,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to switch worktree: ${errorMessage}`,
        notification: {
          type: 'error',
          message: `Failed to switch worktree: ${errorMessage}`,
        },
      };
    }
  }

  // Fallback if switchToWorktree is not available
  return {
    success: true,
    notification: {
      type: 'info',
      message: `Previous worktree: ${prevWorktree.name} (switching not available)`,
    },
  };
}

/**
 * Switch to worktree by name or index.
 * - If arg parses as number: treat as 1-based index
 * - Otherwise: fuzzy match against name and branch
 */
async function switchWorktreeByNameOrIndexCommand(
  args: string[],
  context: CommandContext
): Promise<CommandResult> {
  const { worktrees, switchToWorktree, notify } = context;

  if (args.length === 0) {
    return {
      success: false,
      error: 'Usage: /wt <name-or-index>',
      notification: {
        type: 'error',
        message: 'Usage: /wt <name-or-index>',
      },
    };
  }

  if (worktrees.length === 0) {
    return {
      success: false,
      error: 'No worktrees found',
      notification: {
        type: 'warning',
        message: 'No worktrees found',
      },
    };
  }

  const arg = args[0];

  // Try parsing as 1-based index
  const index = parseInt(arg, 10);
  if (!isNaN(index)) {
    if (index < 1 || index > worktrees.length) {
      return {
        success: false,
        error: `Invalid worktree index: ${index} (must be 1-${worktrees.length})`,
        notification: {
          type: 'error',
          message: `Invalid worktree index: ${index} (must be 1-${worktrees.length})`,
        },
      };
    }

    const targetWorktree = worktrees[index - 1];

    if (switchToWorktree) {
      try {
        await switchToWorktree(targetWorktree);
        notify({
          type: 'success',
          message: `Switched to worktree: ${targetWorktree.name}`,
        });
        return {
          success: true,
          notification: {
            type: 'success',
            message: `Switched to worktree: ${targetWorktree.name}`,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          success: false,
          error: `Failed to switch worktree: ${errorMessage}`,
          notification: {
            type: 'error',
            message: `Failed to switch worktree: ${errorMessage}`,
          },
        };
      }
    }

    return {
      success: true,
      notification: {
        type: 'info',
        message: `Target worktree: ${targetWorktree.name} (switching not available)`,
      },
    };
  }

  // Fuzzy match by name or branch (case-insensitive)
  const searchTerm = arg.toLowerCase();
  const matches = worktrees.filter(wt =>
    (wt.name && wt.name.toLowerCase().includes(searchTerm)) ||
    (wt.branch && wt.branch.toLowerCase().includes(searchTerm))
  );

  if (matches.length === 0) {
    const suggestions = worktrees.map((wt, i) => `${i + 1}. ${wt.name}`).join(', ');
    return {
      success: false,
      error: `Worktree not found: "${arg}"`,
      notification: {
        type: 'error',
        message: `Worktree not found: "${arg}". Available: ${suggestions}`,
      },
    };
  }

  if (matches.length > 1) {
    const matchNames = matches.map(wt => wt.name).join(', ');
    return {
      success: false,
      error: `Ambiguous worktree: "${arg}" matches multiple: ${matchNames}`,
      notification: {
        type: 'error',
        message: `Ambiguous worktree: "${arg}" matches: ${matchNames}`,
      },
    };
  }

  const targetWorktree = matches[0];

  if (switchToWorktree) {
    try {
      await switchToWorktree(targetWorktree);
      notify({
        type: 'success',
        message: `Switched to worktree: ${targetWorktree.name}`,
      });
      return {
        success: true,
        notification: {
          type: 'success',
          message: `Switched to worktree: ${targetWorktree.name}`,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to switch worktree: ${errorMessage}`,
        notification: {
          type: 'error',
          message: `Failed to switch worktree: ${errorMessage}`,
        },
      };
    }
  }

  return {
    success: true,
    notification: {
      type: 'info',
      message: `Target worktree: ${targetWorktree.name} (switching not available)`,
    },
  };
}

/**
 * Main worktree command router.
 * Routes /wt <subcommand> to appropriate handler.
 */
export const worktreeCommand: CommandDefinition = {
  name: 'wt',
  aliases: ['worktree'],
  description: 'Manage git worktrees',
  usage: '/wt [list|next|prev|<name-or-index>]',
  examples: [
    '/wt list',
    '/wt next',
    '/wt prev',
    '/wt feature/login',
    '/wt 2',
  ],

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    // Default to list if no args
    if (args.length === 0) {
      return listWorktreesCommand(args, context);
    }

    const subcommand = args[0].toLowerCase();
    const subArgs = args.slice(1);

    switch (subcommand) {
      case 'list':
      case 'ls':
        return listWorktreesCommand(subArgs, context);

      case 'next':
      case 'n':
        return nextWorktreeCommand(subArgs, context);

      case 'prev':
      case 'previous':
      case 'p':
        return prevWorktreeCommand(subArgs, context);

      default:
        // Treat as name or index
        return switchWorktreeByNameOrIndexCommand([subcommand, ...subArgs], context);
    }
  },
};
