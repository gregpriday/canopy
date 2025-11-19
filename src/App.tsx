import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { Header } from './components/Header.js';
import { TreeView } from './components/TreeView.js';
import { StatusBar } from './components/StatusBar.js';
import { CommandBar } from './components/CommandBar.js';
import { DEFAULT_CONFIG } from './types/index.js';
import type { YellowwoodConfig, TreeNode, Notification, Worktree } from './types/index.js';
import { executeCommand } from './commands/index.js';
import type { CommandContext } from './commands/index.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { getWorktrees, getCurrentWorktree } from './utils/worktree.js';
import { useGitStatus } from './hooks/useGitStatus.js';
import { switchWorktree } from './utils/worktreeSwitch.js';
import type { FileWatcher } from './utils/fileWatcher.js';

interface AppProps {
  cwd: string;
}

const App: React.FC<AppProps> = ({ cwd }) => {
  const [config] = useState<YellowwoodConfig>(DEFAULT_CONFIG);
  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [originalFileTree, setOriginalFileTree] = useState<TreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [notification, setNotification] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);

  // Command bar state
  const [commandBarActive, setCommandBarActive] = useState(false);
  const [commandBarInput, setCommandBarInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);

  // Filter state
  const [filterActive, setFilterActive] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');

  // Worktree state
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [activeWorktreeId, setActiveWorktreeId] = useState<string | null>(null);
  const [activeRootPath, setActiveRootPath] = useState<string>(cwd);

  // File watcher ref
  const watcherRef = useRef<FileWatcher | null>(null);

  // Git status hook - tracks the active root path
  const { gitStatus, gitEnabled, refresh: refreshGitStatus, clear: clearGitStatus } = useGitStatus(
    activeRootPath,
    config.showGitStatus,
    config.refreshDebounce,
  );

  const refreshGitStatusRef = useRef(refreshGitStatus);
  refreshGitStatusRef.current = refreshGitStatus;

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
      switchToWorktree: async (targetWorktree: Worktree) => {
        try {
          setLoading(true);

          // Step 1: Clear git status immediately to prevent stale markers
          if (config.showGitStatus) {
            clearGitStatus();
          }

          // Step 2: Switch worktree (stops old watcher, builds tree, starts new watcher)
          const triggerGitRefresh = (_path?: string) => {
            if (config.showGitStatus) {
              refreshGitStatusRef.current();
            }
          };

          const result = await switchWorktree({
            targetWorktree,
            currentWatcher: watcherRef.current,
            currentTree: fileTree,
            selectedPath,
            config,
            onFileChange: {
              onAdd: triggerGitRefresh,
              onChange: triggerGitRefresh,
              onUnlink: triggerGitRefresh,
              onAddDir: triggerGitRefresh,
              onUnlinkDir: triggerGitRefresh,
            },
          });

          // Step 3: Update state with new tree, watcher, and selection
          setFileTree(result.tree);
          setOriginalFileTree(result.tree);
          setSelectedPath(result.selectedPath || '');
          watcherRef.current = result.watcher;
          setActiveWorktreeId(targetWorktree.id);
          setActiveRootPath(targetWorktree.path);

          // Step 4: Refresh git status for new worktree
          // The useGitStatus hook will automatically refresh when activeRootPath changes,
          // but we call refresh explicitly to ensure immediate update
          if (config.showGitStatus) {
            refreshGitStatusRef.current();
          }

          // Step 5: Show success notification
          setNotification({
            type: 'success',
            message: `Switched to worktree: ${targetWorktree.name}`,
          });

        } catch (error) {
          setNotification({
            type: 'error',
            message: `Failed to switch worktree: ${(error as Error).message}`,
          });
        } finally {
          setLoading(false);
        }
      },
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

  // Set up keyboard handlers
  useKeyboard({
    onOpenCommandBar: handleOpenCommandBar,
    onClearFilter: handleClearFilter,
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
      <Header cwd={cwd} filterActive={filterActive} filterQuery={filterQuery} />
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
    </Box>
  );
};

export default App;
