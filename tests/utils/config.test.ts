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
    tempDir = path.join(os.tmpdir(), `yellowwood-test-${Date.now()}`);
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

  it('loads project config from .yellowwood.json', async () => {
    const projectConfig = { editor: 'vim', treeIndent: 4 };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), projectConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('vim');
    expect(config.treeIndent).toBe(4);
    expect(config.showHidden).toBe(DEFAULT_CONFIG.showHidden); // Other fields from default
  });

  it('merges partial config with defaults', async () => {
    const partialConfig = { showHidden: true };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), partialConfig);

    const config = await loadConfig(tempDir);
    expect(config.showHidden).toBe(true);
    expect(config.editor).toBe(DEFAULT_CONFIG.editor);
    expect(config.treeIndent).toBe(DEFAULT_CONFIG.treeIndent);
  });

  it('handles malformed JSON gracefully', async () => {
    await fs.writeFile(path.join(tempDir, '.yellowwood.json'), '{ invalid json }');

    // Should not throw, should fall back to defaults
    const config = await loadConfig(tempDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('validates config types and throws on invalid values', async () => {
    const invalidConfig = { treeIndent: 'not a number' };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('treeIndent must be a non-negative number');
  });

  it('deep merges nested objects like copytreeDefaults', async () => {
    const projectConfig = {
      copytreeDefaults: {
        format: 'markdown',
        // asReference not specified - should keep default true
      },
    };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), projectConfig);

    const config = await loadConfig(tempDir);
    expect(config.copytreeDefaults.format).toBe('markdown');
    expect(config.copytreeDefaults.asReference).toBe(true); // From DEFAULT_CONFIG
  });

  it('validates all boolean fields', async () => {
    const invalidConfig = { showHidden: 'yes' }; // Should be boolean
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('showHidden must be a boolean');
  });

  it('validates theme field accepts only valid values', async () => {
    const invalidConfig = { theme: 'invalid' };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('theme must be "auto", "dark", or "light"');
  });

  it('validates sortBy field accepts only valid values', async () => {
    const invalidConfig = { sortBy: 'invalid' };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('sortBy must be "name", "size", "modified", or "type"');
  });

  it('validates sortDirection field accepts only valid values', async () => {
    const invalidConfig = { sortDirection: 'invalid' };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('sortDirection must be "asc" or "desc"');
  });

  it('validates editorArgs is an array', async () => {
    const invalidConfig = { editorArgs: 'not-an-array' };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('editorArgs must be an array');
  });

  it('validates customIgnores is an array', async () => {
    const invalidConfig = { customIgnores: 'not-an-array' };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('customIgnores must be an array');
  });

  it('validates maxDepth is null or non-negative number', async () => {
    const invalidConfig = { maxDepth: -1 };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('maxDepth must be null or a non-negative number');
  });

  it('validates refreshDebounce is non-negative number', async () => {
    const invalidConfig = { refreshDebounce: -100 };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('refreshDebounce must be a non-negative number');
  });

  it('validates copytreeDefaults.format is a string', async () => {
    const invalidConfig = {
      copytreeDefaults: {
        format: 123,
        asReference: true,
      },
    };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('copytreeDefaults.format must be a string');
  });

  it('validates copytreeDefaults.asReference is a boolean', async () => {
    const invalidConfig = {
      copytreeDefaults: {
        format: 'xml',
        asReference: 'yes',
      },
    };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('copytreeDefaults.asReference must be a boolean');
  });

  it('accepts maxDepth as null', async () => {
    const validConfig = { maxDepth: null };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), validConfig);

    const config = await loadConfig(tempDir);
    expect(config.maxDepth).toBe(null);
  });

  it('loads config from yellowwood.config.json if present', async () => {
    const projectConfig = { editor: 'nano' };
    await fs.writeJSON(path.join(tempDir, 'yellowwood.config.json'), projectConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('nano');
  });

  it('loads config from .yellowwoodrc if present', async () => {
    const projectConfig = { editor: 'emacs' };
    await fs.writeJSON(path.join(tempDir, '.yellowwoodrc'), projectConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('emacs');
  });

  it('prefers .yellowwood.json over other config files', async () => {
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), { editor: 'vim' });
    await fs.writeJSON(path.join(tempDir, 'yellowwood.config.json'), { editor: 'nano' });
    await fs.writeJSON(path.join(tempDir, '.yellowwoodrc'), { editor: 'emacs' });

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('vim');
  });

  // Security tests
  it('prevents prototype pollution via __proto__ in config', async () => {
    const maliciousConfig = {
      editor: 'safe-editor',
      '__proto__': { polluted: 'value' },
    };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), maliciousConfig);

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
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), maliciousConfig);

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
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), configWithNull);

    // Validation should reject null copytreeDefaults
    await expect(loadConfig(tempDir)).rejects.toThrow('copytreeDefaults must be an object');
  });

  it('rejects array copytreeDefaults', async () => {
    const configWithArray = {
      editor: 'vim',
      copytreeDefaults: ['invalid', 'array'],
    };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), configWithArray);

    // Validation should reject array copytreeDefaults
    await expect(loadConfig(tempDir)).rejects.toThrow('copytreeDefaults.format must be a string');
  });

  // Additional validation tests
  it('validates showGitStatus is boolean', async () => {
    const invalidConfig = { showGitStatus: 'true' };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('showGitStatus must be a boolean');
  });

  it('validates showFileSize is boolean', async () => {
    const invalidConfig = { showFileSize: 1 };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('showFileSize must be a boolean');
  });

  it('validates showModifiedTime is boolean', async () => {
    const invalidConfig = { showModifiedTime: 'yes' };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('showModifiedTime must be a boolean');
  });

  it('validates respectGitignore is boolean', async () => {
    const invalidConfig = { respectGitignore: 1 };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('respectGitignore must be a boolean');
  });

  it('validates autoRefresh is boolean', async () => {
    const invalidConfig = { autoRefresh: 'true' };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), invalidConfig);

    await expect(loadConfig(tempDir)).rejects.toThrow('autoRefresh must be a boolean');
  });

  it('handles malformed project config with null value', async () => {
    await fs.writeFile(path.join(tempDir, '.yellowwood.json'), 'null');

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
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), partialConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('vim');
    expect(config.showHidden).toBe(true);
    // Missing field should be filled from defaults
    expect(config.copytreeDefaults).toEqual(DEFAULT_CONFIG.copytreeDefaults);
  });
});

