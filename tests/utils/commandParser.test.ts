import { describe, it, expect, vi } from 'vitest';
import {
  parseCommand,
  findCommand,
  registerCommand,
  createCommandRegistry,
  executeCommand,
  type Command,
  type CommandContext,
} from '../../src/utils/commandParser.js';

describe('parseCommand', () => {
  it('parses explicit command with args', () => {
    const parsed = parseCommand('/filter .ts');
    expect(parsed.command).toBe('/filter');
    expect(parsed.args).toEqual(['.ts']);
    expect(parsed.rawInput).toBe('/filter .ts');
  });

  it('parses explicit command without args', () => {
    const parsed = parseCommand('/changed');
    expect(parsed.command).toBe('/changed');
    expect(parsed.args).toEqual([]);
  });

  it('parses command with multiple args', () => {
    const parsed = parseCommand('/git modified');
    expect(parsed.command).toBe('/git');
    expect(parsed.args).toEqual(['modified']);
  });

  it('treats free text as /filter command', () => {
    const parsed = parseCommand('component');
    expect(parsed.command).toBe('/filter');
    expect(parsed.args).toEqual(['component']);
  });

  it('treats multi-word free text as /filter', () => {
    const parsed = parseCommand('src utils');
    expect(parsed.command).toBe('/filter');
    expect(parsed.args).toEqual(['src utils']);
  });

  it('handles empty input', () => {
    const parsed = parseCommand('');
    expect(parsed.command).toBe('');
    expect(parsed.args).toEqual([]);
  });

  it('handles whitespace-only input', () => {
    const parsed = parseCommand('   ');
    expect(parsed.command).toBe('');
    expect(parsed.args).toEqual([]);
  });

  it('normalizes command to lowercase', () => {
    const parsed = parseCommand('/FILTER .ts');
    expect(parsed.command).toBe('/filter');
  });

  it('preserves case in arguments', () => {
    const parsed = parseCommand('/filter MyComponent');
    expect(parsed.args).toEqual(['MyComponent']);
  });
});

describe('findCommand', () => {
  const mockRegistry: Command[] = [
    {
      name: '/filter',
      aliases: ['/f'],
      description: 'Filter files',
      execute: async () => ({ success: true }),
    },
    {
      name: '/git',
      description: 'Git operations',
      execute: async () => ({ success: true }),
    },
  ];

  it('finds command by name', () => {
    const cmd = findCommand('/filter', mockRegistry);
    expect(cmd).not.toBeNull();
    expect(cmd?.name).toBe('/filter');
  });

  it('finds command by alias', () => {
    const cmd = findCommand('/f', mockRegistry);
    expect(cmd).not.toBeNull();
    expect(cmd?.name).toBe('/filter');
  });

  it('is case-insensitive', () => {
    const cmd = findCommand('/FILTER', mockRegistry);
    expect(cmd).not.toBeNull();
    expect(cmd?.name).toBe('/filter');
  });

  it('returns null for unknown command', () => {
    const cmd = findCommand('/unknown', mockRegistry);
    expect(cmd).toBeNull();
  });

  it('finds command without slash prefix', () => {
    const cmd = findCommand('filter', mockRegistry);
    // Should NOT find it - must use slash
    expect(cmd).toBeNull();
  });
});

