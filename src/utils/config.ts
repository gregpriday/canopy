import { cosmiconfig } from 'cosmiconfig';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { DEFAULT_CONFIG, type CanopyConfig, type Worktree } from '../types/index.js';
import { ConfigError } from './errorTypes.js';
import { logWarn, logError, logDebug } from './logger.js';

/**
 * Loads Canopy configuration from project and global config files.
 * Merges configurations with precedence: project > global > defaults.
 *
 * In worktree scenarios, this function prefers loading configuration from the main
 * repository root to ensure consistent behavior across all worktrees.
 *
 * @param cwd - Current working directory to search for project config (defaults to process.cwd())
 * @param currentWorktree - Optional current worktree (if detected)
 * @param allWorktrees - Optional list of all worktrees (for finding main repo)
 * @returns Validated and merged configuration
 * @throws Error if config validation fails
 */
export async function loadConfig(
  cwd: string = process.cwd(),
  currentWorktree: Worktree | null = null,
  allWorktrees: Worktree[] = []
): Promise<CanopyConfig> {
  // 1. Determine config search path
  // If we're in a worktree (not the main repo), prefer loading config from main repo
  let configSearchPath = cwd;

  if (currentWorktree && allWorktrees.length > 0) {
    // Get the main repository worktree (first in list)
    const mainWorktree = allWorktrees[0];

    // If we're NOT in the main worktree, use main worktree path for config
    if (mainWorktree.id !== currentWorktree.id) {
      // Verify the main worktree path exists before using it
      try {
        const mainPathExists = await fs.pathExists(mainWorktree.path);
        if (mainPathExists) {
          configSearchPath = mainWorktree.path;
          logDebug('Loading config from main repository', {
            mainRepo: mainWorktree.path,
            currentWorktree: currentWorktree.path
          });
        } else {
          logWarn('Main repository path does not exist, using current worktree for config', {
            mainRepo: mainWorktree.path
          });
        }
      } catch (error) {
        logWarn('Could not verify main repository path, using current worktree for config', {
          error: (error as Error).message
        });
      }
    }
  }

  // 2. Set up cosmiconfig
  const explorerOptions: any = {
    searchPlaces: [
      '.canopy.json',
      'canopy.config.json',
      '.canopyrc',
    ],
  };

  // Only restrict search to configSearchPath when we're loading from main worktree
  // This preserves backward compatibility for running from subdirectories
  if (currentWorktree && allWorktrees.length > 0) {
    const mainWorktree = allWorktrees[0];
    if (mainWorktree.id !== currentWorktree.id) {
      // We're in a non-main worktree - restrict search to main repo path
      explorerOptions.stopDir = configSearchPath;
    }
    // else: We're in main worktree or not in worktree - allow normal parent traversal
  }
  // else: No worktree context - allow normal parent traversal

  const explorer = cosmiconfig('canopy', explorerOptions);

  // 3. Search for project config starting from determined path
  let projectConfig = {};
  try {
    const projectResult = await explorer.search(configSearchPath);
    projectConfig = projectResult?.config || {};
  } catch (error) {
    // Handle malformed JSON or other config file errors
    logWarn('Could not load project config', { cwd: configSearchPath, error: (error as Error).message });
    // Continue with empty project config (fall back to global/defaults)
  }

  // 4. Load global config
  const globalConfig = await loadGlobalConfig();

  // 5. Merge: project overrides global overrides defaults
  const merged = mergeConfigs(DEFAULT_CONFIG, globalConfig, projectConfig);

  // 6. Validate and return
  return validateConfig(merged);
}

/**
 * Loads global configuration from user's config directory.
 * Respects XDG_CONFIG_HOME on Linux systems.
 *
 * @returns Partial configuration from global config file, or empty object if not found
 */
