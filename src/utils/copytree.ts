import { execa } from 'execa';
import type { CanopyConfig } from '../types/index.js';

const DEFAULT_ARGS = ['-r'];

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
 * Executes the 'copytree' command with default arguments and optional extra args.
 *
 * @param cwd - Directory to run the command in (usually activeRootPath)
 * @param _config - Canopy configuration (kept for API compatibility)
 * @param extraArgs - Optional additional flags to append
 */
export async function runCopyTree(
  cwd: string,
  _config: CanopyConfig,
  extraArgs: string[] = []
): Promise<string> {
  const args = [...DEFAULT_ARGS, ...extraArgs];
  return executeCopyTree(cwd, args);
}
