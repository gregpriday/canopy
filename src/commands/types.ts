import type { Notification, TreeNode } from '../types/index.js';

/**
 * Services exposed to commands.
 * This abstracts React state and side effects.
 */
export interface CommandServices {
  // UI Services
  ui: {
    notify: (notification: Notification) => void;
    refresh: () => void; // Changed from Promise<void>
    exit: () => void;
  };
  
  // System/OS Services
  system: {
    cwd: string; // The active root path (worktree root)
    openExternal: (path: string) => Promise<void>; // Open in OS default app/finder
    copyToClipboard: (text: string) => Promise<void>;
    exec: (command: string, args?: string[], cwd?: string) => Promise<string>; // Run shell commands
  };

  // App State (Read-Only access to current state)
  state: {
    selectedPath: string | null;
    fileTree: TreeNode[];
    expandedPaths: Set<string>;
  };
}

export interface CommandResult {
  success: boolean;
  message?: string; // Optional success message (auto-notified if present)
}

export interface CommandDefinition {
  name: string; // e.g., "copytree"
  description: string;
  usage?: string; // e.g., "/copytree [path]"
  aliases?: string[];
  
  // The logic function
  execute: (args: string[], services: CommandServices) => Promise<CommandResult>;
}