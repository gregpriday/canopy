// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCopyTree } from '../../src/hooks/useCopyTree.js';
import * as copytree from '../../src/utils/copytree.js';
import { events } from '../../src/services/events.js';
import { DEFAULT_CONFIG } from '../../src/types/index.js';

// Mock the copytree module
vi.mock('../../src/utils/copytree.js');

describe('useCopyTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to file:copy-tree events and executes runCopyTreeWithProfile on success', async () => {
    const mockOutput = 'File tree copied successfully!\n✅ Copied 42 files';
    vi.mocked(copytree.runCopyTreeWithProfile).mockResolvedValue(mockOutput);

    const notifySpy = vi.fn();
    const unsubscribe = events.on('ui:notify', notifySpy);

    renderHook(() => useCopyTree('/test/path', DEFAULT_CONFIG));

    // Emit file:copy-tree event
    await act(async () => {
      events.emit('file:copy-tree', {});
      // Wait for async handler to complete
      await vi.waitFor(() => {
        expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledWith(
          '/test/path',
          'default',
          DEFAULT_CONFIG,
          []
        );
      });
    });

    // Verify runCopyTreeWithProfile was called with correct args
    expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledTimes(1);
    expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledWith(
      '/test/path',
      'default',
      DEFAULT_CONFIG,
      []
    );

    // Verify success notification was emitted
    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith({
        type: 'success',
        message: '✅ Copied 42 files',
      });
    });

    unsubscribe();
  });

  it('uses payload rootPath when provided instead of activeRootPath', async () => {
    const mockOutput = 'Success\nCopied!';
    vi.mocked(copytree.runCopyTreeWithProfile).mockResolvedValue(mockOutput);

    renderHook(() => useCopyTree('/default/path', DEFAULT_CONFIG));

    await act(async () => {
      events.emit('file:copy-tree', { rootPath: '/custom/path' });
      await vi.waitFor(() => {
        expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledWith(
          '/custom/path',
          'default',
          DEFAULT_CONFIG,
          []
        );
      });
    });

    expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledWith(
      '/custom/path',
      'default',
      DEFAULT_CONFIG,
      []
    );
  });

  it('passes profile and extra args from payload to runCopyTreeWithProfile', async () => {
    vi.mocked(copytree.runCopyTreeWithProfile).mockResolvedValue('ok');

    renderHook(() => useCopyTree('/default/path', DEFAULT_CONFIG));

    await act(async () => {
      events.emit('file:copy-tree', { profile: 'debug', extraArgs: ['--foo'] });
      await vi.waitFor(() => {
        expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledWith(
          '/default/path',
          'debug',
          DEFAULT_CONFIG,
          ['--foo']
        );
      });
    });
  });

  it('appends files to extra args when provided in payload', async () => {
    vi.mocked(copytree.runCopyTreeWithProfile).mockResolvedValue('ok');

    renderHook(() => useCopyTree('/default/path', DEFAULT_CONFIG));

    await act(async () => {
      events.emit('file:copy-tree', {
        extraArgs: ['--foo'],
        files: ['src/index.ts', 'README.md'],
      });
      await vi.waitFor(() => {
        expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledWith(
          '/default/path',
          'default',
          DEFAULT_CONFIG,
          ['--foo', 'src/index.ts', 'README.md']
        );
      });
    });
  });

  it('emits error notification when runCopyTreeWithProfile fails', async () => {
    const mockError = new Error('copytree command not found. Please install it first.');
    vi.mocked(copytree.runCopyTreeWithProfile).mockRejectedValue(mockError);

    const notifySpy = vi.fn();
    const unsubscribe = events.on('ui:notify', notifySpy);

    renderHook(() => useCopyTree('/test/path', DEFAULT_CONFIG));

    await act(async () => {
      events.emit('file:copy-tree', {});
      await vi.waitFor(() => {
        expect(copytree.runCopyTreeWithProfile).toHaveBeenCalled();
      });
    });

    // Verify error notification was emitted
    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith({
        type: 'error',
        message: 'copytree command not found. Please install it first.',
      });
    });

    unsubscribe();
  });

  it('strips ANSI codes from success output', async () => {
    // Mock output with ANSI escape codes (e.g., colors)
    const mockOutput = 'Processing...\n\x1B[32m✅ Success!\x1B[0m';
    vi.mocked(copytree.runCopyTreeWithProfile).mockResolvedValue(mockOutput);

    const notifySpy = vi.fn();
    const unsubscribe = events.on('ui:notify', notifySpy);

    renderHook(() => useCopyTree('/test/path', DEFAULT_CONFIG));

    await act(async () => {
      events.emit('file:copy-tree', {});
      await vi.waitFor(() => {
        expect(copytree.runCopyTreeWithProfile).toHaveBeenCalled();
      });
    });

    // Verify ANSI codes were stripped from notification
    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith({
        type: 'success',
        message: '✅ Success!',
      });
    });

    unsubscribe();
  });

  it('prevents concurrent executions with in-flight guard', async () => {
    // Create a promise that we control
    let resolveFirst: (() => void) | undefined;
    const firstPromise = new Promise<string>((resolve) => {
      resolveFirst = () => resolve('First done');
    });

    vi.mocked(copytree.runCopyTreeWithProfile).mockReturnValueOnce(firstPromise);

    const notifySpy = vi.fn();
    const unsubscribe = events.on('ui:notify', notifySpy);

    renderHook(() => useCopyTree('/test/path', DEFAULT_CONFIG));

    // Emit first event (will be in-flight)
    await act(async () => {
      events.emit('file:copy-tree', {});
      // Wait a tick to ensure listener is invoked
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledTimes(1);

    // Emit second event while first is still in-flight
    await act(async () => {
      events.emit('file:copy-tree', {});
      await new Promise((r) => setTimeout(r, 0));
    });

    // Should still only have called runCopyTreeWithProfile once
    expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledTimes(1);

    // Should have emitted a warning notification
    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith({
        type: 'warning',
        message: 'CopyTree is already running',
      });
    });

    // Now resolve the first call
    await act(async () => {
      resolveFirst!();
      await vi.waitFor(() => {
        expect(notifySpy).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'success' })
        );
      });
    });

    unsubscribe();
  });

  it('allows subsequent executions after previous completes', async () => {
    vi.mocked(copytree.runCopyTreeWithProfile).mockResolvedValue('Done 1');

    renderHook(() => useCopyTree('/test/path', DEFAULT_CONFIG));

    // First execution
    await act(async () => {
      events.emit('file:copy-tree', {});
      await vi.waitFor(() => {
        expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledTimes(1);
      });
    });

    // Second execution (should be allowed after first completes)
    vi.mocked(copytree.runCopyTreeWithProfile).mockResolvedValue('Done 2');

    await act(async () => {
      events.emit('file:copy-tree', {});
      await vi.waitFor(() => {
        expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledTimes(2);
      });
    });

    expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledTimes(2);
  });

  it('resets in-flight flag even when execution fails', async () => {
    vi.mocked(copytree.runCopyTreeWithProfile).mockRejectedValue(new Error('First fail'));

    renderHook(() => useCopyTree('/test/path', DEFAULT_CONFIG));

    // First execution (fails)
    await act(async () => {
      events.emit('file:copy-tree', {});
      await vi.waitFor(() => {
        expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledTimes(1);
      });
    });

    // Second execution (should be allowed after first fails)
    vi.mocked(copytree.runCopyTreeWithProfile).mockRejectedValue(new Error('Second fail'));

    await act(async () => {
      events.emit('file:copy-tree', {});
      await vi.waitFor(() => {
        expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledTimes(2);
      });
    });

    expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledTimes(2);
  });

  it('uses updated activeRootPath from ref when it changes', async () => {
    vi.mocked(copytree.runCopyTreeWithProfile).mockResolvedValue('Success');

    const { rerender } = renderHook(
      ({ path, config }) => useCopyTree(path, config),
      { initialProps: { path: '/initial/path', config: DEFAULT_CONFIG } }
    );

    // Change the active root path
    rerender({ path: '/updated/path', config: DEFAULT_CONFIG });

    await act(async () => {
      events.emit('file:copy-tree', {});
      await vi.waitFor(() => {
        expect(copytree.runCopyTreeWithProfile).toHaveBeenCalled();
      });
    });

    // Should use the updated path
    expect(copytree.runCopyTreeWithProfile).toHaveBeenCalledWith(
      '/updated/path',
      'default',
      DEFAULT_CONFIG,
      []
    );
  });

  it('unsubscribes from events on unmount', () => {
    const { unmount } = renderHook(() => useCopyTree('/test/path', DEFAULT_CONFIG));

    // Unmount the hook
    unmount();

    // Emit event after unmount - runCopyTreeWithProfile should not be called
    act(() => {
      events.emit('file:copy-tree', {});
    });

    // Allow any pending promises to settle
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(copytree.runCopyTreeWithProfile).not.toHaveBeenCalled();
        resolve();
      }, 100);
    });
  });
});
