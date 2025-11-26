import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to compiled CLI script
const cliPath = path.join(__dirname, '../../dist/cli.js');

/**
 * Helper to run CLI with args and capture output.
 */
async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('node', [cliPath, ...args], {
      env: { ...process.env, FORCE_COLOR: '0' }, // Disable colors for testing
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode || 0 });
    });

    // Kill after 2 seconds to avoid hanging
    setTimeout(() => {
      child.kill();
      resolve({ stdout, stderr, exitCode: -1 });
    }, 2000);
  });
}

describe('CLI argument parsing', () => {
  it('shows help with --help flag', async () => {
    const { stdout, exitCode } = await runCli(['--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Canopy');
    expect(stdout).toContain('USAGE');
    expect(stdout).toContain('OPTIONS');
    expect(stdout).toContain('--editor');
    expect(stdout).toContain('--filter');
    expect(stdout).toContain('EXAMPLES');
  });

  it('shows help with -h flag', async () => {
    const { stdout, exitCode } = await runCli(['-h']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('USAGE');
    expect(stdout).toContain('canopy [path] [options]');
  });

  it('shows version with --version flag', async () => {
    const { stdout, exitCode } = await runCli(['--version']);

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/canopy v\d+\.\d+\.\d+/);
  });

  it('shows version with -v flag', async () => {
    const { stdout, exitCode } = await runCli(['-v']);

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/canopy v\d+\.\d+\.\d+/);
  });

  it('errors on unknown flag', async () => {
    const { stderr, exitCode } = await runCli(['--unknown-flag']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown flag');
    expect(stderr).toContain('--unknown-flag');
    expect(stderr).toContain('--help');
  });

  it('errors when --editor has no value', async () => {
    const { stderr, exitCode } = await runCli(['--editor']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('--editor requires a value');
  });

  it('errors when --editor value starts with dash', async () => {
    const { stderr, exitCode } = await runCli(['--editor', '--other-flag']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('--editor requires a value');
  });

  it('errors when --filter has no value', async () => {
    const { stderr, exitCode } = await runCli(['--filter']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('--filter requires a value');
  });

  it('errors when --max-depth has no value', async () => {
    const { stderr, exitCode } = await runCli(['--max-depth']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('--max-depth requires a number');
  });

  it('errors when --max-depth has invalid value', async () => {
    const { stderr, exitCode } = await runCli(['--max-depth', 'abc']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('--max-depth must be a non-negative number');
  });

  it('errors when --max-depth is negative', async () => {
    const { stderr, exitCode } = await runCli(['--max-depth', '-5']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('--max-depth must be a non-negative number');
  });

  it('errors on removed --config flag', async () => {
    const { stderr, exitCode } = await runCli(['--config', 'some-path']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown flag');
    expect(stderr).toContain('--config');
  });

  it('errors on removed --debug flag', async () => {
    const { stderr, exitCode } = await runCli(['--debug']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown flag');
    expect(stderr).toContain('--debug');
  });

  it('accepts short alias -e for --editor', async () => {
    const { stderr, exitCode } = await runCli(['-e']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('--editor requires a value');
  });

  it('accepts short alias -f for --filter', async () => {
    const { stderr, exitCode } = await runCli(['-f']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('--filter requires a value');
  });

  it('accepts short alias -d for --max-depth', async () => {
    const { stderr, exitCode } = await runCli(['-d']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('--max-depth requires a number');
  });

  it('errors on removed -c flag (was --config)', async () => {
    const { stderr, exitCode } = await runCli(['-c', 'some-path']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown flag');
    expect(stderr).toContain('-c');
  });
});

describe('CLI flag behavior', () => {
  it('accepts valid --max-depth value', async () => {
    // This would normally start the app, so we just check it doesn't error immediately
    const { stderr, exitCode } = await runCli(['--max-depth', '5']);

    // Should either start app (exit -1 due to kill) or succeed
    // Should NOT have a parse error
    expect(stderr).not.toContain('--max-depth must be a non-negative number');
  });

  it('accepts zero as valid --max-depth', async () => {
    const { stderr } = await runCli(['--max-depth', '0']);

    // Should not have a parse error
    expect(stderr).not.toContain('--max-depth must be a non-negative number');
  });

  it('accepts directory as positional argument', async () => {
    const { stderr } = await runCli(['/tmp']);

    // Should not error on the directory argument
    expect(stderr).not.toContain('Unknown flag');
  });

  it('accepts directory with flags', async () => {
    const { stderr } = await runCli(['/tmp', '--hidden']);

    // Should not error on either argument
    expect(stderr).not.toContain('Unknown flag');
  });

  it('accepts flags before directory', async () => {
    const { stderr } = await runCli(['--hidden', '/tmp']);

    // Should not error - order shouldn't matter
    expect(stderr).not.toContain('Unknown flag');
  });
});
