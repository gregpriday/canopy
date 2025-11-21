import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'; // Added useCallback
import { Box, Text, useApp, useStdout } from 'ink';
import { Header } from './components/Header.js';
import { TreeView } from './components/TreeView.js';
import { StatusBar } from './components/StatusBar.js';
import { ContextMenu } from './components/ContextMenu.js';
import { WorktreePanel } from './components/WorktreePanel.js';
import { HelpModal } from './components/HelpModal.js';
import { AppErrorBoundary } from './components/AppErrorBoundary.js';
import type { CanopyConfig, Notification, Worktree, TreeNode, GitStatus } from './types/index.js';
import { useCommandExecutor } from './hooks/useCommandExecutor.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useFileTree } from './hooks/useFileTree.js';
import { useAppLifecycle } from './hooks/useAppLifecycle.js';
import { useViewportHeight } from './hooks/useViewportHeight.js';
import { openFile } from './utils/fileOpener.js';
import { countTotalFiles } from './utils/fileTree.js';
import { copyFilePath } from './utils/clipboard.js';
import { useWatcher } from './hooks/useWatcher.js';
import path from 'path';
import { useGitStatus } from './hooks/useGitStatus.js';
import { useAIStatus } from './hooks/useAIStatus.js';
import { useProjectIdentity } from './hooks/useProjectIdentity.js';
import { useWorktreeSummaries } from './hooks/useWorktreeSummaries.js';
import { useCopyTree } from './hooks/useCopyTree.js';
import { saveSessionState, loadSessionState } from './utils/state.js';
import { events, type ModalId, type ModalContextMap } from './services/events.js'; // Import event bus
import { clearTerminalScreen } from './utils/terminal.js';
import { ThemeProvider } from './theme/ThemeProvider.js';
import { detectTerminalTheme } from './theme/colorPalette.js';

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
    initialGitOnlyMode,
    error: lifecycleError,
    notification: lifecycleNotification,
    setNotification: setLifecycleNotification,
    reinitialize,
  } = useAppLifecycle({ cwd, initialConfig, noWatch, noGit });

  // Enrich worktrees with AI-generated summaries
  const enrichedWorktrees = useWorktreeSummaries(
    worktrees,
    'main',
    config.worktrees?.refreshIntervalMs || 0
  );

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

  // Mutable initial selection state for session restoration during worktree switches
  const [initialSelection, setInitialSelection] = useState<{
    selectedPath: string | null;
    expandedFolders: Set<string>;
  }>({
    selectedPath: initialSelectedPath,
    expandedFolders: initialExpandedFolders,
  });

  // Git-only view mode state
  const [gitOnlyMode, setGitOnlyMode] = useState<boolean>(initialGitOnlyMode);
  // Cache the expansion state before entering git-only mode for restoration on exit
  const previousExpandedFoldersRef = useRef<Set<string> | null>(null);

  // Track latest requested worktree to prevent race conditions during rapid switches
  const latestWorktreeSwitchRef = useRef<string | null>(null);

  // Track worktree switching state for UI feedback
  const [isSwitchingWorktree, setIsSwitchingWorktree] = useState(false);
  const lastWorktreeSwitchTime = useRef<number>(0);
  const WORKTREE_SWITCH_DEBOUNCE_MS = 300; // Prevent double-switches

  // Listen for file:copy-path events
  useEffect(() => {
    return events.on('file:copy-path', async (payload) => {
      const pathToCopy = payload.path || selectedPathRef.current;
      if (!pathToCopy) return;

      try {
        // Normalize paths to absolute (copyFilePath requires absolute paths)
        const normalizedRoot = path.isAbsolute(activeRootPath)
          ? activeRootPath
          : path.resolve(activeRootPath);
        const normalizedPath = path.isAbsolute(pathToCopy)
          ? pathToCopy
          : path.resolve(normalizedRoot, pathToCopy);

        await copyFilePath(normalizedPath, normalizedRoot, true); // Use relative paths
        events.emit('ui:notify', { type: 'success', message: 'Path copied to clipboard' });
      } catch (error) {
        events.emit('ui:notify', { type: 'error', message: `Failed to copy path: ${error instanceof Error ? error.message : 'Unknown error'}` });
      }
    });
  }, [activeRootPath]);

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
      events.emit('sys:ready', { cwd: initialActiveRootPath });
    }
  }, [lifecycleStatus, initialActiveWorktreeId, initialActiveRootPath]);

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

  // Resolve theme mode (auto detects terminal background)
  const themeMode = useMemo(() => {
    const configTheme = effectiveConfig.theme || 'auto';
    return configTheme === 'auto' ? detectTerminalTheme() : configTheme;
  }, [effectiveConfig.theme]);

  // Extract project accent colors for theme
  const projectAccent = useMemo(() => {
    if (projectIdentity) {
      return {
        primary: projectIdentity.gradientStart,
        secondary: projectIdentity.gradientEnd,
      };
    }
    return undefined;
  }, [projectIdentity]);

  // Centralized CopyTree listener (survives StatusBar unmount/hide)
  useCopyTree(activeRootPath);

  useWatcher(activeRootPath, effectiveConfig, !!noWatch);

  // Calculate git status filter based on git-only mode
  const gitStatusFilter = gitOnlyMode
    ? (['modified', 'added', 'deleted', 'untracked'] as GitStatus[])
    : null;

  const { tree: fileTree, rawTree, expandedFolders, selectedPath } = useFileTree({
    rootPath: activeRootPath,
    config: effectiveConfig,
    filterQuery: filterActive ? filterQuery : null,
    gitStatusMap: gitStatus,
    gitStatusFilter,
    initialSelectedPath: initialSelection.selectedPath,
    initialExpandedFolders: initialSelection.expandedFolders,
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
      if (activeWorktreeId) {
        void saveSessionState(activeWorktreeId, {
          selectedPath,
          expandedFolders: Array.from(expandedFolders),
          gitOnlyMode,
          timestamp: Date.now(),
        }).catch((err) => {
          console.error('Error saving session state:', err);
        });
      }
    };
  }, [activeWorktreeId, selectedPath, expandedFolders, gitOnlyMode]);

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
      }, 2000); // Auto-clear notifications after 2 seconds
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const currentWorktree = enrichedWorktrees.find(wt => wt.id === activeWorktreeId) || null;

  const modifiedCount = useMemo(() => {
    return Array.from(gitStatus.values()).filter(
      status => status === 'modified' || status === 'added' || status === 'deleted'
    ).length;
  }, [gitStatus]);

  const totalFileCount = useMemo(() => countTotalFiles(fileTree), [fileTree]);

  // Helper function to collect all folder paths from a tree
  const collectAllFolderPaths = useCallback((tree: TreeNode[]): string[] => {
    const paths: string[] = [];
    function traverse(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.type === 'directory') {
          paths.push(node.path);
          if (node.children) {
            traverse(node.children);
          }
        }
      }
    }
    traverse(tree);
    return paths;
  }, []);

  // Handle git-only mode toggle
  const handleToggleGitOnlyMode = useCallback(() => {
    if (!gitOnlyMode) {
      // Entering git-only mode

      // Safety check: if we have a large changeset (>100 files), don't auto-expand
      const changedFilesCount = fileTree.length > 0 ? countTotalFiles(fileTree) : 0;

      if (changedFilesCount > 100) {
        // Large changeset - skip auto-expansion for performance
        setGitOnlyMode(true);
        events.emit('ui:notify', {
          type: 'warning',
          message: 'Large changeset detected. Folders collapsed for performance.',
        });
      } else {
        // Cache current expansion state
        previousExpandedFoldersRef.current = new Set(expandedFolders);

        // Auto-expand all folders in the current tree
        const allFolderPaths = collectAllFolderPaths(fileTree);

        // Update expanded folders via event system
        allFolderPaths.forEach(folderPath => {
          events.emit('nav:expand', { path: folderPath });
        });

        setGitOnlyMode(true);
        events.emit('ui:notify', {
          type: 'info',
          message: 'Git-only view enabled',
        });
      }
    } else {
      // Exiting git-only mode - restore previous expansion state
      if (previousExpandedFoldersRef.current) {
        // First collapse all folders
        Array.from(expandedFolders).forEach(folderPath => {
          events.emit('nav:collapse', { path: folderPath });
        });

        // Then restore the cached expansion state
        Array.from(previousExpandedFoldersRef.current).forEach(folderPath => {
          events.emit('nav:expand', { path: folderPath });
        });

        previousExpandedFoldersRef.current = null;
      }

      setGitOnlyMode(false);
      events.emit('ui:notify', {
        type: 'info',
        message: 'All files view enabled',
      });
    }
  }, [gitOnlyMode, fileTree, expandedFolders, collectAllFolderPaths]);

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
    } else {
      // No modals open and no filter active - clear selection
      events.emit('nav:clear-selection');
    }
  };

  const handleNextWorktree = () => {
    // Edge case: only one worktree
    if (enrichedWorktrees.length <= 1) {
      events.emit('ui:notify', {
        type: 'info',
        message: 'Only one worktree available',
      });
      return;
    }

    // Debounce rapid key presses to prevent double-switching
    const now = Date.now();
    if (now - lastWorktreeSwitchTime.current < WORKTREE_SWITCH_DEBOUNCE_MS) {
      return; // Ignore rapid presses
    }
    lastWorktreeSwitchTime.current = now;

    // Find next worktree (wrap around to first after last)
    const currentIndex = enrichedWorktrees.findIndex(wt => wt.id === activeWorktreeId);
    const nextIndex = (currentIndex + 1) % enrichedWorktrees.length;
    const nextWorktree = enrichedWorktrees[nextIndex];

    if (nextWorktree) {
      handleSwitchWorktree(nextWorktree);
    }
  };

  const handleSwitchWorktree = useCallback(async (targetWorktree: Worktree) => {
    // Mark this as the latest requested switch to prevent race conditions
    latestWorktreeSwitchRef.current = targetWorktree.id;

    // Show switching state in UI
    setIsSwitchingWorktree(true);

    try {
      // Show "Switching to..." notification
      events.emit('ui:notify', {
        type: 'info',
        message: `Switching to ${targetWorktree.branch || targetWorktree.name}...`,
      });

      // 1. Save current worktree's session BEFORE switching
      if (activeWorktreeId) {
        await saveSessionState(activeWorktreeId, {
          selectedPath,
          expandedFolders: Array.from(expandedFolders),
          gitOnlyMode,
          timestamp: Date.now(),
        });
      }

      // 2. Load target worktree's session
      const session = await loadSessionState(targetWorktree.id);

      // 3. Check if a newer switch was requested while we were awaiting - bail out if so
      if (latestWorktreeSwitchRef.current !== targetWorktree.id) {
        return; // A newer switch is in progress, don't apply stale state
      }

      const nextSelectedPath = session?.selectedPath ?? null;
      const nextExpandedFolders = new Set(session?.expandedFolders ?? []);
      const nextGitOnlyMode = session?.gitOnlyMode ?? false;

      // 4. Update all state atomically
      setActiveWorktreeId(targetWorktree.id);
      setActiveRootPath(targetWorktree.path);
      setInitialSelection({
        selectedPath: nextSelectedPath,
        expandedFolders: nextExpandedFolders,
      });
      setGitOnlyMode(nextGitOnlyMode);

      // 5. Reset transient UI state
      setFilterActive(false);
      setFilterQuery('');
      clearGitStatus();

      // 6. Notify user of success
      events.emit('ui:modal:close', { id: 'worktree' });

      // Build notification message with summary if available
      let message = `Switched to ${targetWorktree.branch || targetWorktree.name}`;
      if (targetWorktree.summary) {
        message += ` — ${targetWorktree.summary}`;
      }
      if (targetWorktree.modifiedCount !== undefined && targetWorktree.modifiedCount > 0) {
        message += ` [${targetWorktree.modifiedCount} files]`;
      }

      events.emit('ui:notify', {
        type: 'success',
        message,
      });
    } catch (error) {
      // Only show error if this is still the latest requested switch
      if (latestWorktreeSwitchRef.current === targetWorktree.id) {
        events.emit('ui:notify', {
          type: 'error',
          message: `Failed to switch worktree: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    } finally {
      // Only clear the indicator if this was the latest requested switch
      if (latestWorktreeSwitchRef.current === targetWorktree.id) {
        setIsSwitchingWorktree(false);
      }
    }
  }, [activeWorktreeId, clearGitStatus, expandedFolders, selectedPath]);

  useEffect(() => {
    return events.on('sys:worktree:switch', async ({ worktreeId }) => {
      const targetWorktree = enrichedWorktrees.find(wt => wt.id === worktreeId);
      if (targetWorktree) {
        await handleSwitchWorktree(targetWorktree);
      } else {
        events.emit('ui:notify', { type: 'error', message: 'Worktree not found' });
      }
    });
  }, [enrichedWorktrees, handleSwitchWorktree]);

  // Listen for sys:worktree:cycle (from /wt next or /wt prev)
  useEffect(() => {
    return events.on('sys:worktree:cycle', async ({ direction }) => {
      if (enrichedWorktrees.length <= 1) {
        events.emit('ui:notify', {
          type: 'warning',
          message: 'No other worktrees to switch to',
        });
        return;
      }

      const currentIndex = enrichedWorktrees.findIndex(wt => wt.id === activeWorktreeId);
      const nextIndex = (currentIndex + direction + enrichedWorktrees.length) % enrichedWorktrees.length;
      const nextWorktree = enrichedWorktrees[nextIndex];

      await handleSwitchWorktree(nextWorktree);
    });
  }, [enrichedWorktrees, activeWorktreeId, handleSwitchWorktree]);

  // Listen for sys:worktree:selectByName (from /wt <pattern>)
  useEffect(() => {
    return events.on('sys:worktree:selectByName', async ({ query }) => {
      if (enrichedWorktrees.length === 0) {
        events.emit('ui:notify', {
          type: 'error',
          message: 'No worktrees available',
        });
        return;
      }

      const q = query.toLowerCase();

      // Try exact match on branch first
      let match = enrichedWorktrees.find(wt => wt.branch?.toLowerCase() === q);

      // Then try exact match on name
      if (!match) {
        match = enrichedWorktrees.find(wt => wt.name.toLowerCase() === q);
      }

      // Finally try substring match on path
      if (!match) {
        match = enrichedWorktrees.find(wt => wt.path.toLowerCase().includes(q));
      }

      if (match) {
        await handleSwitchWorktree(match);
      } else {
        events.emit('ui:notify', {
          type: 'error',
          message: `No worktree matching "${query}"`,
        });
      }
    });
  }, [enrichedWorktrees, handleSwitchWorktree]);

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

    // Save session state before exiting
    if (activeWorktreeId) {
      await saveSessionState(activeWorktreeId, {
        selectedPath,
        expandedFolders: Array.from(expandedFolders),
        gitOnlyMode,
        timestamp: Date.now(),
      }).catch((err) => {
        console.error('Error saving session state on quit:', err);
      });
    }

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
    onToggleGitOnlyMode: anyModalOpen ? undefined : handleToggleGitOnlyMode,

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
    <ThemeProvider mode={themeMode} projectAccent={projectAccent}>
      <Box flexDirection="column" height={height}>
        <Header
          cwd={cwd}
          filterActive={filterActive}
          filterQuery={filterQuery}
          currentWorktree={currentWorktree}
          worktreeCount={enrichedWorktrees.length}
          onWorktreeClick={() => events.emit('ui:modal:open', { id: 'worktree' })}
          identity={projectIdentity}
          config={effectiveConfig}
          isSwitching={isSwitchingWorktree}
          gitOnlyMode={gitOnlyMode}
          onToggleGitOnlyMode={handleToggleGitOnlyMode}
          gitEnabled={gitEnabled}
        />
      <Box flexGrow={1}>
        {gitOnlyMode && fileTree.length === 0 ? (
          <Box flexDirection="column" justifyContent="center" alignItems="center" paddingY={2}>
            <Text color="yellow">No changed files in this worktree.</Text>
            <Text dimColor>Press <Text color="cyan">G</Text> to switch to All Files view</Text>
          </Box>
        ) : (
          <TreeView
            fileTree={fileTree}
            selectedPath={selectedPath || ''}
            config={effectiveConfig}
            expandedPaths={expandedFolders}
            disableMouse={anyModalOpen}
            viewportHeight={viewportHeight}
          />
        )}
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
          worktrees={enrichedWorktrees}
          activeWorktreeId={activeWorktreeId}
          onClose={() => events.emit('ui:modal:close', { id: 'worktree' })}
        />
      )}
      <HelpModal
        visible={showHelpModal}
        onClose={() => events.emit('ui:modal:close', { id: 'help' })}
      />
    </Box>
    </ThemeProvider>
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
