import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'; // Added useCallback
import { Box, Text, useApp, useStdout } from 'ink';
import { Header } from './components/Header.js';
import { TreeView } from './components/TreeView.js';
import { StatusBar } from './components/StatusBar.js';
import { ContextMenu } from './components/ContextMenu.js';
import { WorktreePanel } from './components/WorktreePanel.js';
import { HelpModal } from './components/HelpModal.js';
import { AppErrorBoundary } from './components/AppErrorBoundary.js';
import type { CanopyConfig, Notification, Worktree } from './types/index.js';
import { useCommandExecutor } from './hooks/useCommandExecutor.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useFileTree } from './hooks/useFileTree.js';
import { useAppLifecycle } from './hooks/useAppLifecycle.js';
import { useViewportHeight } from './hooks/useViewportHeight.js';
import { openFile } from './utils/fileOpener.js';
import { countTotalFiles } from './utils/fileTree.js';
import { useWatcher } from './hooks/useWatcher.js';
import path from 'path';
import { useGitStatus } from './hooks/useGitStatus.js';
import { useAIStatus } from './hooks/useAIStatus.js';
import { useProjectIdentity } from './hooks/useProjectIdentity.js';
import { useCopyTree } from './hooks/useCopyTree.js';
import { saveSessionState } from './utils/state.js';
import { events, type ModalId, type ModalContextMap } from './services/events.js'; // Import event bus
import { clearTerminalScreen } from './utils/terminal.js';

interface AppProps {
  cwd: string;
  config?: CanopyConfig;
  noWatch?: boolean;
  noGit?: boolean;
  initialFilter?: string;
}