async function loadGlobalConfig(): Promise<Partial<CanopyConfig>> {
  // Respect XDG_CONFIG_HOME on Linux
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const globalPath = path.join(configHome, 'canopy', 'config.json');

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
    logWarn('Could not load global config', { globalPath, error: (error as Error).message });
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
function mergeConfigs(...configs: Partial<CanopyConfig>[]): CanopyConfig {
  const merged = { ...configs[0] } as CanopyConfig;

  for (let i = 1; i < configs.length; i++) {
    const config = configs[i];
    if (!config || typeof config !== 'object') {
      continue;
    }

    for (const [key, value] of Object.entries(config)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue; // prevent prototype pollution from untrusted config values
      }

      const typedKey = key as keyof CanopyConfig;
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
        typedKey === 'copytreeProfiles' &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        merged[typedKey] = {
          ...(merged.copytreeProfiles || {}),
          ...(value as Record<string, unknown>),
        } as typeof merged.copytreeProfiles;
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

      if (
        typedKey === 'worktrees' &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        merged[typedKey] = {
          ...merged.worktrees,
          ...value,
        } as typeof merged.worktrees;
        continue;
      }

      if (
        typedKey === 'recentActivity' &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        merged[typedKey] = {
          ...merged.recentActivity,
          ...value,
        } as typeof merged.recentActivity;
        continue;
      }

      if (
        typedKey === 'search' &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        merged[typedKey] = {
          ...merged.search,
          ...value,
        } as typeof merged.search;
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
function validateConfig(config: unknown): CanopyConfig {
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

  if (c.copytreeProfiles !== undefined) {
    if (!c.copytreeProfiles || typeof c.copytreeProfiles !== 'object' || Array.isArray(c.copytreeProfiles)) {
      errors.push('config.copytreeProfiles must be an object');
    } else {
      for (const [profileName, profile] of Object.entries(c.copytreeProfiles)) {
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
          errors.push(`config.copytreeProfiles.${profileName} must be an object`);
          continue;
        }

        if (!Array.isArray((profile as any).args)) {
          errors.push(`config.copytreeProfiles.${profileName}.args must be an array of strings`);
        } else {
          for (let i = 0; i < (profile as any).args.length; i++) {
            if (typeof (profile as any).args[i] !== 'string') {
              errors.push(`config.copytreeProfiles.${profileName}.args[${i}] must be a string`);
            }
          }
        }

        if ((profile as any).description !== undefined && typeof (profile as any).description !== 'string') {
          errors.push(`config.copytreeProfiles.${profileName}.description must be a string if provided`);
        }
      }
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

  // Validate worktrees (optional field)
  if (c.worktrees !== undefined) {
    if (!c.worktrees || typeof c.worktrees !== 'object') {
      errors.push('config.worktrees must be an object');
    } else {
      if (typeof c.worktrees.enable !== 'boolean') {
        errors.push('config.worktrees.enable must be a boolean');
      }
      if (typeof c.worktrees.showInHeader !== 'boolean') {
        errors.push('config.worktrees.showInHeader must be a boolean');
      }
      if (c.worktrees.refreshIntervalMs !== undefined) {
        if (typeof c.worktrees.refreshIntervalMs !== 'number' || c.worktrees.refreshIntervalMs < 0) {
          errors.push('config.worktrees.refreshIntervalMs must be a non-negative number');
        }
      }
    }
  }

  // Validate recentActivity (optional field)
  if (c.recentActivity !== undefined) {
    if (!c.recentActivity || typeof c.recentActivity !== 'object') {
      errors.push('config.recentActivity must be an object');
    } else {
      if (typeof c.recentActivity.enabled !== 'boolean') {
        errors.push('config.recentActivity.enabled must be a boolean');
      }
      if (typeof c.recentActivity.windowMinutes !== 'number' || c.recentActivity.windowMinutes <= 0) {
        errors.push('config.recentActivity.windowMinutes must be a positive number');
      }
      if (typeof c.recentActivity.maxEntries !== 'number' || c.recentActivity.maxEntries <= 0) {
        errors.push('config.recentActivity.maxEntries must be a positive number');
      }
    }
  }

  // Validate search (optional field)
  if (c.search !== undefined) {
    if (!c.search || typeof c.search !== 'object') {
      errors.push('config.search must be an object');
    } else {
      if (c.search.defaultAction !== undefined && !['open', 'copy'].includes(c.search.defaultAction)) {
        errors.push('config.search.defaultAction must be "open" or "copy"');
      }
      if (c.search.limit !== undefined && (typeof c.search.limit !== 'number' || c.search.limit <= 0)) {
        errors.push('config.search.limit must be a positive number');
      }
      if (c.search.respectGitignore !== undefined && typeof c.search.respectGitignore !== 'boolean') {
        errors.push('config.search.respectGitignore must be a boolean');
      }
    }
  }

  // Validate keys (optional field)
  if (c.keys !== undefined) {
    if (typeof c.keys !== 'object' || c.keys === null) {
      errors.push('config.keys must be an object');
    } else {
      if (c.keys.preset !== undefined && !['standard', 'vim'].includes(c.keys.preset)) {
        errors.push('config.keys.preset must be "standard" or "vim"');
      }
      if (c.keys.overrides !== undefined) {
        if (typeof c.keys.overrides !== 'object' || Array.isArray(c.keys.overrides)) {
          errors.push('config.keys.overrides must be an object');
        } else {
          // Validate each override entry
          for (const [action, bindings] of Object.entries(c.keys.overrides)) {
            if (!Array.isArray(bindings)) {
              errors.push(`config.keys.overrides.${action} must be an array of key binding strings`);
            } else {
              if (bindings.length === 0) {
                errors.push(`config.keys.overrides.${action} must have at least one key binding`);
              }
              for (let i = 0; i < bindings.length; i++) {
                if (typeof bindings[i] !== 'string') {
                  errors.push(`config.keys.overrides.${action}[${i}] must be a string`);
                }
              }
            }
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new ConfigError(
      `Config validation failed:\n${errors.join('\n')}`,
      { config: c }
    );
  }

  // Warn about unknown keys
  const knownKeys = Object.keys(DEFAULT_CONFIG);
  const unknownKeys = Object.keys(c).filter(key => !knownKeys.includes(key));
  if (unknownKeys.length > 0) {
    logWarn('Unknown config keys (will be ignored)', { keys: unknownKeys });
  }

  return c as CanopyConfig;
}
