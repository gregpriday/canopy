import { execa } from 'execa';
import type { CanopyConfig } from '../types/index.js';
import { logWarn } from './logger.js';

const FALLBACK_ARGS = ['-r'];

function resolveProfileArgs(profileName: string, config: CanopyConfig): string[] {
  const profiles = config.copytreeProfiles || {};

  if (profiles[profileName]) {
    return profiles[profileName].args;
  }

  if (profiles.default) {
    logWarn('CopyTree profile not found, falling back to default', {
      requestedProfile: profileName,
    });
    return profiles.default.args;
  }

  logWarn('No CopyTree profiles defined, using fallback args', { requestedProfile: profileName });
  return FALLBACK_ARGS;
}

async function executeCopyTree(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execa('copytree', args, { cwd });
    return stdout.trim();
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('copytree command not found. Please install it first.');
    }
    throw new Error(error.message || 'CopyTree execution failed');
  }
}

/**
 * Executes the 'copytree' command using a named profile merged with optional extra args.
 *
 * @param cwd - Directory to run the command in (usually activeRootPath)
 * @param profileName - Profile key to resolve from configuration
 * @param config - Resolved Canopy configuration containing copytreeProfiles
 * @param extraArgs - Optional additional flags to append
 */
export async function runCopyTreeWithProfile(
  cwd: string,
  profileName: string,
  config: CanopyConfig,
  extraArgs: string[] = []
): Promise<string> {
  const baseArgs = resolveProfileArgs(profileName, config);
  const args = [...baseArgs, ...extraArgs];
  return executeCopyTree(cwd, args);
}

/**
 * Backwards-compatible wrapper that executes CopyTree with the provided profile
 * (defaults to "default").
 */
export async function runCopyTree(
  cwd: string,
  config: CanopyConfig,
  profileName = 'default',
  extraArgs: string[] = []
): Promise<string> {
  return runCopyTreeWithProfile(cwd, profileName, config, extraArgs);
}
