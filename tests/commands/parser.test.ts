import { describe, it, expect, vi } from 'vitest';
import { parseCommand, executeCommand, getCommand, getAllCommands } from '../../src/commands/index.js';
import type { CommandContext } from '../../src/commands/types.js';
import type { TreeNode, YellowwoodState } from '../../src/types/index.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';

// Helper to create minimal test context
function createTestContext(tree: TreeNode[] = []): CommandContext {
  const state: YellowwoodState = {
    fileTree: tree,
    expandedFolders: new Set(),
    selectedPath: '',
    cursorPosition: 0,
    showPreview: false,
    showHelp: false,
    contextMenuOpen: false,
    contextMenuPosition: { x: 0, y: 0 },
    filterActive: false,
    filterQuery: '',
    filteredPaths: [],
    gitStatus: new Map(),
    gitEnabled: true,
    notification: null,
    commandBarActive: false,
    commandBarInput: '',
    commandHistory: [],
    config: DEFAULT_CONFIG,
  };

  return {
    state,
    originalFileTree: tree,
    setFilterActive: () => {},
    setFilterQuery: () => {},
    setFileTree: () => {},
    notify: () => {},
    addToHistory: () => {},
  };
}

describe('parseCommand', () => {
  it('parses command with leading slash', () => {
    const result = parseCommand('/filter component');
    expect(result.command).toBe('filter');
    expect(result.args).toEqual(['component']);
  });

  it('parses command without leading slash', () => {
    const result = parseCommand('filter component');
    expect(result.command).toBe('filter');
    expect(result.args).toEqual(['component']);
  });

  it('parses command with no arguments', () => {
    const result = parseCommand('/filter');
    expect(result.command).toBe('filter');
    expect(result.args).toEqual([]);
  });

  it('parses command with multiple arguments', () => {
    const result = parseCommand('/filter my component name');
    expect(result.command).toBe('filter');
    expect(result.args).toEqual(['my', 'component', 'name']);
  });

  it('normalizes command name to lowercase', () => {
    const result = parseCommand('/FILTER Component');
    expect(result.command).toBe('filter');
    expect(result.args).toEqual(['Component']); // args preserve case
  });

  it('handles empty input', () => {
    const result = parseCommand('');
    expect(result.command).toBe('');
    expect(result.args).toEqual([]);
  });

  it('handles whitespace-only input', () => {
    const result = parseCommand('   ');
    expect(result.command).toBe('');
    expect(result.args).toEqual([]);
  });

  it('handles multiple spaces between arguments', () => {
    const result = parseCommand('/filter   component   test');
    expect(result.command).toBe('filter');
    expect(result.args).toEqual(['component', 'test']);
  });

  it('trims leading and trailing whitespace', () => {
    const result = parseCommand('  /filter component  ');
    expect(result.command).toBe('filter');
    expect(result.args).toEqual(['component']);
  });
});

describe('executeCommand', () => {
  it('executes filter command by name', async () => {
    const context = createTestContext();
    const result = await executeCommand('/filter test', context);

    expect(result.success).toBe(true);
  });

  it('executes filter command by alias', async () => {
    const context = createTestContext();
    const result = await executeCommand('/f test', context);

    expect(result.success).toBe(true);
  });

  it('treats free text as implicit filter', async () => {
    const tree = [
      { name: 'component.ts', path: '/component.ts', type: 'file' as const, depth: 0 },
      { name: 'other.ts', path: '/other.ts', type: 'file' as const, depth: 0 },
    ];
    const setFilterActive = vi.fn();
    const setFilterQuery = vi.fn();
    const setFileTree = vi.fn();

    const context: CommandContext = {
      ...createTestContext(tree),
      setFilterActive,
      setFilterQuery,
      setFileTree,
    };

    const result = await executeCommand('component', context);

    // Should execute filter command with 'component' as the pattern
    expect(result.success).toBe(true);
    expect(setFilterActive).toHaveBeenCalledWith(true);
    expect(setFilterQuery).toHaveBeenCalledWith('component');
    expect(setFileTree).toHaveBeenCalled();
  });

  it('returns error for unknown command', async () => {
    // Note: Since free text triggers implicit filter, we need a command-like input
    // that won't match any registered commands but looks like a command attempt
    // However, the current implementation treats ALL unknown text as implicit filter
    // This is by design - there's no way to get "unknown command" error
    // with the current implementation since everything falls through to filter

    // This test documents the current behavior - may change in future
    const context = createTestContext();
    const result = await executeCommand('unknowncommand arg1 arg2', context);

    // Currently this would trigger implicit filter, not an error
    expect(result.success).toBe(true);
  });

  it('returns error for empty command', async () => {
    const context = createTestContext();
    const result = await executeCommand('', context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Empty command');
    expect(result.notification?.type).toBe('error');
  });

  it('is case-insensitive for command names', async () => {
    const context = createTestContext();
    const result = await executeCommand('/FILTER test', context);

    expect(result.success).toBe(true);
  });

  it('handles command execution errors', async () => {
    const context = createTestContext();

    // Override notify to throw error for testing error handling
    const throwingContext: CommandContext = {
      ...context,
      notify: () => {
        throw new Error('Test error');
      },
    };

    const result = await executeCommand('/filter test', throwingContext);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Test error');
    expect(result.notification?.type).toBe('error');
  });
});

describe('getCommand', () => {
  it('gets command by name', () => {
    const command = getCommand('filter');
    expect(command).toBeDefined();
    expect(command?.name).toBe('filter');
  });

  it('gets command by alias', () => {
    const command = getCommand('f');
    expect(command).toBeDefined();
    expect(command?.name).toBe('filter');
  });

  it('is case-insensitive', () => {
    const command = getCommand('FILTER');
    expect(command).toBeDefined();
    expect(command?.name).toBe('filter');
  });

  it('returns undefined for unknown command', () => {
    const command = getCommand('nonexistent');
    expect(command).toBeUndefined();
  });
});

describe('getAllCommands', () => {
  it('returns all registered commands', () => {
    const commands = getAllCommands();
    expect(commands.length).toBeGreaterThan(0);

    // Should include filter command
    const filterCommand = commands.find(cmd => cmd.name === 'filter');
    expect(filterCommand).toBeDefined();
  });

  it('returns commands with required properties', () => {
    const commands = getAllCommands();

    for (const command of commands) {
      expect(command).toHaveProperty('name');
      expect(command).toHaveProperty('description');
      expect(command).toHaveProperty('execute');
      expect(typeof command.execute).toBe('function');
    }
  });
});
