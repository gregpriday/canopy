import type { CommandDefinition } from '../types.js';
import { events } from '../../services/events.js';

export const treeCommand: CommandDefinition = {
  name: 'tree',
  description: 'Switch to traditional tree view for file navigation',
  aliases: ['browse'],
  usage: '/tree or /browse',

  execute: async (args, { ui }) => {
    events.emit('ui:view:mode', { mode: 'tree' });
    ui.notify({ type: 'info', message: 'Switched to Tree View' });
    return { success: true };
  },
};
