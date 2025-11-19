import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Text } from 'ink';
import { Header } from './components/Header.js';
import { TreeView } from './components/TreeView.js';
import { StatusBar } from './components/StatusBar.js';
import { CommandBar } from './components/CommandBar.js';
import { ContextMenu } from './components/ContextMenu.js';
import { WorktreePanel } from './components/WorktreePanel.js';
import { HelpModal } from './components/HelpModal.js';
import { AppErrorBoundary } from './components/AppErrorBoundary.js';
import { DEFAULT_CONFIG } from './types/index.js';
import type { YellowwoodConfig, TreeNode, Notification, Worktree } from './types/index.js';
import { executeCommand } from './commands/index.js';
import type { CommandContext } from './commands/index.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useFileTree } from './hooks/useFileTree.js';
import { useAppLifecycle } from './hooks/useAppLifecycle.js';
import { useViewportHeight } from './hooks/useViewportHeight.js';
import { openFile } from './utils/fileOpener.js';
import { copyFilePath } from './utils/clipboard.js';
import path from 'path';
import { useGitStatus } from './hooks/useGitStatus.js';
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
  config?: YellowwoodConfig;
  noWatch?: boolean;
  noGit?: boolean;
  initialFilter?: string;
}

const AppContent: React.FC<AppProps> = ({ cwd, config: initialConfig, noWatch, noGit, initialFilter }) => {
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

  // Command bar state
  const [commandBarActive, setCommandBarActive] = useState(false);
  const [commandBarInput, setCommandBarInput] = useState('');
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

  // Git visibility state (separate from gitEnabled - allows toggling display without stopping git fetching)
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

  // Git status hook - tracks the active root path
  // noGit flag from CLI overrides config.showGitStatus
  const { gitStatus, gitEnabled, refresh: refreshGitStatus, clear: clearGitStatus } = useGitStatus(
    activeRootPath,
    noGit ? false : config.showGitStatus,
    config.refreshDebounce,
  );

  const refreshGitStatusRef = useRef(refreshGitStatus);
  refreshGitStatusRef.current = refreshGitStatus;

  // File tree hook - manages tree state, expansion, selection, filtering
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

  // Context menu state (from PR #73)
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuTarget, setContextMenuTarget] = useState<string>('');
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Viewport height for navigation calculations
  const viewportHeight = useViewportHeight();

  // Flattened tree for keyboard navigation (memoized)
  const flattenedTree = useMemo(
    () => createFlattenedTree(fileTree, expandedFolders),
    [fileTree, expandedFolders]
  );

  // Cleanup watcher on unmount and save session state
  useEffect(() => {
    return () => {
      if (watcherRef.current) {
        void watcherRef.current.stop().catch((err) => {
          console.error('Error stopping watcher on unmount:', err);
        });
      }

      // Save session state on unmount
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

  // Auto-dismiss notifications after 3 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Derive current worktree from activeWorktreeId
  const currentWorktree = worktrees.find(wt => wt.id === activeWorktreeId) || null;

  // Calculate modified count from git status
  const modifiedCount = useMemo(() => {
    return Array.from(gitStatus.values()).filter(
      status => status === 'modified' || status === 'added' || status === 'deleted'
    ).length;
  }, [gitStatus]);

  // File watcher lifecycle - start/stop based on activeRootPath
  useEffect(() => {
    // Stop old watcher if exists
    if (watcherRef.current) {
      void watcherRef.current.stop().catch((err) => {
        console.error('Error stopping watcher:', err);
      });
      watcherRef.current = null;
    }

    // Skip watcher creation if --no-watch flag is set
    if (noWatch) {
      return;
    }

    // Create and start new watcher for current root
    try {
      const watcher = createFileWatcher(activeRootPath, {
        ignored: buildIgnorePatterns(config.customIgnores || []),
        debounce: config.refreshDebounce,
        onAdd: () => {
          refreshTree();
          refreshGitStatusRef.current();
        },
        onChange: () => {
          refreshTree();
          refreshGitStatusRef.current();
        },
        onUnlink: () => {
          refreshTree();
          refreshGitStatusRef.current();
        },
        onAddDir: () => {
          refreshTree();
          refreshGitStatusRef.current();
        },
        onUnlinkDir: () => {
          refreshTree();
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
      // Watcher creation/start failed - notify user but don't crash
      console.error('Failed to start file watcher:', error);
      setNotification({
        type: 'warning',
        message: `File watcher disabled: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      watcherRef.current = null;
    }

    // Cleanup on unmount or path change
    return () => {
      if (watcherRef.current) {
        void watcherRef.current.stop().catch((err) => {
          console.error('Error stopping watcher during cleanup:', err);
        });
        watcherRef.current = null;
      }
    };
  }, [activeRootPath, config, refreshTree, noWatch]);

  // Handle command bar open/close
  const handleOpenCommandBar = () => {
    setCommandBarActive(true);
    setCommandBarInput('');
  };

  const handleCloseCommandBar = () => {
    setCommandBarActive(false);
    setCommandBarInput('');
  };

  // Handle filter clear / ESC key (closes modals/overlays in priority order)
  const handleClearFilter = () => {
    // Priority order: help modal, context menu, worktree panel, command bar, filter
    if (showHelpModal) {
      setShowHelpModal(false);
    } else if (contextMenuOpen) {
      setContextMenuOpen(false);
    } else if (isWorktreePanelOpen) {
      setIsWorktreePanelOpen(false);
    } else if (commandBarActive) {
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

  // Handle cycling to next worktree (w key)
  const handleNextWorktree = () => {
    // No-op if no worktrees or only one worktree
    if (worktrees.length <= 1) {
      return;
    }

    // Find current index
    const currentIndex = worktrees.findIndex(wt => wt.id === activeWorktreeId);

    // Calculate next index with wrap-around
    const nextIndex = currentIndex >= 0 && currentIndex < worktrees.length - 1
      ? currentIndex + 1
      : 0;

    // Switch to next worktree
    const nextWorktree = worktrees[nextIndex];
    if (nextWorktree) {
      handleSwitchWorktree(nextWorktree);
    }
  };

  // Handle worktree switching
  const handleSwitchWorktree = async (targetWorktree: Worktree) => {
    try {
      // Save current session state before switching
      if (activeWorktreeId && selectedPath) {
        await saveSessionState(activeWorktreeId, {
          selectedPath,
          expandedFolders: Array.from(expandedFolders),
          timestamp: Date.now(),
        });
      }

      // Clear git status before switching
      clearGitStatus();

      // Stop current watcher (new one will be created by useEffect when activeRootPath changes)
      if (watcherRef.current) {
        await watcherRef.current.stop();
        watcherRef.current = null;
      }

      // Update active worktree and root path
      // This triggers useFileTree and watcher useEffects to rebuild for new path
      setActiveWorktreeId(targetWorktree.id);
      setActiveRootPath(targetWorktree.path);

      // Clear any active filter when switching
      setFilterActive(false);
      setFilterQuery('');

      // Close panel and show success notification
      setIsWorktreePanelOpen(false);
      setNotification({
        type: 'success',
        message: `Switched to ${targetWorktree.branch || targetWorktree.name}`,
      });
    } catch (error) {
      // Keep panel open on error, show error notification
      setNotification({
        type: 'error',
        message: `Failed to switch worktree: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  // Execute command from command bar
  const handleCommandSubmit = async (input: string) => {
    // Close command bar
    setCommandBarActive(false);

    // Add to history (most recent first)
    setCommandHistory(prev => [input, ...prev.filter(cmd => cmd !== input)].slice(0, 50));

    // Build command context
    const context: CommandContext = {
      state: {
        fileTree,
        expandedFolders,
        selectedPath: selectedPath || '',
        cursorPosition: 0,
        showPreview: false,
        showHelp: showHelpModal,
        contextMenuOpen: contextMenuOpen,
        contextMenuPosition,
        filterActive,
        filterQuery,
        filteredPaths: [],
        gitStatus,
        gitEnabled,
        notification,
        commandBarActive,
        commandBarInput,
        commandHistory,
        config,
        worktrees,
        activeWorktreeId,
      },
      originalFileTree: rawTree,
      setFilterActive: (active: boolean) => {
        setFilterActive(active);
        if (!active) {
          setFilterQuery('');
        }
      },
      setFilterQuery,
      setFileTree: () => {
        // No-op: filtering is now handled by useFileTree hook
        // Commands should use setFilterQuery and setFilterActive instead
      },
      notify: setNotification,
      addToHistory: (cmd: string) => {
        setCommandHistory(prev => [cmd, ...prev.filter(c => c !== cmd)].slice(0, 50));
      },
      worktrees,
      activeWorktreeId,
      switchToWorktree: handleSwitchWorktree,
    };

    // Execute command
    const result = await executeCommand(input, context);

    // Show notification if command provided one
    if (result.notification) {
      setNotification(result.notification);
    }

    // Clear input
    setCommandBarInput('');
  };

  // File operation handlers (from PR #73)
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

  const handleCopySelectedPath = async () => {
    if (!selectedPath) return;

    try {
      await copyFilePath(selectedPath, activeRootPath, false); // false = absolute path
      setNotification({
        type: 'success',
        message: 'Path copied to clipboard',
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
    setContextMenuPosition({ x: 0, y: 0 }); // Simple positioning
    setContextMenuOpen(true);
  };

  // Navigation handlers using shared navigation logic
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

  // Git marker visibility toggle
  const handleToggleGitStatus = () => {
    setShowGitMarkers(!showGitMarkers);
    setNotification({
      type: 'info',
      message: showGitMarkers ? 'Git markers hidden' : 'Git markers shown',
    });
  };

  // Help modal toggle
  const handleOpenHelp = () => {
    setShowHelpModal(!showHelpModal);
  };

  // Quit handler
  const handleQuit = async () => {
    // Stop file watcher
    if (watcherRef.current) {
      try {
        await watcherRef.current.stop();
      } catch (error) {
        console.error('Error stopping watcher on quit:', error);
      }
    }
    // Clear git status (cleanup)
    clearGitStatus();
    // Exit
    process.exit(0);
  };

  // CopyTree builder placeholder
  const handleOpenCopyTreeBuilder = () => {
    setNotification({
      type: 'info',
      message: 'CopyTree builder coming in Phase 2',
    });
  };

  // Filter with prefill (Ctrl+F)
  const handleOpenFilter = () => {
    setCommandBarActive(true);
    setCommandBarInput('/filter ');
  };

  // Determine if keyboard handlers should be disabled (modal/overlay is open)
  const anyModalOpen = showHelpModal || commandBarActive || contextMenuOpen || isWorktreePanelOpen;

  // Set up keyboard handlers
  useKeyboard({
    // Navigation (disabled when modal open)
    onNavigateUp: anyModalOpen ? undefined : handleNavigateUp,
    onNavigateDown: anyModalOpen ? undefined : handleNavigateDown,
    onNavigateLeft: anyModalOpen ? undefined : handleNavigateLeft,
    onNavigateRight: anyModalOpen ? undefined : handleNavigateRight,
    onPageUp: anyModalOpen ? undefined : handlePageUp,
    onPageDown: anyModalOpen ? undefined : handlePageDown,
    onHome: anyModalOpen ? undefined : handleHome,
    onEnd: anyModalOpen ? undefined : handleEnd,

    // File/folder actions (disabled when modal open)
    onOpenFile: anyModalOpen ? undefined : handleOpenSelectedFile,
    onToggleExpand: anyModalOpen ? undefined : () => {
      if (selectedPath) {
        toggleFolder(selectedPath);
      }
    },

    // Commands (some work with modals)
    onOpenCommandBar: anyModalOpen ? undefined : handleOpenCommandBar,
    onOpenFilter: anyModalOpen ? undefined : handleOpenFilter,
    onClearFilter: handleClearFilter, // Always active - closes modals

    // Worktrees (disabled when modal open)
    onNextWorktree: anyModalOpen ? undefined : handleNextWorktree,
    onOpenWorktreePanel: anyModalOpen ? undefined : () => setIsWorktreePanelOpen(true),

    // Git (disabled when modal open)
    onToggleGitStatus: anyModalOpen ? undefined : handleToggleGitStatus,

    // Copy (disabled when modal open)
    onCopyPath: anyModalOpen ? undefined : handleCopySelectedPath,
    onOpenCopyTreeBuilder: anyModalOpen ? undefined : handleOpenCopyTreeBuilder,

    // UI actions
    onRefresh: anyModalOpen ? undefined : () => {
      refreshTree();
      refreshGitStatus();
    },
    onOpenHelp: handleOpenHelp, // Always active - toggles help
    onOpenContextMenu: anyModalOpen ? undefined : handleOpenContextMenu,
    onQuit: handleQuit, // Always active - can quit from anywhere
  });

  // Create effective config with git marker visibility applied
  const effectiveConfig = useMemo(
    () => ({ ...config, showGitStatus: showGitMarkers }),
    [config, showGitMarkers]
  );

  // Show loading screen during lifecycle initialization
  if (lifecycleStatus === 'initializing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Loading Yellowwood...</Text>
        <Text dimColor>Initializing configuration and file tree for {cwd}</Text>
      </Box>
    );
  }

  // Show error screen if lifecycle failed
  if (lifecycleStatus === 'error') {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="red">
        <Text bold color="red">
          Initialization Error
        </Text>
        <Text> </Text>
        <Text>Failed to initialize Yellowwood:</Text>
        <Text italic color="yellow">
          {lifecycleError?.message || 'Unknown error'}
        </Text>
        <Text> </Text>
        <Text dimColor>Press Ctrl+C to exit</Text>
      </Box>
    );
  }

  // Show loading indicator for incremental tree refreshes (but keep UI visible)
  const showTreeLoading = treeLoading && fileTree.length === 0;

  return (
    <Box flexDirection="column" height="100%">
      <Header
        cwd={cwd}
        filterActive={filterActive}
        filterQuery={filterQuery}
        currentWorktree={currentWorktree}
        worktreeCount={worktrees.length}
        onWorktreeClick={() => setIsWorktreePanelOpen(true)}
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
        />
      </Box>
      <StatusBar
        notification={notification}
        fileCount={fileTree.length}
        modifiedCount={modifiedCount}
        filterQuery={filterActive ? filterQuery : null}
      />
      <CommandBar
        active={commandBarActive}
        input={commandBarInput}
        history={commandHistory}
        onInputChange={setCommandBarInput}
        onSubmit={handleCommandSubmit}
        onCancel={handleCloseCommandBar}
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

// Wrapper component with error boundary
const App: React.FC<AppProps> = (props) => {
  return (
    <AppErrorBoundary>
      <AppContent {...props} />
    </AppErrorBoundary>
  );
};

export default App;
