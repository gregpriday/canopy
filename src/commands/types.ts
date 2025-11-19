import type { TreeNode, Notification, YellowwoodState } from '../types/index.js';

/**
 * Context passed to command execution.
 * Provides access to current state and state update functions.
 */
export interface CommandContext {
  /** Current application state */
  state: YellowwoodState;

  /** Original unfiltered file tree (for filter commands to operate on) */
  originalFileTree: TreeNode[];

  /** Update filter active status */
  setFilterActive: (active: boolean) => void;

  /** Update filter query string */
  setFilterQuery: (query: string) => void;

  /** Update the file tree (for filtered results) */
  setFileTree: (tree: TreeNode[]) => void;

  /** Show a notification to the user */
  notify: (notification: Notification) => void;

  /** Add command to history */
  addToHistory: (command: string) => void;
}

/**
 * Result returned from command execution.
 * Commands can return partial state updates or just success/failure.
 */
export interface CommandResult {
  /** Whether the command executed successfully */
  success: boolean;

  /** Optional notification to display */
  notification?: Notification;

  /** Optional error message if command failed */
  error?: string;
}

/**
 * Definition of a slash command.
 */
export interface CommandDefinition {
  /** Primary command name (without leading /) */
  name: string;

  /** Alternative names for the command */
  aliases?: string[];

  /** Human-readable description */
  description: string;

  /** Usage examples or syntax help */
  usage?: string;

  /** Example invocations */
  examples?: string[];

  /**
   * Execute the command with given arguments.
   * @param args - Command arguments (split by whitespace)
   * @param context - Command execution context
   * @returns Result indicating success/failure and any state updates
   */
  execute: (args: string[], context: CommandContext) => Promise<CommandResult>;
}
