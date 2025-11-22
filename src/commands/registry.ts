import type { CommandDefinition } from './types.js';
import { copyTreeCommand } from './definitions/copytree.js';
import { openCommand } from './definitions/open.js';
import { exitCommand } from './definitions/exit.js';
import { worktreeCommand } from './definitions/worktree.js';
import { treeCommand } from './definitions/tree.js';
import { dashboardCommand } from './definitions/dashboard.js';

const registry = new Map<string, CommandDefinition>();

export function registerCommand(cmd: CommandDefinition) {
  registry.set(cmd.name, cmd);
  cmd.aliases?.forEach(alias => registry.set(alias, cmd));
}

export function getCommand(name: string): CommandDefinition | undefined {
  return registry.get(name);
}

export function getAllCommands(): CommandDefinition[] {
  // Return unique commands (filtering out aliases)
  return Array.from(new Set(registry.values()));
}

// Initialize core plugins
export function loadCoreCommands() {
  registerCommand(copyTreeCommand);
  registerCommand(openCommand);
  registerCommand(exitCommand);
  registerCommand(worktreeCommand);
  registerCommand(treeCommand);
  registerCommand(dashboardCommand);
}
