import { useCallback } from 'react';
import { execa } from 'execa';
import open from 'open';
import clipboardy from 'clipboardy';
import type { CommandServices } from '../commands/types.js';
import { getCommand, loadCoreCommands } from '../commands/registry.js';
import type { NotificationPayload, TreeNode } from '../types/index.js';
import { events } from '../services/events.js'; // Import event bus

// Ensure core commands are loaded
loadCoreCommands();

interface ExecutorParams {
  cwd: string;
  selectedPath: string | null;
  fileTree: TreeNode[];
  expandedPaths: Set<string>;
  // setNotification REMOVED - handled via event bus
  refreshTree: () => Promise<void>;
  exitApp: () => void;
}

export function useCommandExecutor(params: ExecutorParams) {
  // Removed setNotification destructuring
  const { cwd, selectedPath, fileTree, expandedPaths, refreshTree, exitApp } = params;

  const execute = useCallback(async (input: string) => {
    // 1. Parse Input
    const [cmdName, ...args] = input.replace(/^\//, '').split(' ');
    const command = getCommand(cmdName);

    if (!command) {
      // Emit event instead of calling setNotification
      events.emit('ui:notify', { type: 'error', message: `Unknown command: ${cmdName}` });
      return;
    }

    // 2. Build Services Object (The Bridge)
    const services: CommandServices = {
      ui: {
        // Adapter: service calls events.emit
        notify: (n: NotificationPayload) => events.emit('ui:notify', n),
        refresh: refreshTree,
        exit: exitApp,
      },
      system: {
        cwd,
        openExternal: async (path) => { await open(path); },
        copyToClipboard: async (text) => { await clipboardy.write(text); },
        exec: async (cmd, cmdArgs, execCwd) => {
          const { stdout } = await execa(cmd, cmdArgs || [], { cwd: execCwd || cwd });
          return stdout;
        }
      },
      state: {
        selectedPath,
        fileTree,
        expandedPaths
      }
    };

    // 3. Execute
    try {
      const result = await command.execute(args, services);
      if (result.message) {
        events.emit('ui:notify', { type: 'success', message: result.message });
      }
    } catch (error: any) {
      events.emit('ui:notify', { type: 'error', message: error.message || 'Command failed' });
    }
  }, [cwd, selectedPath, fileTree, expandedPaths, refreshTree]);

  return { execute };
}
