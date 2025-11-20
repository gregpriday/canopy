import type { CommandDefinition } from '../types.js';

export const exitCommand: CommandDefinition = {
  name: 'exit',
  description: 'Exits the Canopy application',
  aliases: ['quit'],
  
  execute: async (_args, { ui }) => {
    ui.notify({ type: 'info', message: 'Exiting Canopy...' });
    ui.exit();
    return {
      success: true,
      message: 'Exited application.'
    };
  }
};