// Global config tests
describe('loadConfig - global config', () => {
  let tempDir: string;
  let tempConfigHome: string;
  let originalXdgConfigHome: string | undefined;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `yellowwood-test-${Date.now()}`);
    tempConfigHome = path.join(os.tmpdir(), `yellowwood-config-${Date.now()}`);
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
    const globalPath = path.join(tempConfigHome, 'yellowwood', 'config.json');
    await fs.ensureDir(path.dirname(globalPath));
    await fs.writeJSON(globalPath, globalConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('global-editor');
    expect(config.treeIndent).toBe(8);
  });

  it('project config overrides global config', async () => {
    // Set up global config
    const globalConfig = { editor: 'global-editor', treeIndent: 8 };
    const globalPath = path.join(tempConfigHome, 'yellowwood', 'config.json');
    await fs.ensureDir(path.dirname(globalPath));
    await fs.writeJSON(globalPath, globalConfig);

    // Set up project config
    const projectConfig = { editor: 'project-editor' };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), projectConfig);

    const config = await loadConfig(tempDir);
    expect(config.editor).toBe('project-editor'); // Project overrides global
    expect(config.treeIndent).toBe(8); // Global value used when not in project config
  });

  it('global config overrides defaults', async () => {
    const globalConfig = { editor: 'global-editor', showHidden: true };
    const globalPath = path.join(tempConfigHome, 'yellowwood', 'config.json');
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
    const globalPath = path.join(tempConfigHome, 'yellowwood', 'config.json');
    await fs.ensureDir(path.dirname(globalPath));
    await fs.writeJSON(globalPath, globalConfig);

    // Project sets asReference
    const projectConfig = {
      copytreeDefaults: { asReference: false },
    };
    await fs.writeJSON(path.join(tempDir, '.yellowwood.json'), projectConfig);

    const config = await loadConfig(tempDir);
    // Both values should be present (deep merge)
    expect(config.copytreeDefaults.format).toBe('markdown'); // From global
    expect(config.copytreeDefaults.asReference).toBe(false); // From project
  });

  it('handles malformed global config gracefully', async () => {
    const globalPath = path.join(tempConfigHome, 'yellowwood', 'config.json');
    await fs.ensureDir(path.dirname(globalPath));
    await fs.writeFile(globalPath, '{ invalid json }');

    // Should fall back to defaults and not crash
    const config = await loadConfig(tempDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });
});
