import { cosmiconfig } from 'cosmiconfig';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { DEFAULT_CONFIG, type YellowwoodConfig } from '../types/index.js';

/**
 * Loads Yellowwood configuration from project and global config files.
 * Merges configurations with precedence: project > global > defaults.
 *
 * @param cwd - Current working directory to search for project config (defaults to process.cwd())
 * @returns Validated and merged configuration
 * @throws Error if config validation fails
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<YellowwoodConfig> {
  // 1. Set up cosmiconfig
  const explorer = cosmiconfig('yellowwood', {
    searchPlaces: [
      '.yellowwood.json',
      'yellowwood.config.json',
      '.yellowwoodrc',
    ],
    // Stop at first found file
    stopDir: cwd,
  });

  // 2. Search for project config starting from cwd
  let projectConfig = {};
  try {
    const projectResult = await explorer.search(cwd);
    projectConfig = projectResult?.config || {};
  } catch (error) {
    // Handle malformed JSON or other config file errors
    console.warn(`Warning: Could not load project config:`, (error as Error).message);
    // Continue with empty project config (fall back to global/defaults)
  }

  // 3. Load global config
  const globalConfig = await loadGlobalConfig();

  // 4. Merge: project overrides global overrides defaults
  const merged = mergeConfigs(DEFAULT_CONFIG, globalConfig, projectConfig);

  // 5. Validate and return
  return validateConfig(merged);
}

/**
 * Loads global configuration from user's config directory.
 * Respects XDG_CONFIG_HOME on Linux systems.
 *
 * @returns Partial configuration from global config file, or empty object if not found
 */
async function loadGlobalConfig(): Promise<Partial<YellowwoodConfig>> {
  // Respect XDG_CONFIG_HOME on Linux
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const globalPath = path.join(configHome, 'yellowwood', 'config.json');

  try {
    const exists = await fs.pathExists(globalPath);
    if (!exists) {
      return {}; // No global config is perfectly fine
    }

    const contents = await fs.readFile(globalPath, 'utf-8');
    return JSON.parse(contents);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}; // File disappeared between check and read - that's OK
    }
    // JSON parse error or permission error - log and continue with empty config
    console.warn(`Warning: Could not load global config from ${globalPath}:`, (error as Error).message);
    return {};
  }
}

/**
 * Merges multiple partial configurations into a single complete configuration.
 * Later configs override earlier ones. Performs deep merge for nested objects.
 *
 * @param configs - Configuration objects to merge (in order of precedence)
 * @returns Merged configuration
 */
function mergeConfigs(...configs: Partial<YellowwoodConfig>[]): YellowwoodConfig {
  const merged = { ...configs[0] } as YellowwoodConfig;

  for (let i = 1; i < configs.length; i++) {
    const config = configs[i];
    if (!config || typeof config !== 'object') {
      continue;
    }

    for (const [key, value] of Object.entries(config)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue; // prevent prototype pollution from untrusted config values
      }

      const typedKey = key as keyof YellowwoodConfig;
      if (
        typedKey === 'copytreeDefaults' &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        merged[typedKey] = {
          ...merged.copytreeDefaults,
          ...value,
        };
        continue;
      }

      if (
        typedKey === 'openers' &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        const mergedOpeners = merged.openers || { default: { cmd: '', args: [] }, byExtension: {}, byGlob: {} };
        const v = value as any;

        merged.openers = {
          // Pass through default even if it's invalid - validation will catch it
          default: v.default !== undefined ? v.default : mergedOpeners.default,
          byExtension: {
            ...mergedOpeners.byExtension,
            // Only merge if it's a valid plain object, otherwise pass through for validation
            ...(v.byExtension !== undefined &&
                typeof v.byExtension === 'object' &&
                v.byExtension !== null &&
                !Array.isArray(v.byExtension) ? v.byExtension : {}),
          },
          byGlob: {
            ...mergedOpeners.byGlob,
            // Only merge if it's a valid plain object, otherwise pass through for validation
            ...(v.byGlob !== undefined &&
                typeof v.byGlob === 'object' &&
                v.byGlob !== null &&
                !Array.isArray(v.byGlob) ? v.byGlob : {}),
          },
        };

        // Store invalid byExtension/byGlob for validation to catch
        if (v.byExtension !== undefined && (typeof v.byExtension !== 'object' || v.byExtension === null || Array.isArray(v.byExtension))) {
          (merged.openers as any).byExtension = v.byExtension;
        }
        if (v.byGlob !== undefined && (typeof v.byGlob !== 'object' || v.byGlob === null || Array.isArray(v.byGlob))) {
          (merged.openers as any).byGlob = v.byGlob;
        }

        continue;
      }

      (merged as any)[typedKey] = value;
    }
  }

  return merged;
}

/**
 * Validates configuration object to ensure all required fields are present
 * and have valid types and values.
 *
 * @param config - Configuration object to validate
 * @returns Validated configuration
 * @throws Error if validation fails with descriptive error messages
 */
