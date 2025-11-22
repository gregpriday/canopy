import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logWarn: vi.fn(),
}));

import { runCopyTreeWithProfile, runCopyTree } from '../../src/utils/copytree.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import { execa as mockedExeca } from 'execa';
import { logWarn } from '../../src/utils/logger.js';

describe('copytree utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs copytree with a named profile', async () => {
    mockedExeca.mockResolvedValue({ stdout: 'ok' } as any);
    const config = {
      ...DEFAULT_CONFIG,
      copytreeProfiles: {
        ...DEFAULT_CONFIG.copytreeProfiles,
        minimal: { args: ['--tree-only'], description: 'structure only' },
      },
    };

    const output = await runCopyTreeWithProfile('/repo', 'minimal', config);

    expect(output).toBe('ok');
    expect(mockedExeca).toHaveBeenCalledWith('copytree', ['--tree-only'], { cwd: '/repo' });
  });

  it('falls back to default profile when requested profile is missing', async () => {
    mockedExeca.mockResolvedValue({ stdout: 'done' } as any);

    await runCopyTreeWithProfile('/repo', 'unknown', DEFAULT_CONFIG);

    expect(mockedExeca).toHaveBeenCalledWith(
      'copytree',
      DEFAULT_CONFIG.copytreeProfiles!.default.args,
      { cwd: '/repo' }
    );
    expect(vi.mocked(logWarn)).toHaveBeenCalled();
  });

  it('falls back to built-in args when profiles are undefined', async () => {
    mockedExeca.mockResolvedValue({ stdout: 'done' } as any);
    const config = { ...DEFAULT_CONFIG, copytreeProfiles: undefined };

    await runCopyTreeWithProfile('/repo', 'default', config);

    expect(mockedExeca).toHaveBeenCalledWith('copytree', ['-r'], { cwd: '/repo' });
    expect(vi.mocked(logWarn)).toHaveBeenCalled();
  });

  it('appends extra args after profile args', async () => {
    mockedExeca.mockResolvedValue({ stdout: 'done' } as any);

    await runCopyTreeWithProfile('/repo', 'debug', DEFAULT_CONFIG, ['--foo']);

    expect(mockedExeca).toHaveBeenCalledWith(
      'copytree',
      [...(DEFAULT_CONFIG.copytreeProfiles?.debug.args ?? []), '--foo'],
      { cwd: '/repo' }
    );
  });

  it('runCopyTree delegates to the default profile', async () => {
    mockedExeca.mockResolvedValue({ stdout: 'ok' } as any);

    await runCopyTree('/repo', DEFAULT_CONFIG);

    expect(mockedExeca).toHaveBeenCalledWith(
      'copytree',
      DEFAULT_CONFIG.copytreeProfiles!.default.args,
      { cwd: '/repo' }
    );
  });
});