describe('registerCommand', () => {
  it('registers a new command', () => {
    const registry: Command[] = [];
    const command: Command = {
      name: '/test',
      description: 'Test command',
      execute: async () => ({ success: true }),
    };

    registerCommand(registry, command);
    expect(registry.length).toBe(1);
    expect(registry[0]).toBe(command);
  });

  it('throws error if command has no name', () => {
    const registry: Command[] = [];
    const command = {
      name: '',
      description: 'Test',
      execute: async () => ({ success: true }),
    } as Command;

    expect(() => registerCommand(registry, command)).toThrow('must have a name');
  });

  it('throws error if command name missing /', () => {
    const registry: Command[] = [];
    const command: Command = {
      name: 'filter',
      description: 'Test',
      execute: async () => ({ success: true }),
    };

    expect(() => registerCommand(registry, command)).toThrow('must start with /');
  });

  it('throws error if command has no description', () => {
    const registry: Command[] = [];
    const command = {
      name: '/test',
      description: '',
      execute: async () => ({ success: true }),
    } as Command;

    expect(() => registerCommand(registry, command)).toThrow('must have a description');
  });

  it('throws error if command has no execute function', () => {
    const registry: Command[] = [];
    const command = {
      name: '/test',
      description: 'Test',
    } as Command;

    expect(() => registerCommand(registry, command)).toThrow('must have an execute function');
  });

  it('warns and overwrites duplicate command', () => {
    const registry: Command[] = [];
    const command1: Command = {
      name: '/test',
      description: 'Test 1',
      execute: async () => ({ success: true, message: '1' }),
    };
    const command2: Command = {
      name: '/test',
      description: 'Test 2',
      execute: async () => ({ success: true, message: '2' }),
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    registerCommand(registry, command1);
    registerCommand(registry, command2);

    expect(registry.length).toBe(1);
    expect(registry[0]).toBe(command2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already registered'));

    warnSpy.mockRestore();
  });

  it('throws error if alias conflicts with existing command', () => {
    const registry: Command[] = [];
    const command1: Command = {
      name: '/filter',
      description: 'Filter',
      execute: async () => ({ success: true }),
    };
    const command2: Command = {
      name: '/search',
      aliases: ['/filter'],
      description: 'Search',
      execute: async () => ({ success: true }),
    };

    registerCommand(registry, command1);
    expect(() => registerCommand(registry, command2)).toThrow('conflicts with existing command');
  });

  it('throws error if alias conflicts with existing alias', () => {
    const registry: Command[] = [];
    const command1: Command = {
      name: '/filter',
      aliases: ['/f'],
      description: 'Filter',
      execute: async () => ({ success: true }),
    };
    const command2: Command = {
      name: '/search',
      aliases: ['/f'],
      description: 'Search',
      execute: async () => ({ success: true }),
    };

    registerCommand(registry, command1);
    expect(() => registerCommand(registry, command2)).toThrow('conflicts with existing command');
  });
});

describe('createCommandRegistry', () => {
  it('creates registry with built-in commands', () => {
    const registry = createCommandRegistry();
    expect(registry.length).toBeGreaterThan(0);
  });

  it('includes /filter command', () => {
    const registry = createCommandRegistry();
    const cmd = findCommand('/filter', registry);
    expect(cmd).not.toBeNull();
    expect(cmd?.name).toBe('/filter');
  });

  it('includes /git command', () => {
    const registry = createCommandRegistry();
    const cmd = findCommand('/git', registry);
    expect(cmd).not.toBeNull();
  });

  it('includes /changed command', () => {
    const registry = createCommandRegistry();
    const cmd = findCommand('/changed', registry);
    expect(cmd).not.toBeNull();
  });

  it('includes /open command', () => {
    const registry = createCommandRegistry();
    const cmd = findCommand('/open', registry);
    expect(cmd).not.toBeNull();
  });

  it('supports command aliases', () => {
    const registry = createCommandRegistry();
    const cmd = findCommand('/f', registry); // Alias for /filter
    expect(cmd).not.toBeNull();
    expect(cmd?.name).toBe('/filter');
  });

  it('supports /g alias for /git', () => {
    const registry = createCommandRegistry();
    const cmd = findCommand('/g', registry);
    expect(cmd).not.toBeNull();
    expect(cmd?.name).toBe('/git');
  });

  it('supports /c alias for /changed', () => {
    const registry = createCommandRegistry();
    const cmd = findCommand('/c', registry);
    expect(cmd).not.toBeNull();
    expect(cmd?.name).toBe('/changed');
  });

  it('supports /o alias for /open', () => {
    const registry = createCommandRegistry();
    const cmd = findCommand('/o', registry);
    expect(cmd).not.toBeNull();
    expect(cmd?.name).toBe('/open');
  });

  it('supports /ct alias for /copytree', () => {
    const registry = createCommandRegistry();
    const cmd = findCommand('/ct', registry);
    expect(cmd).not.toBeNull();
    expect(cmd?.name).toBe('/copytree');
  });
});

describe('executeCommand', () => {
  // Mock context
  function createMockContext(): CommandContext {
    return {
      state: {} as any,
      setState: vi.fn(),
      config: {} as any,
      notify: vi.fn(),
    };
  }

  it('executes explicit command', async () => {
    const executeFn = vi.fn(async () => ({ success: true, message: 'OK' }));
    const registry: Command[] = [
      {
        name: '/test',
        description: 'Test',
        execute: executeFn,
      },
    ];
    const context = createMockContext();

    const result = await executeCommand('/test arg1', registry, context);

    expect(result.success).toBe(true);
    expect(executeFn).toHaveBeenCalledWith(['arg1'], context);
  });

  it('passes multiple args to command', async () => {
    const executeFn = vi.fn(async () => ({ success: true }));
    const registry: Command[] = [
      {
        name: '/test',
        description: 'Test',
        execute: executeFn,
      },
    ];
    const context = createMockContext();

    await executeCommand('/test arg1 arg2 arg3', registry, context);

    expect(executeFn).toHaveBeenCalledWith(['arg1', 'arg2', 'arg3'], context);
  });

  it('resolves command aliases', async () => {
    const executeFn = vi.fn(async () => ({ success: true }));
    const registry: Command[] = [
      {
        name: '/filter',
        aliases: ['/f'],
        description: 'Filter',
        execute: executeFn,
      },
    ];
    const context = createMockContext();

    await executeCommand('/f pattern', registry, context);

    expect(executeFn).toHaveBeenCalledWith(['pattern'], context);
  });

  it('treats free text as /filter command', async () => {
    const filterFn = vi.fn(async () => ({ success: true }));
    const registry: Command[] = [
      {
        name: '/filter',
        description: 'Filter',
        execute: filterFn,
      },
    ];
    const context = createMockContext();

    await executeCommand('component', registry, context);

    expect(filterFn).toHaveBeenCalledWith(['component'], context);
  });

  it('returns error for unknown slash command (not treated as filter)', async () => {
    const filterFn = vi.fn(async () => ({ success: true }));
    const registry: Command[] = [
      {
        name: '/filter',
        description: 'Filter',
        execute: filterFn,
      },
    ];
    const context = createMockContext();

    const result = await executeCommand('/unknown test', registry, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown command: /unknown');
    expect(filterFn).not.toHaveBeenCalled();
  });

  it('returns error for unknown command when /filter is missing', async () => {
    const registry: Command[] = [
      {
        name: '/git',
        description: 'Git',
        execute: async () => ({ success: true }),
      },
    ];
    const context = createMockContext();

    const result = await executeCommand('/unknown', registry, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown command: /unknown');
  });

  it('returns error for empty input', async () => {
    const registry: Command[] = [];
    const context = createMockContext();

    const result = await executeCommand('', registry, context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Empty command');
  });

  it('handles command execution errors', async () => {
    const executeFn = vi.fn(async () => {
      throw new Error('Test error');
    });
    const registry: Command[] = [
      {
        name: '/test',
        description: 'Test',
        execute: executeFn,
      },
    ];
    const context = createMockContext();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await executeCommand('/test', registry, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Command failed');
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('returns command result on success', async () => {
    const executeFn = vi.fn(async () => ({
      success: true,
      message: 'Command executed successfully',
    }));
    const registry: Command[] = [
      {
        name: '/test',
        description: 'Test',
        execute: executeFn,
      },
    ];
    const context = createMockContext();

    const result = await executeCommand('/test', registry, context);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Command executed successfully');
  });

  it('returns command result on failure', async () => {
    const executeFn = vi.fn(async () => ({
      success: false,
      error: 'Invalid arguments',
    }));
    const registry: Command[] = [
      {
        name: '/test',
        description: 'Test',
        execute: executeFn,
      },
    ];
    const context = createMockContext();

    const result = await executeCommand('/test', registry, context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid arguments');
  });
});

describe('Built-in commands integration', () => {
  function createMockContext(): CommandContext {
    return {
      state: {
        filterActive: false,
        filterQuery: '',
        filteredPaths: [],
        selectedPath: '',
      } as any,
      setState: vi.fn(),
      config: {} as any,
      notify: vi.fn(),
    };
  }

  describe('/filter command', () => {
    it('sets filter state when given a pattern', async () => {
      const registry = createCommandRegistry();
      const context = createMockContext();

      const result = await executeCommand('/filter .ts', registry, context);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Filtering by: .ts');
      expect(context.setState).toHaveBeenCalledWith({
        filterActive: true,
        filterQuery: '.ts',
      });
      expect(context.notify).toHaveBeenCalledWith({
        type: 'info',
        message: 'Filter: .ts',
      });
    });

    it('clears filter when given "clear" argument', async () => {
      const registry = createCommandRegistry();
      const context = createMockContext();

      const result = await executeCommand('/filter clear', registry, context);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Filter cleared');
      expect(context.setState).toHaveBeenCalledWith({
        filterActive: false,
        filterQuery: '',
        filteredPaths: [],
      });
      expect(context.notify).toHaveBeenCalledWith({
        type: 'info',
        message: 'Filter cleared',
      });
    });

    it('returns error when no arguments provided', async () => {
      const registry = createCommandRegistry();
      const context = createMockContext();

      const result = await executeCommand('/filter', registry, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Usage');
    });
  });

  describe('/git command', () => {
    it('sets git filter for valid status', async () => {
      const registry = createCommandRegistry();
      const context = createMockContext();

      const result = await executeCommand('/git modified', registry, context);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Filtering by git status: modified');
      expect(context.setState).toHaveBeenCalledWith({
        filterActive: true,
        filterQuery: 'git:modified',
      });
      expect(context.notify).toHaveBeenCalledWith({
        type: 'info',
        message: 'Git filter: modified',
      });
    });

    it('returns error for invalid status', async () => {
      const registry = createCommandRegistry();
      const context = createMockContext();

      const result = await executeCommand('/git invalid', registry, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Usage');
    });

    it('returns error when no arguments provided', async () => {
      const registry = createCommandRegistry();
      const context = createMockContext();

      const result = await executeCommand('/git', registry, context);

      expect(result.success).toBe(false);
    });
  });

  describe('/changed command', () => {
    it('sets filter for any git changes', async () => {
      const registry = createCommandRegistry();
      const context = createMockContext();

      const result = await executeCommand('/changed', registry, context);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Showing all changed files');
      expect(context.setState).toHaveBeenCalledWith({
        filterActive: true,
        filterQuery: 'git:any',
      });
      expect(context.notify).toHaveBeenCalledWith({
        type: 'info',
        message: 'Showing all changed files',
      });
    });
  });

  describe('/open command', () => {
    it('sets selected path', async () => {
      const registry = createCommandRegistry();
      const context = createMockContext();

      const result = await executeCommand('/open src/App.tsx', registry, context);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Opened src/App.tsx');
      expect(context.setState).toHaveBeenCalledWith({
        selectedPath: 'src/App.tsx',
      });
      expect(context.notify).toHaveBeenCalledWith({
        type: 'success',
        message: 'Selected: src/App.tsx',
      });
    });

    it('handles paths with spaces', async () => {
      const registry = createCommandRegistry();
      const context = createMockContext();

      const result = await executeCommand('/open my file.txt', registry, context);

      expect(result.success).toBe(true);
      expect(context.setState).toHaveBeenCalledWith({
        selectedPath: 'my file.txt',
      });
    });

    it('returns error when no path provided', async () => {
      const registry = createCommandRegistry();
      const context = createMockContext();

      const result = await executeCommand('/open', registry, context);

      expect(result.success).toBe(false);
    });
  });
});
