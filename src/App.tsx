import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Header } from './components/Header.js';
import { TreeView } from './components/TreeView.js';
import { StatusBar } from './components/StatusBar.js';
import { CommandBar } from './components/CommandBar.js';
import { DEFAULT_CONFIG } from './types/index.js';
import type { YellowwoodConfig, TreeNode, Notification } from './types/index.js';
import { executeCommand } from './commands/index.js';
import type { CommandContext } from './commands/index.js';
import { useKeyboard } from './hooks/useKeyboard.js';

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

  useEffect(() => {
    // TODO: Load configuration from cosmiconfig
    // TODO: Build initial file tree
    // TODO: Set up file watcher
    setLoading(false);
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
        gitStatus: new Map(),
        gitEnabled: config.showGitStatus,
        notification,
        commandBarActive,
        commandBarInput,
        commandHistory,
        config,
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
