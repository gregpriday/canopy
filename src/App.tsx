import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Text, useApp, useStdout } from 'ink';
import { Header } from './components/Header.js';
import { TreeView } from './components/TreeView.js';
import { StatusBar } from './components/StatusBar.js';
import type { StatusBarRef } from './components/StatusBar.js'; // Import the ref type
import { ContextMenu } from './components/ContextMenu.js';
import { WorktreePanel } from './components/WorktreePanel.js';
import { HelpModal } from './components/HelpModal.js';
import { AppErrorBoundary } from './components/AppErrorBoundary.js';
import { DEFAULT_CONFIG } from './types/index.js';
import type { CanopyConfig, TreeNode, Notification, Worktree } from './types/index.js';
import { useCommandExecutor } from './hooks/useCommandExecutor.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useFileTree } from './hooks/useFileTree.js';
import { useAppLifecycle } from './hooks/useAppLifecycle.js';
import { useViewportHeight } from './hooks/useViewportHeight.js';
import { openFile } from './utils/fileOpener.js';
import { copyFilePath } from './utils/clipboard.js';
import clipboardy from 'clipboardy';
import path from 'path';
import { useGitStatus } from './hooks/useGitStatus.js';
import { useProjectIdentity } from './hooks/useProjectIdentity.js';
import { createFileWatcher, buildIgnorePatterns } from './utils/fileWatcher.js';
import type { FileWatcher } from './utils/fileWatcher.js';
import { saveSessionState } from './utils/state.js';
import {
  createFlattenedTree,
  moveSelection,
  jumpToStart,
  jumpToEnd,
  getCurrentNode,
  getRightArrowAction,
  getLeftArrowAction,
} from './utils/treeNavigation.js';

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

  // Command bar state (now managing StatusBar command mode)
  const [commandMode, setCommandMode] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);

  // Filter state - initialize from CLI if provided
  const [filterActive, setFilterActive] = useState(!!initialFilter);
  const [filterQuery, setFilterQuery] = useState(initialFilter || '');

  // Active worktree state (can change via user actions)
  const [activeWorktreeId, setActiveWorktreeId] = useState<string | null>(initialActiveWorktreeId);
  const [activeRootPath, setActiveRootPath] = useState<string>(initialActiveRootPath);
  const [isWorktreePanelOpen, setIsWorktreePanelOpen] = useState(false);

  // Modal/overlay state
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Git visibility state
  const [showGitMarkers, setShowGitMarkers] = useState(config.showGitStatus && !noGit);

  // Sync active worktree/path from lifecycle on initialization
  useEffect(() => {
    if (lifecycleStatus === 'ready') {
      setActiveWorktreeId(initialActiveWorktreeId);
      setActiveRootPath(initialActiveRootPath);
    }
  }, [lifecycleStatus, initialActiveWorktreeId, initialActiveRootPath]);

  // File watcher ref
  const watcherRef = useRef<FileWatcher | null>(null);
  
  // StatusBar ref to trigger internal methods
  const statusBarRef = useRef<StatusBarRef>(null);

  const { gitStatus, gitEnabled, refresh: refreshGitStatus, clear: clearGitStatus } = useGitStatus(
    activeRootPath,
    noGit ? false : config.showGitStatus,
    config.refreshDebounce,
  );

  const projectIdentity = useProjectIdentity(activeRootPath);

  const refreshGitStatusRef = useRef(refreshGitStatus);
  refreshGitStatusRef.current = refreshGitStatus;

  const {
    tree: fileTree,
    rawTree,
    expandedFolders,
    selectedPath,
    loading: treeLoading,
    selectPath,
    toggleFolder,
    refresh: refreshTree,
  } = useFileTree({
    rootPath: activeRootPath,
    config,
    filterQuery: filterActive ? filterQuery : null,
    gitStatusMap: gitStatus,
    initialSelectedPath,
    initialExpandedFolders,
  });

  const { execute } = useCommandExecutor({
    cwd: activeRootPath,
    selectedPath,
    fileTree,
    expandedPaths: expandedFolders,
    setNotification,
    refreshTree,
    exitApp: exit
  });

  // Stable reference for refreshTree to prevent watcher recreation
  const refreshTreeRef = useRef(refreshTree);
  refreshTreeRef.current = refreshTree;

  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuTarget, setContextMenuTarget] = useState<string>('');
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Viewport height for navigation calculations (Header=3 + StatusBar=5)
  const viewportHeight = useViewportHeight(8);

  const flattenedTree = useMemo(
    () => createFlattenedTree(fileTree, expandedFolders),
    [fileTree, expandedFolders]
  );

  useEffect(() => {
    return () => {
      if (watcherRef.current) {
        void watcherRef.current.stop().catch((err) => {
          console.error('Error stopping watcher on unmount:', err);
        });
      }

      if (activeWorktreeId && selectedPath) {
        void saveSessionState(activeWorktreeId, {
          selectedPath,
          expandedFolders: Array.from(expandedFolders),
          timestamp: Date.now(),
        }).catch((err) => {
          console.error('Error saving session state:', err);
        });
      }
    };
  }, [activeWorktreeId, selectedPath, expandedFolders]);

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

  useEffect(() => {
    if (watcherRef.current) {
      void watcherRef.current.stop().catch((err) => {
        console.error('Error stopping watcher:', err);
      });
      watcherRef.current = null;
    }

    if (noWatch) {
      return;
    }

    try {
      const watcher = createFileWatcher(activeRootPath, {
        ignored: buildIgnorePatterns(config.customIgnores || []),
        debounce: config.refreshDebounce,
        usePolling: config.usePolling,
        onAdd: () => {
          refreshTreeRef.current();
          refreshGitStatusRef.current();
        },
        onChange: () => {
          refreshTreeRef.current();
          refreshGitStatusRef.current();
        },
        onUnlink: () => {
          refreshTreeRef.current();
          refreshGitStatusRef.current();
        },
        onAddDir: () => {
          refreshTreeRef.current();
          refreshGitStatusRef.current();
        },
        onUnlinkDir: () => {
          refreshTreeRef.current();
          refreshGitStatusRef.current();
        },
        onError: (error) => {
          setNotification({
            type: 'error',
            message: `File watcher error: ${error.message}`,
          });
        },
      });

      watcher.start();
      watcherRef.current = watcher;
    } catch (error) {
      console.error('Failed to start file watcher:', error);
      setNotification({
        type: 'warning',
        message: `File watcher disabled: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      watcherRef.current = null;
    }

    return () => {
      if (watcherRef.current) {
        void watcherRef.current.stop().catch((err) => {
          console.error('Error stopping watcher during cleanup:', err);
        });
        watcherRef.current = null;
      }
    };
  }, [activeRootPath, config.refreshDebounce, config.customIgnores, config.usePolling, noWatch]);

  // Handle command bar open/close
  const handleOpenCommandBar = () => {
    setCommandMode(true);
  };

  const handleCloseCommandBar = () => {
    setCommandMode(false);
  };

  const handleClearFilter = () => {
    if (showHelpModal) {
      setShowHelpModal(false);
    } else if (contextMenuOpen) {
      setContextMenuOpen(false);
    } else if (isWorktreePanelOpen) {
      setIsWorktreePanelOpen(false);
    } else if (commandMode) {
      handleCloseCommandBar();
    } else if (filterActive) {
      setFilterActive(false);
      setFilterQuery('');
      setNotification({
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

  const handleSwitchWorktree = async (targetWorktree: Worktree) => {
    try {
      if (activeWorktreeId && selectedPath) {
        await saveSessionState(activeWorktreeId, {
          selectedPath,
          expandedFolders: Array.from(expandedFolders),
          timestamp: Date.now(),
        });
      }

      clearGitStatus();

      if (watcherRef.current) {
        await watcherRef.current.stop();
        watcherRef.current = null;
      }

      setActiveWorktreeId(targetWorktree.id);
      setActiveRootPath(targetWorktree.path);

      setFilterActive(false);
      setFilterQuery('');

      setIsWorktreePanelOpen(false);
      setNotification({
        type: 'success',
        message: `Switched to ${targetWorktree.branch || targetWorktree.name}`,
      });
    } catch (error) {
      setNotification({
        type: 'error',
        message: `Failed to switch worktree: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  // Execute command from status bar input
  const handleCommandSubmit = async (input: string) => {
    setCommandMode(false);
    setCommandHistory(prev => [input, ...prev.filter(cmd => cmd !== input)].slice(0, 50));

    await execute(input);
  };

  const handleOpenSelectedFile = async () => {
    if (!selectedPath) return;

    try {
      await openFile(selectedPath, config);
      setNotification({
        type: 'success',
        message: `Opened ${path.basename(selectedPath)}`,
      });
    } catch (error) {
      setNotification({
        type: 'error',
        message: `Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  const handleCopySelectedPath = async (targetPath?: string) => {
    const pathToString = targetPath || selectedPath;
    if (!pathToString) return;

    try {
      await copyFilePath(pathToString, activeRootPath, true);
      const relativePath = await clipboardy.read();
      const finalCopiedPath = `@${relativePath}`;
      await clipboardy.write(finalCopiedPath);

      setNotification({
        type: 'success',
        message: `Copied: ${finalCopiedPath}`,
      });
    } catch (error) {
      setNotification({
        type: 'error',
        message: `Failed to copy path: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  const handleOpenContextMenu = () => {
    if (!selectedPath) return;
    setContextMenuTarget(selectedPath);
    setContextMenuPosition({ x: 0, y: 0 });
    setContextMenuOpen(true);
  };

  // Navigation handlers
  const handleNavigateUp = () => {
    if (flattenedTree.length === 0) return;
    const newPath = moveSelection(flattenedTree, selectedPath || '', -1);
    selectPath(newPath);
  };

  const handleNavigateDown = () => {
    if (flattenedTree.length === 0) return;
    const newPath = moveSelection(flattenedTree, selectedPath || '', 1);
    selectPath(newPath);
  };

  const handlePageUp = () => {
    if (flattenedTree.length === 0) return;
    const newPath = moveSelection(flattenedTree, selectedPath || '', -viewportHeight);
    selectPath(newPath);
  };

  const handlePageDown = () => {
    if (flattenedTree.length === 0) return;
    const newPath = moveSelection(flattenedTree, selectedPath || '', viewportHeight);
    selectPath(newPath);
  };

  const handleHome = () => {
    if (flattenedTree.length === 0) return;
    const newPath = jumpToStart(flattenedTree);
    if (newPath) selectPath(newPath);
  };

  const handleEnd = () => {
    if (flattenedTree.length === 0) return;
    const newPath = jumpToEnd(flattenedTree);
    if (newPath) selectPath(newPath);
  };

  const handleNavigateLeft = () => {
    if (flattenedTree.length === 0) return;
    const currentNode = getCurrentNode(flattenedTree, selectedPath || '');
    const action = getLeftArrowAction(currentNode, flattenedTree, expandedFolders);

    if (action.type === 'collapse' && action.path) {
      toggleFolder(action.path);
    } else if (action.type === 'parent' && action.path) {
      selectPath(action.path);
    }
  };

  const handleNavigateRight = () => {
    if (flattenedTree.length === 0) return;
    const currentNode = getCurrentNode(flattenedTree, selectedPath || '');
    const action = getRightArrowAction(currentNode, expandedFolders);

    if (action === 'expand' && currentNode) {
      toggleFolder(currentNode.path);
    } else if (action === 'open') {
      handleOpenSelectedFile();
    }
  };

  const handleToggleGitStatus = () => {
    setShowGitMarkers(!showGitMarkers);
    setNotification({
      type: 'info',
      message: showGitMarkers ? 'Git markers hidden' : 'Git markers shown',
    });
  };

  const handleOpenHelp = () => {
    setShowHelpModal(!showHelpModal);
  };

  const handleQuit = async () => {
    if (watcherRef.current) {
      try {
        await watcherRef.current.stop();
      } catch (error) {
        console.error('Error stopping watcher on quit:', error);
      }
    }
    clearGitStatus();
    exit();
  };

  const handleOpenCopyTreeBuilder = () => {
    setNotification({
      type: 'info',
      message: 'CopyTree builder coming in Phase 2',
    });
  };

  const handleOpenFilter = () => {
    setCommandMode(true);
    // Logic to prefill '/filter ' will be handled in StatusBar if needed,
    // but since StatusBar only listens to commandMode, we might need a separate effect or prop for initial input.
    // For now, the user just types /filter.
    // Note: To perfectly replicate 'Ctrl+F -> /filter ', we might need a way to set the input.
    // InlineInput handles its own state. 
    // I'll add 'initialInput' to StatusBar if needed, but for now let's stick to basic command mode.
  };

  const anyModalOpen = showHelpModal || commandMode || contextMenuOpen || isWorktreePanelOpen;

  useKeyboard({
    onNavigateUp: anyModalOpen ? undefined : handleNavigateUp,
    onNavigateDown: anyModalOpen ? undefined : handleNavigateDown,
    onNavigateLeft: anyModalOpen ? undefined : handleNavigateLeft,
    onNavigateRight: anyModalOpen ? undefined : handleNavigateRight,
    onPageUp: anyModalOpen ? undefined : handlePageUp,
    onPageDown: anyModalOpen ? undefined : handlePageDown,
    onHome: anyModalOpen ? undefined : handleHome,
    onEnd: anyModalOpen ? undefined : handleEnd,

    onOpenFile: anyModalOpen ? undefined : handleOpenSelectedFile,
    onToggleExpand: anyModalOpen ? undefined : () => {
      if (selectedPath) {
        toggleFolder(selectedPath);
      }
    },

    onOpenCommandBar: anyModalOpen ? undefined : handleOpenCommandBar,
    onOpenFilter: anyModalOpen ? undefined : handleOpenFilter,
    onClearFilter: handleClearFilter,

    onNextWorktree: anyModalOpen ? undefined : handleNextWorktree,
    onOpenWorktreePanel: anyModalOpen ? undefined : () => setIsWorktreePanelOpen(true),

    onToggleGitStatus: anyModalOpen ? undefined : handleToggleGitStatus,

    onCopyPath: anyModalOpen ? undefined : () => {
      statusBarRef.current?.triggerCopyTree();
    },
    onOpenCopyTreeBuilder: anyModalOpen ? undefined : handleOpenCopyTreeBuilder,
    onCopyTreeShortcut: anyModalOpen ? undefined : () => {
      statusBarRef.current?.triggerCopyTree();
    },

    onRefresh: anyModalOpen ? undefined : () => {
      refreshTree();
      refreshGitStatus();
    },
    onOpenHelp: handleOpenHelp,
    onOpenContextMenu: anyModalOpen ? undefined : handleOpenContextMenu,
    onQuit: handleQuit,
    onForceExit: handleQuit,
    onWarnExit: () => {
      setNotification({
        type: 'warning',
        message: 'Press Ctrl+C again to quit',
      });
    },
  });

  const effectiveConfig = useMemo(
    () => ({ ...config, showGitStatus: showGitMarkers }),
    [config, showGitMarkers]
  );

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
        onWorktreeClick={() => setIsWorktreePanelOpen(true)}
        identity={projectIdentity}
      />
      <Box flexGrow={1}>
        <TreeView
          fileTree={fileTree}
          selectedPath={selectedPath || ''}
          onSelect={selectPath}
          config={effectiveConfig}
          expandedPaths={expandedFolders}
          onToggleExpand={toggleFolder}
          disableKeyboard={true}
          onCopyPath={handleCopySelectedPath}
        />
      </Box>
      <StatusBar
        ref={statusBarRef}
        notification={notification}
        fileCount={fileTree.length}
        modifiedCount={modifiedCount}
        filterQuery={filterActive ? filterQuery : null}
        activeRootPath={activeRootPath}
        commandMode={commandMode}
        onSetCommandMode={setCommandMode}
        onCommandSubmit={handleCommandSubmit}
      />
      {contextMenuOpen && (
        <ContextMenu
          path={contextMenuTarget}
          rootPath={activeRootPath}
          position={contextMenuPosition}
          config={config}
          onClose={() => setContextMenuOpen(false)}
          onAction={(actionType, result) => {
            if (result.success) {
              setNotification({
                type: 'success',
                message: result.message || 'Action completed',
              });
            } else {
              setNotification({
                type: 'error',
                message: result.message || 'Action failed',
              });
            }
            setContextMenuOpen(false);
          }}
        />
      )}
      {isWorktreePanelOpen && (
        <WorktreePanel
          worktrees={worktrees}
          activeWorktreeId={activeWorktreeId}
          onSelect={(worktreeId) => {
            const targetWorktree = worktrees.find(wt => wt.id === worktreeId);
            if (targetWorktree) {
              handleSwitchWorktree(targetWorktree);
            }
          }}
          onClose={() => setIsWorktreePanelOpen(false)}
        />
      )}
      <HelpModal
        visible={showHelpModal}
        onClose={() => setShowHelpModal(false)}
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