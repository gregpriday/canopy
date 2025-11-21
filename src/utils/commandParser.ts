import type { CanopyState, CanopyConfig, Notification } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  execute: CommandExecutor;
}

export type CommandExecutor = (
  args: string[],
  context: CommandContext
) => Promise<CommandResult>;

export interface CommandContext {
  state: CanopyState;
  setState: (updates: Partial<CanopyState>) => void;
  config: CanopyConfig;
  notify: (notification: Notification) => void;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ParsedCommand {
  command: string;
  args: string[];
  rawInput: string;
}

// ============================================================================
// Command Parsing
// ============================================================================

/**
 * Parse command input into structured format.
 *
 * Free text without "/" prefix is treated as "/filter" command.
 *
 * Examples:
 *   "/filter .ts" → { command: '/filter', args: ['.ts'], rawInput: ... }
 *   "component" → { command: '/filter', args: ['component'], rawInput: ... }
 *   "/git modified" → { command: '/git', args: ['modified'], rawInput: ... }
 */
export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();

  if (!trimmed) {
    return { command: '', args: [], rawInput: input };
  }

  // Check if input starts with /
  const isCommand = trimmed.startsWith('/');

  // Split by whitespace
  const parts = trimmed.split(/\s+/);

  if (isCommand) {
    // Explicit command: /filter .ts
    return {
      command: parts[0].toLowerCase(),
      args: parts.slice(1),
      rawInput: input,
    };
  } else {
    // Free text: treat entire input as filter argument
    return {
      command: '/filter',
      args: [trimmed],
      rawInput: input,
    };
  }
}

// ============================================================================
// Command Registry
// ============================================================================

/**
 * Find command in registry by name or alias.
 * Case-insensitive matching.
 */
export function findCommand(name: string, registry: Command[]): Command | null {
  const normalized = name.toLowerCase();

  return registry.find(cmd => {
    // Check primary name
    if (cmd.name.toLowerCase() === normalized) {
      return true;
    }

    // Check aliases
    if (cmd.aliases) {
      return cmd.aliases.some(alias => alias.toLowerCase() === normalized);
    }

    return false;
  }) || null;
}

/**
 * Register a new command in the registry.
 * Validates command structure and checks for duplicates.
 */
export function registerCommand(registry: Command[], command: Command): void {
  // Validate command structure
  validateCommand(command);

  // Check for duplicate names (only primary names, not aliases)
  const normalized = command.name.toLowerCase();
  const existingIndex = registry.findIndex(c => c.name.toLowerCase() === normalized);
  if (existingIndex >= 0) {
    console.warn(`Warning: Command ${command.name} already registered (overwriting)`);
    registry.splice(existingIndex, 1);
  }

  // Check for alias conflicts
  if (command.aliases) {
    for (const alias of command.aliases) {
      if (findCommand(alias, registry)) {
        throw new Error(`Alias ${alias} conflicts with existing command`);
      }
    }
  }

  registry.push(command);
}

/**
 * Validate command structure.
 * Throws if command is invalid.
 */
function validateCommand(command: Command): void {
  if (!command.name) {
    throw new Error('Command must have a name');
  }

  if (!command.name.startsWith('/')) {
    throw new Error(`Command name must start with /: ${command.name}`);
  }

  if (!command.description) {
    throw new Error(`Command ${command.name} must have a description`);
  }

  if (typeof command.execute !== 'function') {
    throw new Error(`Command ${command.name} must have an execute function`);
  }
}

/**
 * Create default command registry with built-in commands.
 *
 * Note: Command implementations are stubs that will be filled in by other issues:
 * - /filter → Issue #25
 * - /git → Issue #26
 * - /changed → Issue #26
 * - /open → Implemented here (simple)
 */
