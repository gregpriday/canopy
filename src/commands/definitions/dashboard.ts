import type { CommandDefinition } from '../types.js';
import { events } from '../../services/events.js';

export const dashboardCommand: CommandDefinition = {
  name: 'dashboard',
  description: 'Switch to dashboard view showing worktree overview',
  aliases: ['overview'],
  usage: '/dashboard or /overview',

  execute: async (args, { ui }) => {
    events.emit('ui:view:mode', { mode: 'dashboard' });
    ui.notify({ type: 'info', message: 'Switched to Dashboard View' });
    return { success: true };
  },
};
