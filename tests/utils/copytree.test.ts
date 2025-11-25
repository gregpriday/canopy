import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { runCopyTreeWithProfile, runCopyTree } from '../../src/utils/copytree.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import { execa as mockedExeca } from 'execa';

describe('copytree utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs copytree with default args', async () => {
    mockedExeca.mockResolvedValue({ stdout: 'ok' } as any);

    const output = await runCopyTree('/repo', DEFAULT_CONFIG);

    expect(output).toBe('ok');
    expect(mockedExeca).toHaveBeenCalledWith('copytree', ['-r'], { cwd: '/repo' });
  });

  it('appends extra args after default args', async () => {
    mockedExeca.mockResolvedValue({ stdout: 'done' } as any);

    await runCopyTree('/repo', DEFAULT_CONFIG, ['--foo']);

    expect(mockedExeca).toHaveBeenCalledWith(
      'copytree',
      ['-r', '--foo'],
      { cwd: '/repo' }
    );
  });

  it('runCopyTreeWithProfile uses default args (profile ignored)', async () => {
    mockedExeca.mockResolvedValue({ stdout: 'ok' } as any);

    await runCopyTreeWithProfile('/repo', 'some-profile', DEFAULT_CONFIG);

    // Profile is now ignored - always uses default args
    expect(mockedExeca).toHaveBeenCalledWith(
      'copytree',
      ['-r'],
      { cwd: '/repo' }
    );
  });

  it('runCopyTreeWithProfile appends extra args', async () => {
    mockedExeca.mockResolvedValue({ stdout: 'done' } as any);

    await runCopyTreeWithProfile('/repo', 'debug', DEFAULT_CONFIG, ['--verbose']);

    expect(mockedExeca).toHaveBeenCalledWith(
      'copytree',
      ['-r', '--verbose'],
      { cwd: '/repo' }
    );
  });

  it('throws when copytree command is not found', async () => {
    const error = new Error('command not found');
    (error as any).code = 'ENOENT';
    mockedExeca.mockRejectedValue(error);

    await expect(runCopyTree('/repo', DEFAULT_CONFIG)).rejects.toThrow(
      'copytree command not found. Please install it first.'
    );
  });

  it('throws on other execution errors', async () => {
    mockedExeca.mockRejectedValue(new Error('Something went wrong'));

    await expect(runCopyTree('/repo', DEFAULT_CONFIG)).rejects.toThrow('Something went wrong');
  });
});
