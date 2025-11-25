import { useCallback, useMemo } from 'react';
import open from 'open';
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
   * Convert quick links to slash commands for the command palette
   */
  const commands = useMemo((): SlashCommand[] => {
    if (!enabled) return [];

    return links
      .filter(link => link.command) // Only links with command property
      .map(link => ({
        name: link.command!,
        label: link.label,
        description: `Open ${link.label}`,
        shortcut: link.shortcut,
        action: () => void openUrl(link.url, link.label),
      }));
  }, [enabled, links, openUrl]);

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