const AppContent: React.FC<AppProps> = ({ cwd, config: initialConfig, noWatch, noGit, initialFilter }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  // Use full terminal height
  const [height, setHeight] = useState(stdout?.rows || 24);

  useEffect(() => {
    if (!stdout) return;
    
    const handleResize = () => {
      setHeight(stdout.rows);
    };

    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  // Centralized lifecycle management
  const {
    status: lifecycleStatus,
    config,
    worktrees,
    activeWorktreeId: initialActiveWorktreeId,
    activeRootPath: initialActiveRootPath,
    initialSelectedPath,
    initialExpandedFolders,
    initialScrollOffset,
    error: lifecycleError,
    notification: lifecycleNotification,
    setNotification: setLifecycleNotification,
    reinitialize,
  } = useAppLifecycle({ cwd, initialConfig, noWatch, noGit });

  // Local notification state (merged with lifecycle notifications)
  const [notification, setNotification] = useState<Notification | null>(null);

  useEffect(() => {
    if (!lifecycleNotification) {
      return;
    }

    setNotification(lifecycleNotification);
    setLifecycleNotification(null);
  }, [lifecycleNotification, setLifecycleNotification]);
  
  // Subscribe to UI notifications from event bus
  useEffect(() => {
      return events.on('ui:notify', (payload) => {
          setNotification({ type: payload.type, message: payload.message });
      });
  }, []);

  // Listen for file:open events
  useEffect(() => {
    return events.on('file:open', async (payload) => {
      if (!payload.path) return;
      try {
        await openFile(payload.path, config);
        events.emit('ui:notify', { type: 'success', message: `Opened ${path.basename(payload.path)}` });
      } catch (error) {
        events.emit('ui:notify', { type: 'error', message: `Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}` });
      }
    });
  }, [config]);

  // Listen for ui:modal:open events
  const [activeModals, setActiveModals] = useState<Set<ModalId>>(new Set());
  const [modalContext, setModalContext] = useState<Partial<ModalContextMap>>({});

  // Filter state - initialize from CLI if provided
  const [filterActive, setFilterActive] = useState(!!initialFilter);
  const [filterQuery, setFilterQuery] = useState(initialFilter || '');

  // Context menu state
  const [contextMenuTarget, setContextMenuTarget] = useState<string>('');
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Active worktree state (can change via user actions)
  const [activeWorktreeId, setActiveWorktreeId] = useState<string | null>(initialActiveWorktreeId);
  const [activeRootPath, setActiveRootPath] = useState<string>(initialActiveRootPath);
  const selectedPathRef = useRef<string | null>(null);

  // Track scroll offset in a ref to save it without triggering re-renders
  const scrollOffsetRef = useRef(initialScrollOffset || 0);

  // Git visibility state
  const [showGitMarkers, setShowGitMarkers] = useState(config.showGitStatus && !noGit);
  const effectiveConfig = useMemo(
    () => ({ ...config, showGitStatus: showGitMarkers }),
    [config, showGitMarkers]
  );

  const commandMode = activeModals.has('command-bar');
  const isWorktreePanelOpen = activeModals.has('worktree');
  const showHelpModal = activeModals.has('help');
  const contextMenuOpen = activeModals.has('context-menu');
  // Sync active worktree/path from lifecycle on initialization
  useEffect(() => {
    if (lifecycleStatus === 'ready') {
      setActiveWorktreeId(initialActiveWorktreeId);
      setActiveRootPath(initialActiveRootPath);
      scrollOffsetRef.current = initialScrollOffset || 0;
      events.emit('sys:ready', { cwd: initialActiveRootPath });
    }
  }, [lifecycleStatus, initialActiveWorktreeId, initialActiveRootPath, initialScrollOffset]);

  // UseViewportHeight must be declared before useFileTree
  // Reserve a fixed layout height to avoid viewport thrashing when footer content changes
  const headerRows = 3;
  const statusRows = 5;
  const reservedRows = headerRows + statusRows;
  const viewportHeight = useViewportHeight(reservedRows);

  const { gitStatus, gitEnabled, refresh: refreshGitStatus, clear: clearGitStatus, isLoading: isGitLoading } = useGitStatus(
    activeRootPath,
    noGit ? false : config.showGitStatus,
    config.refreshDebounce,
  );

  // Listen for sys:refresh events
  useEffect(() => {
    return events.on('sys:refresh', () => {
      refreshGitStatus(); // Refresh git status
      // useFileTree is already subscribed to sys:refresh internally, so no direct call to refreshTree needed here.
    });
  }, [refreshGitStatus]); // Dependency on refreshGitStatus to ensure latest function is called

  // NEW: Initialize AI Status Hook
  // We pass the gitStatus map; the hook monitors it for activity/silence
  const { status: aiStatus, isAnalyzing } = useAIStatus(activeRootPath, gitStatus, isGitLoading);

  const projectIdentity = useProjectIdentity(activeRootPath);

  // Centralized CopyTree listener (survives StatusBar unmount/hide)
  useCopyTree(activeRootPath);

  useWatcher(activeRootPath, effectiveConfig, !!noWatch);

  const { tree: fileTree, rawTree, expandedFolders, selectedPath } = useFileTree({
    rootPath: activeRootPath,
    config: effectiveConfig,
    filterQuery: filterActive ? filterQuery : null,
    gitStatusMap: gitStatus,
    gitStatusFilter: null,
    initialSelectedPath,
    initialExpandedFolders,
    viewportHeight,
  });

  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);

  useEffect(() => {
    const handleOpen = events.on('ui:modal:open', ({ id, context }) => {
      setActiveModals((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      if (context !== undefined) {
        setModalContext((prev) => ({ ...prev, [id]: context }));
      }
      if (id === 'context-menu') {
        const targetPath = (context as { path?: string } | undefined)?.path || selectedPathRef.current || '';
        if (targetPath) {
          setContextMenuTarget(targetPath);
          setContextMenuPosition({ x: 0, y: 0 });
        }
      }
    });

    const handleClose = events.on('ui:modal:close', ({ id }) => {
      setActiveModals((prev) => {
        if (!id) {
          return new Set();
        }
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setModalContext((prev) => {
        if (!id) {
          return {};
        }
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (!id || id === 'context-menu') {
        setContextMenuTarget('');
      }
    });

    return () => {
      handleOpen();
      handleClose();
    };
  }, []);

  const refreshTree = useCallback(async () => {
    events.emit('sys:refresh');
  }, []);

  const exitApp = useCallback(() => {
    exit();
  }, [exit]);

  const { execute } = useCommandExecutor({
    cwd: activeRootPath,
    selectedPath,
    fileTree: rawTree,
    expandedPaths: expandedFolders,
    refreshTree,
    exitApp,
  });


  useEffect(() => {
    return () => {
      if (activeWorktreeId && selectedPath) {
        void saveSessionState(activeWorktreeId, {
          selectedPath,
          expandedFolders: Array.from(expandedFolders),
          scrollOffset: scrollOffsetRef.current,
          timestamp: Date.now(),
        }).catch((err) => {
          console.error('Error saving session state:', err);
        });
      }
    };
  }, [activeWorktreeId, selectedPath, expandedFolders]);

  useEffect(() => {
    const unsubscribeSubmit = events.on('ui:command:submit', async ({ input }) => {
      await execute(input);
      events.emit('ui:modal:close', { id: 'command-bar' });
    });

    const unsubscribeFilterSet = events.on('ui:filter:set', ({ query }) => {
      setFilterActive(true);
      setFilterQuery(query);
    });

    const unsubscribeFilterClear = events.on('ui:filter:clear', () => {
      setFilterActive(false);
      setFilterQuery('');
    });

    return () => {
      unsubscribeSubmit();
      unsubscribeFilterSet();
      unsubscribeFilterClear();
    };
  }, [execute]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const currentWorktree = worktrees.find(wt => wt.id === activeWorktreeId) || null;

  const modifiedCount = useMemo(() => {
    return Array.from(gitStatus.values()).filter(
      status => status === 'modified' || status === 'added' || status === 'deleted'
    ).length;
  }, [gitStatus]);

  const totalFileCount = useMemo(() => countTotalFiles(fileTree), [fileTree]);

  const handleClearFilter = () => {
    if (activeModals.size > 0) {
      events.emit('ui:modal:close', { id: undefined });
    } else if (filterActive) {
      setFilterActive(false);
      setFilterQuery('');
      events.emit('ui:notify', {
        type: 'info',
        message: 'Filter cleared',
      });
    }
  };

  const handleNextWorktree = () => {
    if (worktrees.length <= 1) return;
    const currentIndex = worktrees.findIndex(wt => wt.id === activeWorktreeId);
    const nextIndex = currentIndex >= 0 && currentIndex < worktrees.length - 1 ? currentIndex + 1 : 0;
    const nextWorktree = worktrees[nextIndex];
    if (nextWorktree) {
      handleSwitchWorktree(nextWorktree);
    }
  };

  const handleSwitchWorktree = useCallback(async (targetWorktree: Worktree) => {
    try {
      if (activeWorktreeId && selectedPath) {
        await saveSessionState(activeWorktreeId, {
          selectedPath,
          expandedFolders: Array.from(expandedFolders),
          scrollOffset: scrollOffsetRef.current,
          timestamp: Date.now(),
        });
      }

      clearGitStatus();

      setActiveWorktreeId(targetWorktree.id);
      setActiveRootPath(targetWorktree.path);

      setFilterActive(false);
      setFilterQuery('');

      events.emit('ui:modal:close', { id: 'worktree' });
      events.emit('ui:notify', {
        type: 'success',
        message: `Switched to ${targetWorktree.branch || targetWorktree.name}`,
      });
    } catch (error) {
      events.emit('ui:notify', {
        type: 'error',
        message: `Failed to switch worktree: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }, [activeWorktreeId, clearGitStatus, expandedFolders, selectedPath]);

  useEffect(() => {
    return events.on('sys:worktree:switch', async ({ worktreeId }) => {
      const targetWorktree = worktrees.find(wt => wt.id === worktreeId);
      if (targetWorktree) {
        await handleSwitchWorktree(targetWorktree);
      } else {
        events.emit('ui:notify', { type: 'error', message: 'Worktree not found' });
      }
    });
  }, [worktrees, handleSwitchWorktree]);

  // handleOpenSelectedFile removed

  // handleCopySelectedPath removed


  const handleToggleGitStatus = () => {
    setShowGitMarkers(!showGitMarkers);
    events.emit('ui:notify', {
      type: 'info',
      message: showGitMarkers ? 'Git markers hidden' : 'Git markers shown',
    });
  };

  const handleQuit = async () => {
    events.emit('sys:quit');
    clearGitStatus();
    clearTerminalScreen();
    exit();
  };

  const handleOpenCopyTreeBuilder = () => {
    events.emit('ui:notify', {
      type: 'info',
      message: 'CopyTree builder coming in Phase 2',
    });
  };

  const handleOpenFilter = () => {
    events.emit('ui:modal:open', { id: 'command-bar', context: { initialInput: '/filter ' } });
  };

  const anyModalOpen = activeModals.size > 0;

  useKeyboard({
    onToggleExpand: anyModalOpen ? undefined : () => {
      if (selectedPath) {
        events.emit('nav:toggle-expand', { path: selectedPath });
      }
    },

    onOpenCommandBar: undefined,
    onOpenFilter: anyModalOpen ? undefined : handleOpenFilter,
    onClearFilter: handleClearFilter,

    onNextWorktree: anyModalOpen ? undefined : handleNextWorktree,
    onOpenWorktreePanel: undefined,

    onToggleGitStatus: anyModalOpen ? undefined : handleToggleGitStatus,
    
    onOpenCopyTreeBuilder: anyModalOpen ? undefined : handleOpenCopyTreeBuilder,

    onRefresh: anyModalOpen ? undefined : () => {
      events.emit('sys:refresh');
    },
    onOpenHelp: undefined,
    onOpenContextMenu: anyModalOpen
      ? undefined
      : () => {
          const path = selectedPathRef.current;
          if (path) {
            events.emit('ui:modal:open', { id: 'context-menu', context: { path } });
          }
        },
    onQuit: handleQuit,
    onForceExit: handleQuit,
    onWarnExit: () => {
      events.emit('ui:notify', {
        type: 'warning',
        message: 'Press Ctrl+C again to quit',
      });
    },
  });

  if (lifecycleStatus === 'initializing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Loading Canopy...</Text>
        <Text dimColor>Initializing configuration and file tree for {cwd}</Text>
      </Box>
    );
  }

  if (lifecycleStatus === 'error') {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="red">
        <Text bold color="red">Initialization Error</Text>
        <Text> </Text>
        <Text>Failed to initialize Canopy:</Text>
        <Text italic color="yellow">{lifecycleError?.message || 'Unknown error'}</Text>
        <Text> </Text>
        <Text dimColor>Press Ctrl+C to exit</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={height}>
      <Header
        cwd={cwd}
        filterActive={filterActive}
        filterQuery={filterQuery}
        currentWorktree={currentWorktree}
        worktreeCount={worktrees.length}
        onWorktreeClick={() => events.emit('ui:modal:open', { id: 'worktree' })}
        identity={projectIdentity}
      />
      <Box flexGrow={1}>
        <TreeView
          fileTree={fileTree}
          selectedPath={selectedPath || ''}
          config={effectiveConfig}
          expandedPaths={expandedFolders}
          disableMouse={anyModalOpen}
          viewportHeight={viewportHeight}
          initialScrollOffset={initialScrollOffset}
          onScroll={(offset) => { scrollOffsetRef.current = offset; }}
        />
      </Box>
      <StatusBar
        notification={notification}
        fileCount={totalFileCount}
        modifiedCount={modifiedCount}
        aiStatus={aiStatus}
        isAnalyzing={isAnalyzing}
        filterQuery={filterActive ? filterQuery : null}
        activeRootPath={activeRootPath}
        commandMode={commandMode}
      />
      {contextMenuOpen && (
        <ContextMenu
          path={contextMenuTarget}
          rootPath={activeRootPath}
          position={contextMenuPosition}
          config={config}
          onClose={() => events.emit('ui:modal:close', { id: 'context-menu' })}
          onAction={(actionType, result) => {
            if (result.success) {
              events.emit('ui:notify', {
                type: 'success',
                message: result.message || 'Action completed',
              });
            } else {
              events.emit('ui:notify', {
                type: 'error',
                message: `Failed to switch worktree: ${result.message || 'Unknown error'}`,
              });
            }
            events.emit('ui:modal:close', { id: 'context-menu' });
          }}
        />
      )}
      {isWorktreePanelOpen && (
        <WorktreePanel
          worktrees={worktrees}
          activeWorktreeId={activeWorktreeId}
          onClose={() => events.emit('ui:modal:close', { id: 'worktree' })}
        />
      )}
      <HelpModal
        visible={showHelpModal}
        onClose={() => events.emit('ui:modal:close', { id: 'help' })}
      />
    </Box>
  );
};

const App: React.FC<AppProps> = (props) => {
  return (
    <AppErrorBoundary>
      <AppContent {...props} />
    </AppErrorBoundary>
  );
};

export default App;
