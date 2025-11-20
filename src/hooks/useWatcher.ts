import { useEffect } from 'react';
import path from 'path';
import type { CanopyConfig } from '../types/index.js';
import { createFileWatcher, buildIgnorePatterns } from '../utils/fileWatcher.js';
import { debounce } from '../utils/debounce.js';
import { events } from '../services/events.js';

export function useWatcher(rootPath: string, config: CanopyConfig, disabled: boolean): void {
  useEffect(() => {
    if (disabled) {
      return;
    }

    const watcher = createFileWatcher(rootPath, {
      ignored: buildIgnorePatterns(config.customIgnores),
      debounce: config.refreshDebounce,
      usePolling: config.usePolling,
      onBatch: (batch) => {
        for (const change of batch) {
          const absolutePath = path.resolve(rootPath, change.path);
          events.emit('watcher:change', { type: change.type, path: absolutePath });
        }
      },
    });

    const emitRefresh = debounce(() => {
      events.emit('sys:refresh', undefined);
    }, config.refreshDebounce);

    const unsubscribe = events.on('watcher:change', () => emitRefresh());

    watcher.start();

    return () => {
      void watcher.stop();
      unsubscribe();
      emitRefresh.cancel();
    };
  }, [rootPath, config, disabled]);
}
