import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/utils/config.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('loadConfig', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for test files
    tempDir = path.join(os.tmpdir(), `canopy-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    // Clean up
    await fs.remove(tempDir);
  });

  it('returns DEFAULT_CONFIG when no config files exist', async () => {
    const config = await loadConfig(tempDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('loads project config from .canopy.json', async () => {
    const projectConfig = { editor: 'vim', treeIndent: 4 };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), projectConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('vim');
    expect(config.treeIndent).toBe(4);
    expect(config.showHidden).toBe(DEFAULT_CONFIG.showHidden); // Other fields from default
  });

  it('merges partial config with defaults', async () => {
    const partialConfig = { showHidden: true };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), partialConfig);

    const config = await loadConfig(tempDir);
    expect(config.showHidden).toBe(true);
    expect(config.editor).toBe(DEFAULT_CONFIG.editor);
    expect(config.treeIndent).toBe(DEFAULT_CONFIG.treeIndent);
  });

  it('handles malformed JSON gracefully', async () => {
    await fs.writeFile(path.join(tempDir, '.canopy.json'), '{ invalid json }');

    // Should not throw, should fall back to defaults
    const config = await loadConfig(tempDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('validates config types and throws on invalid values', async () => {
    const invalidConfig = { treeIndent: 'not a number' };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('treeIndent must be a non-negative number');
  });

  it('deep merges nested objects like copytreeDefaults', async () => {
    const projectConfig = {
      copytreeDefaults: {
        format: 'markdown',
        // asReference not specified - should keep default true
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), projectConfig);

    const config = await loadConfig(tempDir);
    expect(config.copytreeDefaults.format).toBe('markdown');
    expect(config.copytreeDefaults.asReference).toBe(true); // From DEFAULT_CONFIG
  });

  it('validates all boolean fields', async () => {
    const invalidConfig = { showHidden: 'yes' }; // Should be boolean
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('showHidden must be a boolean');
  });

  it('validates theme field accepts only valid values', async () => {
    const invalidConfig = { theme: 'invalid' };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('theme must be "auto", "dark", or "light"');
  });

  it('validates sortBy field accepts only valid values', async () => {
    const invalidConfig = { sortBy: 'invalid' };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('sortBy must be "name", "size", "modified", or "type"');
  });

  it('validates sortDirection field accepts only valid values', async () => {
    const invalidConfig = { sortDirection: 'invalid' };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('sortDirection must be "asc" or "desc"');
  });

  it('validates editorArgs is an array', async () => {
    const invalidConfig = { editorArgs: 'not-an-array' };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('editorArgs must be an array');
  });

  it('validates customIgnores is an array', async () => {
    const invalidConfig = { customIgnores: 'not-an-array' };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('customIgnores must be an array');
  });

  it('validates maxDepth is null or non-negative number', async () => {
    const invalidConfig = { maxDepth: -1 };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('maxDepth must be null or a non-negative number');
  });

  it('validates refreshDebounce is non-negative number', async () => {
    const invalidConfig = { refreshDebounce: -100 };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('refreshDebounce must be a non-negative number');
  });

  it('validates copytreeDefaults.format is a string', async () => {
    const invalidConfig = {
      copytreeDefaults: {
        format: 123,
        asReference: true,
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('copytreeDefaults.format must be a string');
  });

  it('validates copytreeDefaults.asReference is a boolean', async () => {
    const invalidConfig = {
      copytreeDefaults: {
        format: 'xml',
        asReference: 'yes',
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('copytreeDefaults.asReference must be a boolean');
  });

  it('accepts maxDepth as null', async () => {
    const validConfig = { maxDepth: null };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), validConfig);

    const config = await loadConfig(tempDir);
    expect(config.maxDepth).toBe(null);
  });

  it('loads config from canopy.config.json if present', async () => {
    const projectConfig = { editor: 'nano' };
    await fs.writeJSON(path.join(tempDir, 'canopy.config.json'), projectConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('nano');
  });

  it('loads config from .canopyrc if present', async () => {
    const projectConfig = { editor: 'emacs' };
    await fs.writeJSON(path.join(tempDir, '.canopyrc'), projectConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('emacs');
  });

  it('prefers .canopy.json over other config files', async () => {
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), { editor: 'vim' });
    await fs.writeJSON(path.join(tempDir, 'canopy.config.json'), { editor: 'nano' });
    await fs.writeJSON(path.join(tempDir, '.canopyrc'), { editor: 'emacs' });

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('vim');
  });

  // Security tests
  it('prevents prototype pollution via __proto__ in config', async () => {
    const maliciousConfig = {
      editor: 'safe-editor',
      '__proto__': { polluted: 'value' },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), maliciousConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('safe-editor');
    // Verify prototype was not polluted
    expect((Object.prototype as any).polluted).toBeUndefined();
  });

  it('prevents prototype pollution via constructor in config', async () => {
    const maliciousConfig = {
      editor: 'safe-editor',
      'constructor': { malicious: 'value' },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), maliciousConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('safe-editor');
    // Config should still be valid and not contain constructor
    expect((config as any).constructor).not.toEqual({ malicious: 'value' });
  });

  // Null handling tests
  it('rejects null copytreeDefaults', async () => {
    const configWithNull = {
      editor: 'vim',
      copytreeDefaults: null,
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), configWithNull);

    // Validation should reject null copytreeDefaults
    await expect(loadConfig(tempDir)).rejects.toThrow('copytreeDefaults must be an object');
  });

  it('rejects array copytreeDefaults', async () => {
    const configWithArray = {
      editor: 'vim',
      copytreeDefaults: ['invalid', 'array'],
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), configWithArray);

    // Validation should reject array copytreeDefaults
    await expect(loadConfig(tempDir)).rejects.toThrow('copytreeDefaults.format must be a string');
  });

  // Additional validation tests
  it('validates showGitStatus is boolean', async () => {
    const invalidConfig = { showGitStatus: 'true' };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('showGitStatus must be a boolean');
  });

  it('validates showFileSize is boolean', async () => {
    const invalidConfig = { showFileSize: 1 };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('showFileSize must be a boolean');
  });

  it('validates showModifiedTime is boolean', async () => {
    const invalidConfig = { showModifiedTime: 'yes' };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('showModifiedTime must be a boolean');
  });

  it('validates respectGitignore is boolean', async () => {
    const invalidConfig = { respectGitignore: 1 };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('respectGitignore must be a boolean');
  });

  it('validates autoRefresh is boolean', async () => {
    const invalidConfig = { autoRefresh: 'true' };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('autoRefresh must be a boolean');
  });

  it('handles malformed project config with null value', async () => {
    await fs.writeFile(path.join(tempDir, '.canopy.json'), 'null');

    // Should fall back to defaults when project config is malformed
    const config = await loadConfig(tempDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('fills in missing copytreeDefaults from defaults', async () => {
    const partialConfig = {
      editor: 'vim',
      showHidden: true,
      // copytreeDefaults missing - should be filled from defaults
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), partialConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('vim');
    expect(config.showHidden).toBe(true);
    // Missing field should be filled from defaults
    expect(config.copytreeDefaults).toEqual(DEFAULT_CONFIG.copytreeDefaults);
  });

  it('validates copytreeProfiles entries', async () => {
    const invalidConfig = {
      copytreeProfiles: {
        bad: { args: '--flag' as any },
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('copytreeProfiles.bad.args must be an array of strings');
  });

  it('merges copytreeProfiles with defaults', async () => {
    const projectConfig = {
      copytreeProfiles: {
        default: { args: ['--custom-default'] },
        quick: { args: ['--depth', '1'] },
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), projectConfig);

    const config = await loadConfig(tempDir);

    expect(config.copytreeProfiles?.default.args).toEqual(['--custom-default']);
    expect(config.copytreeProfiles?.quick.args).toEqual(['--depth', '1']);
    expect(config.copytreeProfiles?.minimal).toBeDefined();
  });
});

// Global config tests
describe('loadConfig - global config', () => {
  let tempDir: string;
  let tempConfigHome: string;
  let originalXdgConfigHome: string | undefined;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `canopy-test-${Date.now()}`);
    tempConfigHome = path.join(os.tmpdir(), `canopy-config-${Date.now()}`);
    await fs.ensureDir(tempDir);
    await fs.ensureDir(tempConfigHome);

    // Save original XDG_CONFIG_HOME
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    // Set temp config home
    process.env.XDG_CONFIG_HOME = tempConfigHome;
  });

  afterEach(async () => {
    // Restore original XDG_CONFIG_HOME
    if (originalXdgConfigHome !== undefined) {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }

    // Clean up
    await fs.remove(tempDir);
    await fs.remove(tempConfigHome);
  });

  it('loads global config from XDG_CONFIG_HOME', async () => {
    const globalConfig = { editor: 'global-editor', treeIndent: 8 };
    const globalPath = path.join(tempConfigHome, 'canopy', 'config.json');
    await fs.ensureDir(path.dirname(globalPath));
    await fs.writeJSON(globalPath, globalConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('global-editor');
    expect(config.treeIndent).toBe(8);
  });

  it('project config overrides global config', async () => {
    // Set up global config
    const globalConfig = { editor: 'global-editor', treeIndent: 8 };
    const globalPath = path.join(tempConfigHome, 'canopy', 'config.json');
    await fs.ensureDir(path.dirname(globalPath));
    await fs.writeJSON(globalPath, globalConfig);

    // Set up project config
    const projectConfig = { editor: 'project-editor' };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), projectConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('project-editor'); // Project overrides global
    expect(config.treeIndent).toBe(8); // Global value used when not in project config
  });

  it('global config overrides defaults', async () => {
    const globalConfig = { editor: 'global-editor', showHidden: true };
    const globalPath = path.join(tempConfigHome, 'canopy', 'config.json');
    await fs.ensureDir(path.dirname(globalPath));
    await fs.writeJSON(globalPath, globalConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('global-editor'); // From global
    expect(config.showHidden).toBe(true); // From global
    expect(config.treeIndent).toBe(DEFAULT_CONFIG.treeIndent); // From defaults
  });

  it('deep merges copytreeDefaults across global and project', async () => {
    // Global sets format
    const globalConfig = {
      copytreeDefaults: { format: 'markdown' },
    };
    const globalPath = path.join(tempConfigHome, 'canopy', 'config.json');
    await fs.ensureDir(path.dirname(globalPath));
    await fs.writeJSON(globalPath, globalConfig);

    // Project sets asReference
    const projectConfig = {
      copytreeDefaults: { asReference: false },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), projectConfig);

    const config = await loadConfig(tempDir);
    // Both values should be present (deep merge)
    expect(config.copytreeDefaults.format).toBe('markdown'); // From global
    expect(config.copytreeDefaults.asReference).toBe(false); // From project
  });

  it('handles malformed global config gracefully', async () => {
    const globalPath = path.join(tempConfigHome, 'canopy', 'config.json');
    await fs.ensureDir(path.dirname(globalPath));
    await fs.writeFile(globalPath, '{ invalid json }');

    // Should fall back to defaults and not crash
    const config = await loadConfig(tempDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('deep merges openers across global and project configs', async () => {
    // Global sets a .log extension opener
    const globalConfig = {
      openers: {
        default: { cmd: 'vim', args: [] },
        byExtension: { '.log': { cmd: 'less', args: ['+G'] } },
        byGlob: {},
      },
    };
    const globalPath = path.join(tempConfigHome, 'canopy', 'config.json');
    await fs.ensureDir(path.dirname(globalPath));
    await fs.writeJSON(globalPath, globalConfig);

    // Project adds a .ts extension opener
    const projectConfig = {
      openers: {
        byExtension: { '.ts': { cmd: 'code', args: ['-r'] } },
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), projectConfig);

    const config = await loadConfig(tempDir);
    // Both extension openers should be present
    expect(config.openers?.byExtension['.log']).toEqual({ cmd: 'less', args: ['+G'] });
    expect(config.openers?.byExtension['.ts']).toEqual({ cmd: 'code', args: ['-r'] });
    expect(config.openers?.default).toEqual({ cmd: 'vim', args: [] });
  });

  it('validates openers.default.cmd is a string', async () => {
    const invalidConfig = {
      openers: {
        default: { cmd: 123, args: [] },
        byExtension: {},
        byGlob: {},
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('openers.default.cmd must be a string');
  });

  it('validates openers.default.args is an array', async () => {
    const invalidConfig = {
      openers: {
        default: { cmd: 'code', args: 'not-an-array' },
        byExtension: {},
        byGlob: {},
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('openers.default.args must be an array');
  });

  it('validates openers.byExtension values have cmd and args', async () => {
    const invalidConfig = {
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: { '.log': { cmd: 'less', args: 'not-an-array' } },
        byGlob: {},
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('byExtension');
  });

  it('validates openers.byGlob values have cmd and args', async () => {
    const invalidConfig = {
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: {},
        byGlob: { 'tests/**/*.ts': { cmd: 123, args: [] } },
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('byGlob');
  });

  it('accepts valid openers configuration', async () => {
    const validConfig = {
      openers: {
        default: { cmd: 'code', args: ['-r'] },
        byExtension: { '.log': { cmd: 'less', args: ['+G'] } },
        byGlob: { 'tests/**/*.ts': { cmd: 'vitest', args: ['run'] } },
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), validConfig);

    const config = await loadConfig(tempDir);
    expect(config.openers).toEqual(validConfig.openers);
  });

  it('allows openers to be undefined for backward compatibility', async () => {
    const configWithoutOpeners = { editor: 'vim' };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), configWithoutOpeners);

    const config = await loadConfig(tempDir);
    // Config should be valid (openers is optional)
    expect(config.editor).toBe('vim');
  });

  it('validates editor must be a string', async () => {
    const invalidConfig = { editor: 42 };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('config.editor must be a string');
  });

  it('rejects openers that is not an object', async () => {
    const invalidConfig = { openers: null };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('config.openers must be an object');
  });

  it('rejects openers.default that is null', async () => {
    const invalidConfig = {
      openers: {
        default: null,
        byExtension: {},
        byGlob: {},
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('config.openers.default must be an object');
  });

  it('rejects openers.byExtension that is an array', async () => {
    const invalidConfig = {
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: [],
        byGlob: {},
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('config.openers.byExtension must be an object');
  });

  it('rejects openers.byGlob that is not an object', async () => {
    const invalidConfig = {
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: {},
        byGlob: 'not-an-object',
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('config.openers.byGlob must be an object');
  });

  it('validates args elements are strings in byExtension', async () => {
    const invalidConfig = {
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: { '.log': { cmd: 'less', args: [123] } },
        byGlob: {},
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('args[0] must be a string');
  });

  it('validates both cmd and args for byExtension entries', async () => {
    const invalidConfig = {
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: { '.log': { cmd: 123, args: [] } },
        byGlob: {},
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('cmd must be a string');
  });

  it('validates both cmd and args for byGlob entries', async () => {
    const invalidConfig1 = {
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: {},
        byGlob: { '*.test.ts': { cmd: 'tool', args: 'oops' } },
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig1);

    await expect(loadConfig(tempDir)).rejects.toThrow('args must be an array');
  });

  it('validates args elements are strings in byGlob', async () => {
    const invalidConfig = {
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: {},
        byGlob: { '*.test.ts': { cmd: 'vitest', args: [true, 456] } },
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('args[0] must be a string');
  });

  it('deep merges byGlob across global and project configs', async () => {
    // Global sets one glob pattern
    const globalConfig = {
      openers: {
        default: { cmd: 'vim', args: [] },
        byExtension: {},
        byGlob: { '*.test.ts': { cmd: 'vitest', args: ['run'] } },
      },
    };
    const globalPath = path.join(tempConfigHome, 'canopy', 'config.json');
    await fs.ensureDir(path.dirname(globalPath));
    await fs.writeJSON(globalPath, globalConfig);

    // Project adds another glob pattern
    const projectConfig = {
      openers: {
        byGlob: { '*.spec.ts': { cmd: 'jest', args: [] } },
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), projectConfig);

    const config = await loadConfig(tempDir);
    // Both glob patterns should be present
    expect(config.openers?.byGlob['*.test.ts']).toEqual({ cmd: 'vitest', args: ['run'] });
    expect(config.openers?.byGlob['*.spec.ts']).toEqual({ cmd: 'jest', args: [] });
  });

  it('validates default opener args elements are strings', async () => {
    const invalidConfig = {
      openers: {
        default: { cmd: 'code', args: ['-r', 123, false] },
        byExtension: {},
        byGlob: {},
      },
    };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('args[1] must be a string');
  });
});

// Worktree-aware config tests
describe('loadConfig - worktree-aware loading', () => {
  let tempDir: string;
  let mainRepoPath: string;
  let worktreePath: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `canopy-worktree-config-test-${Date.now()}`);
    await fs.ensureDir(tempDir);

    // Create main repository path
    mainRepoPath = path.join(tempDir, 'main');
    await fs.ensureDir(mainRepoPath);

    // Create worktree path
    worktreePath = path.join(tempDir, 'feature');
    await fs.ensureDir(worktreePath);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('loads config from main repository when in a worktree', async () => {
    // Place config in main repository
    const mainConfig = { editor: 'main-repo-editor', treeIndent: 4 };
    await fs.writeJSON(path.join(mainRepoPath, '.canopy.json'), mainConfig);

    // Create mock worktrees
    const mainWorktree = {
      id: mainRepoPath,
      path: mainRepoPath,
      name: 'main',
      branch: 'main',
      isCurrent: false,
    };

    const featureWorktree = {
      id: worktreePath,
      path: worktreePath,
      name: 'feature',
      branch: 'feature/test',
      isCurrent: true,
    };

    // Load config from worktree context
    const config = await loadConfig(worktreePath, featureWorktree, [mainWorktree, featureWorktree]);

    // Should use config from main repository
    expect(config.editor).toBe('main-repo-editor');
    expect(config.treeIndent).toBe(4);
  });

  it('uses worktree-local config when in main repository', async () => {
    const mainConfig = { editor: 'main-editor', treeIndent: 2 };
    await fs.writeJSON(path.join(mainRepoPath, '.canopy.json'), mainConfig);

    const mainWorktree = {
      id: mainRepoPath,
      path: mainRepoPath,
      name: 'main',
      branch: 'main',
      isCurrent: true,
    };

    // When current worktree IS the main worktree, use local config
    const config = await loadConfig(mainRepoPath, mainWorktree, [mainWorktree]);

    expect(config.editor).toBe('main-editor');
    expect(config.treeIndent).toBe(2);
  });

  it('falls back to defaults when main repository has no config', async () => {
    // No config in main repository
    const mainWorktree = {
      id: mainRepoPath,
      path: mainRepoPath,
      name: 'main',
      branch: 'main',
      isCurrent: false,
    };

    const featureWorktree = {
      id: worktreePath,
      path: worktreePath,
      name: 'feature',
      branch: 'feature/test',
      isCurrent: true,
    };

    const config = await loadConfig(worktreePath, featureWorktree, [mainWorktree, featureWorktree]);

    // Should use defaults
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('handles case when main repository path does not exist', async () => {
    const nonExistentMain = path.join(tempDir, 'non-existent-main');

    const mainWorktree = {
      id: nonExistentMain,
      path: nonExistentMain,
      name: 'main',
      branch: 'main',
      isCurrent: false,
    };

    const featureWorktree = {
      id: worktreePath,
      path: worktreePath,
      name: 'feature',
      branch: 'feature/test',
      isCurrent: true,
    };

    // Should fall back to searching from current worktree
    const config = await loadConfig(worktreePath, featureWorktree, [mainWorktree, featureWorktree]);

    // Should use defaults (no config found)
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('ignores worktree-local config in favor of main repo config', async () => {
    // Place different configs in both locations
    const mainConfig = { editor: 'main-editor', treeIndent: 4 };
    await fs.writeJSON(path.join(mainRepoPath, '.canopy.json'), mainConfig);

    const worktreeConfig = { editor: 'worktree-editor', treeIndent: 8 };
    await fs.writeJSON(path.join(worktreePath, '.canopy.json'), worktreeConfig);

    const mainWorktree = {
      id: mainRepoPath,
      path: mainRepoPath,
      name: 'main',
      branch: 'main',
      isCurrent: false,
    };

    const featureWorktree = {
      id: worktreePath,
      path: worktreePath,
      name: 'feature',
      branch: 'feature/test',
      isCurrent: true,
    };

    const config = await loadConfig(worktreePath, featureWorktree, [mainWorktree, featureWorktree]);

    // Should prefer main repository config
    expect(config.editor).toBe('main-editor');
    expect(config.treeIndent).toBe(4);
  });

  it('works when currentWorktree is null (not a git repo)', async () => {
    const localConfig = { editor: 'local-editor' };
    await fs.writeJSON(path.join(tempDir, '.canopy.json'), localConfig);

    // Not in a git repo - currentWorktree and worktrees are null/empty
    const config = await loadConfig(tempDir, null, []);

    expect(config.editor).toBe('local-editor');
  });

  it('works when worktrees array is empty', async () => {
    const localConfig = { editor: 'local-editor' };
    await fs.writeJSON(path.join(mainRepoPath, '.canopy.json'), localConfig);

    const mainWorktree = {
      id: mainRepoPath,
      path: mainRepoPath,
      name: 'main',
      branch: 'main',
      isCurrent: true,
    };

    // Empty worktrees array
    const config = await loadConfig(mainRepoPath, mainWorktree, []);

    expect(config.editor).toBe('local-editor');
  });
});
