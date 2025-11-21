import type { CommandDefinition } from '../types.js';
import { events } from '../../services/events.js';

export const worktreeCommand: CommandDefinition = {
  name: 'wt',
  description: 'Switch between git worktrees',
  aliases: ['worktree'],
  usage: '/wt [list|next|prev|<pattern>]',

  execute: async (args, { ui }) => {
    const [subcommand, ...rest] = args;

    // No args or "list" → open panel
    if (!subcommand || subcommand === 'list') {
      ui.notify({ type: 'info', message: 'Opening worktree panel…' });
      events.emit('ui:modal:open', { id: 'worktree' });
      return { success: true };
    }

    // "next" or "prev" → cycle
    if (subcommand === 'next' || subcommand === 'prev') {
      const direction = subcommand === 'prev' ? -1 : 1;
      events.emit('sys:worktree:cycle', { direction });
      return { success: true };
    }

    // Anything else → treat as pattern to match
    const query = [subcommand, ...rest].join(' ');
    events.emit('sys:worktree:selectByName', { query });
    return { success: true };
  },
};
