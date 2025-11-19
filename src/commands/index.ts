import type { CommandDefinition, CommandContext, CommandResult } from './types.js';
import { filterCommand } from './filter.js';

/**
 * All registered commands.
 * Add new command modules here to make them available.
 */
const allCommands: CommandDefinition[] = [
  filterCommand,
  // Add more commands here as they're implemented
];

/**
 * Command registry: maps command names and aliases to their definitions.
 * Built once at module load time for O(1) lookups.
 */
const commandRegistry = new Map<string, CommandDefinition>();

// Populate registry with all commands and their aliases
for (const command of allCommands) {
  // Register primary name
  commandRegistry.set(command.name.toLowerCase(), command);

  // Register all aliases
  if (command.aliases) {
    for (const alias of command.aliases) {
      commandRegistry.set(alias.toLowerCase(), command);
    }
  }
}

/**
 * Parse a command input string into command name and arguments.
 *
 * @param input - Raw command input (may or may not have leading /)
 * @returns Object with command name and arguments array
 *
 * @example
 * parseCommand('/filter component') // { command: 'filter', args: ['component'] }
 * parseCommand('f .ts') // { command: 'f', args: ['.ts'] }
 * parseCommand('filter') // { command: 'filter', args: [] }
 */
export function parseCommand(input: string): { command: string; args: string[] } {
  // Remove leading slash if present
  const trimmed = input.trim();
  const normalized = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;

  // Split on whitespace
  const parts = normalized.split(/\s+/).filter(part => part.length > 0);

  if (parts.length === 0) {
    return { command: '', args: [] };
  }

  const [command, ...args] = parts;
  return { command: command.toLowerCase(), args };
}

/**
 * Execute a command string with the given context.
 *
 * @param input - Command input string (e.g., "/filter component" or "f .ts")
 * @param context - Command execution context with state and setters
 * @returns Promise resolving to command result
 *
 * @example
 * await executeCommand('/filter .ts', context)
 * await executeCommand('f component', context)
 * await executeCommand('component', context) // implicit filter
 */
export async function executeCommand(
  input: string,
  context: CommandContext
): Promise<CommandResult> {
  const { command, args } = parseCommand(input);

  // Empty command
  if (!command) {
    return {
      success: false,
      error: 'Empty command',
      notification: {
        type: 'error',
        message: 'No command entered',
      },
    };
  }

  // Look up command by name or alias
  const commandDef = commandRegistry.get(command.toLowerCase());

  if (!commandDef) {
    // Free text without command = implicit /filter
    // This allows users to just type "component" instead of "/filter component"
    const filterDef = commandRegistry.get('filter');
    if (filterDef) {
      // Reconstruct the full input as filter args (include the "command" part)
      const filterArgs = [command, ...args];
      return await filterDef.execute(filterArgs, context);
    }

    // If somehow filter command isn't registered, return error
    return {
      success: false,
      error: `Unknown command: ${command}`,
      notification: {
        type: 'error',
        message: `Unknown command: ${command}`,
      },
    };
  }

  // Execute the command
  try {
    const result = await commandDef.execute(args, context);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
      notification: {
        type: 'error',
        message: `Command failed: ${errorMessage}`,
      },
    };
  }
}

/**
 * Get all registered command definitions.
 * Useful for help/documentation features.
 */
export function getAllCommands(): CommandDefinition[] {
  return allCommands;
}

/**
 * Get a specific command definition by name or alias.
 * Returns undefined if command not found.
 */
export function getCommand(nameOrAlias: string): CommandDefinition | undefined {
  return commandRegistry.get(nameOrAlias.toLowerCase());
}

// Export command types for use by other modules
export type { CommandDefinition, CommandContext, CommandResult } from './types.js';
