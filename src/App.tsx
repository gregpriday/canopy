import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { Header } from './components/Header.js';
import { TreeView } from './components/TreeView.js';
import { StatusBar } from './components/StatusBar.js';
import { CommandBar } from './components/CommandBar.js';
import { ContextMenu } from './components/ContextMenu.js';
import { WorktreePanel } from './components/WorktreePanel.js';
import { DEFAULT_CONFIG } from './types/index.js';
import type { YellowwoodConfig, TreeNode, Notification, Worktree } from './types/index.js';
import { executeCommand } from './commands/index.js';
import type { CommandContext } from './commands/index.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { getWorktrees, getCurrentWorktree } from './utils/worktree.js';
import { openFile } from './utils/fileOpener.js';
import { copyFilePath } from './utils/clipboard.js';
import path from 'path';
import { useGitStatus } from './hooks/useGitStatus.js';
import { switchWorktree } from './utils/worktreeSwitch.js';
import type { FileWatcher } from './utils/fileWatcher.js';

interface AppProps {
  cwd: string;
  config?: YellowwoodConfig;
  noWatch?: boolean;
  noGit?: boolean;
  initialFilter?: string;
}

const App: React.FC<AppProps> = ({ cwd, config: initialConfig, noWatch, noGit, initialFilter }) => {
  const [config] = useState<YellowwoodConfig>(initialConfig || DEFAULT_CONFIG);
  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [originalFileTree, setOriginalFileTree] = useState<TreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [notification, setNotification] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);

  // Command bar state
  const [commandBarActive, setCommandBarActive] = useState(false);
  const [commandBarInput, setCommandBarInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);

  // Filter state - initialize from CLI if provided
  const [filterActive, setFilterActive] = useState(!!initialFilter);
  const [filterQuery, setFilterQuery] = useState(initialFilter || '');

  // Worktree state
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [activeWorktreeId, setActiveWorktreeId] = useState<string | null>(null);
  const [activeRootPath, setActiveRootPath] = useState<string>(cwd);
  const [isWorktreePanelOpen, setIsWorktreePanelOpen] = useState(false);

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

  // Context menu state (from PR #73)
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuTarget, setContextMenuTarget] = useState<string>('');
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    let isMounted = true;

    const initializeApp = async () => {
      try {
        const loadedWorktrees = await getWorktrees(cwd);
        if (!isMounted) return;

        setWorktrees(loadedWorktrees);

        if (loadedWorktrees.length > 0) {
          const current = getCurrentWorktree(cwd, loadedWorktrees);
          if (current) {
            setActiveWorktreeId(current.id);
          } else {
            setActiveWorktreeId(loadedWorktrees[0].id);
          }
        }
      } catch (error) {
        if (!isMounted) return;
        console.debug('Could not load worktrees:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initializeApp();

    return () => {
      isMounted = false;
      // Cleanup watcher on unmount
      if (watcherRef.current) {
        watcherRef.current.stop();
      }
    };
  }, [cwd]);

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

  // Keep originalFileTree in sync with fileTree when filter is not active
  useEffect(() => {
    if (!filterActive && fileTree.length > 0) {
      setOriginalFileTree(fileTree);
    }
  }, [filterActive, fileTree]);

  // Restore original tree when filter is cleared
  useEffect(() => {
    if (!filterActive && originalFileTree.length > 0) {
      setFileTree(originalFileTree);
    }
  }, [filterActive, originalFileTree]);

  // Handle command bar open/close
  const handleOpenCommandBar = () => {
    setCommandBarActive(true);
    setCommandBarInput('');
  };

  const handleCloseCommandBar = () => {
    setCommandBarActive(false);
    setCommandBarInput('');
  };

  // Handle filter clear (ESC key when filter is active)
  const handleClearFilter = () => {
    if (filterActive) {
      setFilterActive(false);
      setFilterQuery('');
      setFileTree(originalFileTree);
      setNotification({
        type: 'info',
        message: 'Filter cleared',
      });
    } else if (commandBarActive) {
      // ESC in command bar closes it
      handleCloseCommandBar();
    } else if (isWorktreePanelOpen) {
      // ESC in worktree panel closes it
      setIsWorktreePanelOpen(false);
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
      // Clear git status before switching (from PR #75)
      clearGitStatus();

      const result = await switchWorktree({
        targetWorktree,
        currentWatcher: watcherRef.current, // Pass current watcher for cleanup
        currentTree: fileTree,
        selectedPath,
        config,
        onFileChange: {
          // Trigger git refresh on file changes (from PR #75)
          onAdd: () => refreshGitStatusRef.current(),
          onChange: () => refreshGitStatusRef.current(),
          onUnlink: () => refreshGitStatusRef.current(),
        },
        noWatch, // Pass noWatch flag from CLI
        initialFilter, // Pass initial filter from CLI (only applies on first switch)
      });

      // Update state with new tree, selection, and watcher
      setFileTree(result.tree);
      setOriginalFileTree(result.tree);
      setSelectedPath(result.selectedPath || '');
      setActiveWorktreeId(targetWorktree.id);
      setActiveRootPath(targetWorktree.path); // Update active root path for git status (from PR #75)
      watcherRef.current = result.watcher; // Store new watcher in ref

      // Refresh git status after switching (from PR #75)
      refreshGitStatus();

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
    // Use the current originalFileTree if we have one, otherwise use fileTree
    const treeForCommands = originalFileTree.length > 0 ? originalFileTree : fileTree;

    const context: CommandContext = {
      state: {
        fileTree,
        expandedFolders: new Set(),
        selectedPath,
        cursorPosition: 0,
        showPreview: false,
        showHelp: false,
        contextMenuOpen: false,
        contextMenuPosition: { x: 0, y: 0 },
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
      originalFileTree: treeForCommands,
      setFilterActive: (active: boolean) => {
        setFilterActive(active);
        if (!active) {
          setFilterQuery('');
        }
      },
      setFilterQuery,
      setFileTree: (tree: TreeNode[]) => {
        setFileTree(tree);
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

  // Set up keyboard handlers
  useKeyboard({
    onOpenCommandBar: handleOpenCommandBar,
    onClearFilter: handleClearFilter,
    onNextWorktree: handleNextWorktree,
    onOpenWorktreePanel: () => setIsWorktreePanelOpen(true),
    onOpenFile: handleOpenSelectedFile,
    onCopyPath: handleCopySelectedPath,
    onOpenContextMenu: handleOpenContextMenu,
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Loading Yellowwood...</Text>
      </Box>
    );
  }

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
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
          config={config}
        />
      </Box>
      <StatusBar
        notification={notification}
        fileCount={fileTree.length}
        modifiedCount={0}
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
    </Box>
  );
};

export default App;