function validateConfig(config: unknown): YellowwoodConfig {
  // Type guard to ensure we have a valid config object
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid config: must be an object');
  }

  const c = config as any;

  // Validate required fields and types
  const errors: string[] = [];

  if (typeof c.editor !== 'string') {
    errors.push('config.editor must be a string');
  }

  if (!Array.isArray(c.editorArgs)) {
    errors.push('config.editorArgs must be an array');
  }

  if (!['auto', 'dark', 'light'].includes(c.theme)) {
    errors.push('config.theme must be "auto", "dark", or "light"');
  }

  if (typeof c.showHidden !== 'boolean') {
    errors.push('config.showHidden must be a boolean');
  }

  if (typeof c.showGitStatus !== 'boolean') {
    errors.push('config.showGitStatus must be a boolean');
  }

  if (typeof c.showFileSize !== 'boolean') {
    errors.push('config.showFileSize must be a boolean');
  }

  if (typeof c.showModifiedTime !== 'boolean') {
    errors.push('config.showModifiedTime must be a boolean');
  }

  if (typeof c.respectGitignore !== 'boolean') {
    errors.push('config.respectGitignore must be a boolean');
  }

  if (!Array.isArray(c.customIgnores)) {
    errors.push('config.customIgnores must be an array');
  }

  if (!c.copytreeDefaults || typeof c.copytreeDefaults !== 'object') {
    errors.push('config.copytreeDefaults must be an object');
  } else {
    if (typeof c.copytreeDefaults.format !== 'string') {
      errors.push('config.copytreeDefaults.format must be a string');
    }
    if (typeof c.copytreeDefaults.asReference !== 'boolean') {
      errors.push('config.copytreeDefaults.asReference must be a boolean');
    }
  }

  // Validate openers (optional field)
  if (c.openers !== undefined) {
    if (!c.openers || typeof c.openers !== 'object') {
      errors.push('config.openers must be an object');
    } else {
      // Validate default opener
      if (!c.openers.default || typeof c.openers.default !== 'object') {
        errors.push('config.openers.default must be an object');
      } else {
        if (typeof c.openers.default.cmd !== 'string') {
          errors.push('config.openers.default.cmd must be a string');
        }
        if (!Array.isArray(c.openers.default.args)) {
          errors.push('config.openers.default.args must be an array');
        } else {
          // Validate each arg is a string
          for (let i = 0; i < c.openers.default.args.length; i++) {
            if (typeof c.openers.default.args[i] !== 'string') {
              errors.push(`config.openers.default.args[${i}] must be a string`);
            }
          }
        }
      }

      // Validate byExtension
      if (c.openers.byExtension !== undefined) {
        if (typeof c.openers.byExtension !== 'object' || Array.isArray(c.openers.byExtension)) {
          errors.push('config.openers.byExtension must be an object');
        } else {
          for (const [ext, opener] of Object.entries(c.openers.byExtension)) {
            if (!opener || typeof opener !== 'object') {
              errors.push(`config.openers.byExtension.${ext} must be an object`);
            } else {
              const o = opener as any;
              if (typeof o.cmd !== 'string') {
                errors.push(`config.openers.byExtension.${ext}.cmd must be a string`);
              }
              if (!Array.isArray(o.args)) {
                errors.push(`config.openers.byExtension.${ext}.args must be an array`);
              } else {
                // Validate each arg is a string
                for (let i = 0; i < o.args.length; i++) {
                  if (typeof o.args[i] !== 'string') {
                    errors.push(`config.openers.byExtension.${ext}.args[${i}] must be a string`);
                  }
                }
              }
            }
          }
        }
      }

      // Validate byGlob
      if (c.openers.byGlob !== undefined) {
        if (typeof c.openers.byGlob !== 'object' || Array.isArray(c.openers.byGlob)) {
          errors.push('config.openers.byGlob must be an object');
        } else {
          for (const [pattern, opener] of Object.entries(c.openers.byGlob)) {
            if (!opener || typeof opener !== 'object') {
              errors.push(`config.openers.byGlob.${pattern} must be an object`);
            } else {
              const o = opener as any;
              if (typeof o.cmd !== 'string') {
                errors.push(`config.openers.byGlob.${pattern}.cmd must be a string`);
              }
              if (!Array.isArray(o.args)) {
                errors.push(`config.openers.byGlob.${pattern}.args must be an array`);
              } else {
                // Validate each arg is a string
                for (let i = 0; i < o.args.length; i++) {
                  if (typeof o.args[i] !== 'string') {
                    errors.push(`config.openers.byGlob.${pattern}.args[${i}] must be a string`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (typeof c.autoRefresh !== 'boolean') {
    errors.push('config.autoRefresh must be a boolean');
  }

  if (typeof c.refreshDebounce !== 'number' || c.refreshDebounce < 0) {
    errors.push('config.refreshDebounce must be a non-negative number');
  }

  if (typeof c.treeIndent !== 'number' || c.treeIndent < 0) {
    errors.push('config.treeIndent must be a non-negative number');
  }

  if (c.maxDepth !== null && (typeof c.maxDepth !== 'number' || c.maxDepth < 0)) {
    errors.push('config.maxDepth must be null or a non-negative number');
  }

  if (!['name', 'size', 'modified', 'type'].includes(c.sortBy)) {
    errors.push('config.sortBy must be "name", "size", "modified", or "type"');
  }

  if (!['asc', 'desc'].includes(c.sortDirection)) {
    errors.push('config.sortDirection must be "asc" or "desc"');
  }

  if (errors.length > 0) {
    throw new Error(`Config validation failed:\n${errors.join('\n')}`);
  }

  // Warn about unknown keys
  const knownKeys = Object.keys(DEFAULT_CONFIG);
  const unknownKeys = Object.keys(c).filter(key => !knownKeys.includes(key));
  if (unknownKeys.length > 0) {
    console.warn(`Warning: Unknown config keys (will be ignored): ${unknownKeys.join(', ')}`);
  }

  return c as YellowwoodConfig;
}