export function createCommandRegistry(): Command[] {
  const registry: Command[] = [];

  // /filter command
  registerCommand(registry, {
    name: '/filter',
    aliases: ['/f'],
    description: 'Filter files by name pattern',
    usage: '/filter <pattern> | /filter clear',
    execute: async (args, context) => {
      // Stub - implementation in issue #25
      if (args.length === 0) {
        return { success: false, error: 'Usage: /filter <pattern> or /filter clear' };
      }

      if (args[0] === 'clear') {
        context.setState({
          filterActive: false,
          filterQuery: '',
          filteredPaths: [],
        });
        context.notify({ type: 'info', message: 'Filter cleared' });
        return { success: true, message: 'Filter cleared' };
      }

      // Actual filter logic will be in #25
      context.setState({
        filterActive: true,
        filterQuery: args.join(' '),
      });
      context.notify({ type: 'info', message: `Filter: ${args.join(' ')}` });
      return { success: true, message: `Filtering by: ${args.join(' ')}` };
    },
  });

  // /git command
  registerCommand(registry, {
    name: '/git',
    aliases: ['/g'],
    description: 'Filter by git status',
    usage: '/git <modified|added|deleted|untracked>',
    execute: async (args, context) => {
      // Stub - implementation in issue #26
      const validStatuses = ['modified', 'added', 'deleted', 'untracked'];

      if (args.length === 0 || !validStatuses.includes(args[0])) {
        return {
          success: false,
          error: `Usage: /git ${validStatuses.join('|')}`,
        };
      }

      context.setState({
        filterActive: true,
        filterQuery: `git:${args[0]}`,
      });
      context.notify({ type: 'info', message: `Git filter: ${args[0]}` });
      return { success: true, message: `Filtering by git status: ${args[0]}` };
    },
  });

  // /changed command
  registerCommand(registry, {
    name: '/changed',
    aliases: ['/c'],
    description: 'Show all files with any git status',
    usage: '/changed',
    execute: async (args, context) => {
      // Stub - implementation in issue #26
      context.setState({
        filterActive: true,
        filterQuery: 'git:any',
      });
      context.notify({ type: 'info', message: 'Showing all changed files' });
      return { success: true, message: 'Showing all changed files' };
    },
  });

  // /open command (simple implementation)
  registerCommand(registry, {
    name: '/open',
    aliases: ['/o'],
    description: 'Open specific file',
    usage: '/open <path>',
    execute: async (args, context) => {
      if (args.length === 0) {
        return { success: false, error: 'Usage: /open <path>' };
      }

      const path = args.join(' ');

      // Simple implementation: just update selectedPath
      // Actual file opening happens in file opener system (#12)
      context.setState({ selectedPath: path });
      context.notify({ type: 'success', message: `Selected: ${path}` });
      return { success: true, message: `Opened ${path}` };
    },
  });

  // /copytree command (Phase 2+, stub for now)
  registerCommand(registry, {
    name: '/copytree',
    aliases: ['/ct'],
    description: 'CopyTree integration (Phase 2+)',
    usage: '/copytree [path] [flags...]',
    execute: async (args, context) => {
      context.notify({
        type: 'warning',
        message: 'CopyTree integration coming in Phase 2',
      });
      return { success: false, message: 'Not implemented yet (Phase 2+)' };
    },
  });

  return registry;
}

// ============================================================================
// Command Execution
// ============================================================================

/**
 * Execute command from raw input string.
 *
 * Parses input, finds command in registry, executes it.
 * Returns result indicating success/failure and optional message.
 *
 * @param input - Raw command input (e.g., "/filter .ts" or "component")
 * @param registry - Command registry
 * @param context - Execution context with state and callbacks
 * @returns Command execution result
 */
export async function executeCommand(
  input: string,
  registry: Command[],
  context: CommandContext
): Promise<CommandResult> {
  try {
    // Parse input
    const parsed = parseCommand(input);

    // Empty input → do nothing
    if (!parsed.command) {
      return { success: false, error: 'Empty command' };
    }

    // Find command in registry
    const command = findCommand(parsed.command, registry);

    if (!command) {
      // Unknown command: only fall back to filter for free text (no slash)
      // If input started with /, report as unknown command
      const wasExplicitCommand = input.trim().startsWith('/');

      if (wasExplicitCommand) {
        return {
          success: false,
          error: `Unknown command: ${parsed.command}`,
        };
      }

      // Free text → treat as filter (default behavior)
      const filterCommand = findCommand('/filter', registry);
      if (filterCommand) {
        return await filterCommand.execute([input], context);
      } else {
        return {
          success: false,
          error: `Unknown command: ${parsed.command}`,
        };
      }
    }

    // Execute command
    const result = await command.execute(parsed.args, context);
    return result;

  } catch (error) {
    console.error('Command execution error:', error);
    return {
      success: false,
      error: `Command failed: ${(error as Error).message}`,
    };
  }
}
