import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openFile } from '../../src/utils/fileOpener.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';
import type { YellowwoodConfig } from '../../src/types/index.js';
import * as execa from 'execa';

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

describe('openFile', () => {
  const mockExeca = vi.mocked(execa.execa);

  beforeEach(() => {
    mockExeca.mockReset();
    // Mock execa to return a child process with event emitter methods
    mockExeca.mockReturnValue({
      once: vi.fn((event: string, handler: Function) => {
        if (event === 'spawn') {
          // Simulate successful spawn
          setTimeout(() => handler(), 0);
        }
      }),
      unref: vi.fn(),
      catch: vi.fn(),
    } as any);
  });

  it('uses default opener when no patterns match', async () => {
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      openers: {
        default: { cmd: 'code', args: ['-r'] },
        byExtension: {},
        byGlob: {},
      },
    };

    await openFile('/path/to/file.txt', config);

    expect(mockExeca).toHaveBeenCalledWith(
      'code',
      ['-r', '/path/to/file.txt'],
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    );
  });

  it('uses extension-based opener when extension matches', async () => {
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      openers: {
        default: { cmd: 'code', args: ['-r'] },
        byExtension: {
          '.log': { cmd: 'less', args: ['+G'] },
        },
        byGlob: {},
      },
    };

    await openFile('/var/log/app.log', config);

    expect(mockExeca).toHaveBeenCalledWith(
      'less',
      ['+G', '/var/log/app.log'],
      expect.objectContaining({ detached: true })
    );
  });

  it('uses glob-based opener when path matches pattern', async () => {
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      openers: {
        default: { cmd: 'code', args: ['-r'] },
        byExtension: {},
        byGlob: {
          '**/tests/**/*.ts': { cmd: 'vitest', args: ['run'] },
        },
      },
    };

    await openFile('/project/tests/unit/foo.ts', config);

    expect(mockExeca).toHaveBeenCalledWith(
      'vitest',
      ['run', '/project/tests/unit/foo.ts'],
      expect.objectContaining({ detached: true })
    );
  });

  it('prefers extension match over glob match', async () => {
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: {
          '.ts': { cmd: 'vim', args: [] },
        },
        byGlob: {
          '**/*.ts': { cmd: 'nano', args: [] },
        },
      },
    };

    await openFile('/project/file.ts', config);

    // Should use extension match (vim), not glob match (nano)
    expect(mockExeca).toHaveBeenCalledWith(
      'vim',
      ['/project/file.ts'],
      expect.any(Object)
    );
  });

  it('uses first matching glob pattern', async () => {
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: {},
        byGlob: {
          '**/src/*.ts': { cmd: 'editor1', args: [] },
          '**/*.ts': { cmd: 'editor2', args: [] },
        },
      },
    };

    await openFile('/project/src/file.ts', config);

    // Should use first match (editor1)
    expect(mockExeca).toHaveBeenCalledWith(
      'editor1',
      ['/project/src/file.ts'],
      expect.any(Object)
    );
  });

  it('falls back to editor/editorArgs when openers not configured', async () => {
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      editor: 'vim',
      editorArgs: ['-n'],
      // openers not set
    };
    delete config.openers;

    await openFile('/path/to/file.txt', config);

    expect(mockExeca).toHaveBeenCalledWith(
      'vim',
      ['-n', '/path/to/file.txt'],
      expect.any(Object)
    );
  });

  it('throws helpful error when editor not found', async () => {
    mockExeca.mockReturnValue({
      once: vi.fn((event: string, handler: Function) => {
        if (event === 'error') {
          // Simulate ENOENT error
          setTimeout(() => handler({ code: 'ENOENT', message: 'not found' }), 0);
        }
      }),
      unref: vi.fn(),
      catch: vi.fn(),
    } as any);

    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      openers: {
        default: { cmd: 'nonexistent', args: [] },
        byExtension: {},
        byGlob: {},
      },
    };

    await expect(openFile('/file.txt', config)).rejects.toThrow(
      "Editor 'nonexistent' not found"
    );
  });

  it('throws helpful error when permission denied', async () => {
    mockExeca.mockReturnValue({
      once: vi.fn((event: string, handler: Function) => {
        if (event === 'error') {
          // Simulate EACCES error
          setTimeout(() => handler({ code: 'EACCES', message: 'permission denied' }), 0);
        }
      }),
      unref: vi.fn(),
      catch: vi.fn(),
    } as any);

    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      openers: {
        default: { cmd: 'editor', args: [] },
        byExtension: {},
        byGlob: {},
      },
    };

    await expect(openFile('/file.txt', config)).rejects.toThrow(
      "Permission denied executing 'editor'"
    );
  });

  it('passes file path as last argument', async () => {
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      openers: {
        default: { cmd: 'editor', args: ['--flag1', '--flag2'] },
        byExtension: {},
        byGlob: {},
      },
    };

    await openFile('/path/to/file.txt', config);

    expect(mockExeca).toHaveBeenCalledWith(
      'editor',
      ['--flag1', '--flag2', '/path/to/file.txt'],
      expect.any(Object)
    );
  });

  it('handles files without extensions', async () => {
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: {
          '.txt': { cmd: 'nano', args: [] },
        },
        byGlob: {},
      },
    };

    await openFile('/path/to/Makefile', config);

    // Should use default (no extension match)
    expect(mockExeca).toHaveBeenCalledWith(
      'code',
      ['/path/to/Makefile'],
      expect.any(Object)
    );
  });

  it('matches glob patterns with dots', async () => {
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: {},
        byGlob: {
          '.*rc': { cmd: 'vim', args: [] },
        },
      },
    };

    await openFile('/home/user/.bashrc', config);

    expect(mockExeca).toHaveBeenCalledWith(
      'vim',
      ['/home/user/.bashrc'],
      expect.any(Object)
    );
  });

  it('matches hidden files with wildcard patterns via dot option', async () => {
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: {},
        byGlob: {
          '*.env': { cmd: 'vim', args: [] },
        },
      },
    };

    await openFile('/home/user/.env', config);

    // Should match hidden .env file due to dot:true in minimatch
    expect(mockExeca).toHaveBeenCalledWith(
      'vim',
      ['/home/user/.env'],
      expect.any(Object)
    );
  });

  it('handles case-insensitive extension matching', async () => {
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: {
          '.md': { cmd: 'typora', args: [] },
        },
        byGlob: {},
      },
    };

    // Test with uppercase extension
    await openFile('/path/to/README.MD', config);

    // Should match .md opener despite uppercase extension
    expect(mockExeca).toHaveBeenCalledWith(
      'typora',
      ['/path/to/README.MD'],
      expect.any(Object)
    );
  });

  it('calls execa with detached and cleanup options', async () => {
    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      openers: {
        default: { cmd: 'code', args: [] },
        byExtension: {},
        byGlob: {},
      },
    };

    await openFile('/file.txt', config);

    expect(mockExeca).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        detached: true,
        stdio: 'ignore',
        shell: false,
        cleanup: false,
      })
    );
  });

  it('handles other errors with context', async () => {
    mockExeca.mockReturnValue({
      once: vi.fn((event: string, handler: Function) => {
        if (event === 'error') {
          // Simulate generic error
          setTimeout(() => handler({ message: 'Some other error' }), 0);
        }
      }),
      unref: vi.fn(),
      catch: vi.fn(),
    } as any);

    const config: YellowwoodConfig = {
      ...DEFAULT_CONFIG,
      openers: {
        default: { cmd: 'myeditor', args: [] },
        byExtension: {},
        byGlob: {},
      },
    };

    await expect(openFile('/file.txt', config)).rejects.toThrow(
      "Failed to open file with 'myeditor': Some other error"
    );
  });
});
