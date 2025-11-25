import { useCallback, useMemo } from 'react';
import open from 'open';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import type { QuickLink, QuickLinksConfig } from '../types/index.js';
import { events } from '../services/events.js';

/**
 * Represents a slash command derived from quick links configuration
 */
export interface SlashCommand {
  /** Command name (without leading slash) */
  name: string;
  /** Display label for the command */
  label: string;
  /** Description shown in autocomplete */
  description: string;
  /** Keyboard shortcut if available (1-9) */
  shortcut?: number;
  /** Whether this is a built-in command */
  isBuiltin?: boolean;
  /** Action to execute when command is invoked */
  action: () => void;
}

export interface UseQuickLinksResult {
  /** All configured quick links */
  links: QuickLink[];
  /** Slash commands derived from quick links */
  commands: SlashCommand[];
  /** Map of shortcut number to quick link */
  shortcutMap: Map<number, QuickLink>;
  /** Open a URL in the default browser */
  openUrl: (url: string, label?: string) => Promise<void>;
  /** Open a quick link by its shortcut number */
  openByShortcut: (shortcut: number) => Promise<boolean>;
  /** Open a quick link by its command name */
  openByCommand: (command: string) => Promise<boolean>;
  /** Whether quick links feature is enabled */
  enabled: boolean;
}

/**
 * Hook for managing quick links to external tools and chat clients.
 * Provides URL opening, command palette integration, and keyboard shortcut handling.
 */
export function useQuickLinks(config?: QuickLinksConfig): UseQuickLinksResult {
  const enabled = config?.enabled ?? true;
  const links = config?.links ?? [];

  /**
   * Open a URL in the default browser with notification feedback
   */
  const openUrl = useCallback(async (url: string, label?: string): Promise<void> => {
    try {
      await open(url);
      events.emit('ui:notify', {
        type: 'success',
        message: label ? `Opening ${label}...` : 'Opening link...',
      });
    } catch (error) {
      events.emit('ui:notify', {
        type: 'error',
        message: `Failed to open URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }, []);

  /**
   * Map of shortcut numbers (1-9) to quick links
   */
  const shortcutMap = useMemo(() => {
    const map = new Map<number, QuickLink>();
    for (const link of links) {
      if (link.shortcut !== undefined && link.shortcut >= 1 && link.shortcut <= 9) {
        map.set(link.shortcut, link);
      }
    }
    return map;
  }, [links]);

  /**
   * Open a quick link by its keyboard shortcut number
   */
  const openByShortcut = useCallback(async (shortcut: number): Promise<boolean> => {
    if (!enabled) return false;

    const link = shortcutMap.get(shortcut);
    if (!link) return false;

    await openUrl(link.url, link.label);
    return true;
  }, [enabled, shortcutMap, openUrl]);

  /**
   * Open a quick link by its command name
   */
  const openByCommand = useCallback(async (command: string): Promise<boolean> => {
    if (!enabled) return false;

    const link = links.find(l => l.command === command);
    if (!link) return false;

    await openUrl(link.url, link.label);
    return true;
  }, [enabled, links, openUrl]);

  /**
   * Open the Canopy config folder and create empty config if needed
   */
  const openConfigFolder = useCallback(async (): Promise<void> => {
    try {
      // Respect XDG_CONFIG_HOME on Linux
      const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
      const configDir = path.join(configHome, 'canopy');
      const configPath = path.join(configDir, 'config.json');

      // Ensure the directory exists
      await fs.ensureDir(configDir);

      // Create empty config if it doesn't exist
      const exists = await fs.pathExists(configPath);
      if (!exists) {
        const emptyConfig = {
          quickLinks: {
            enabled: true,
            links: []
          }
        };
        await fs.writeJson(configPath, emptyConfig, { spaces: 2 });
        events.emit('ui:notify', {
          type: 'info',
          message: 'Created empty config.json',
        });
      }

      // Open the config folder in the file manager
      await open(configDir);
      events.emit('ui:notify', {
        type: 'success',
        message: 'Opening config folder...',
      });
    } catch (error) {
      events.emit('ui:notify', {
        type: 'error',
        message: `Failed to open config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }, []);

  /**
   * Built-in slash commands that are always available
   */
  const builtinCommands = useMemo((): SlashCommand[] => [
    {
      name: 'config',
      label: 'Open Config Folder',
      description: 'Open Canopy configuration folder',
      isBuiltin: true,
      action: () => void openConfigFolder(),
    },
  ], [openConfigFolder]);

  /**
   * Convert quick links to slash commands for the command palette
   */
  const commands = useMemo((): SlashCommand[] => {
    // Start with built-in commands (always available)
    const allCommands = [...builtinCommands];

    // Add user-configured commands if quick links are enabled
    if (enabled) {
      const userCommands = links
        .filter(link => link.command) // Only links with command property
        .map(link => ({
          name: link.command!,
          label: link.label,
          description: `Open ${link.label}`,
          shortcut: link.shortcut,
          action: () => void openUrl(link.url, link.label),
        }));

      allCommands.push(...userCommands);
    }

    return allCommands;
  }, [enabled, links, openUrl, builtinCommands]);

  return {
    links,
    commands,
    shortcutMap,
    openUrl,
    openByShortcut,
    openByCommand,
    enabled,
  };
}
