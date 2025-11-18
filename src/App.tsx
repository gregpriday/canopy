import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Header } from './components/Header.js';
import { TreeView } from './components/TreeView.js';
import { StatusBar } from './components/StatusBar.js';
import { DEFAULT_CONFIG } from './types/index.js';
import type { YellowwoodConfig, TreeNode, Notification } from './types/index.js';

interface AppProps {
  cwd: string;
}

const App: React.FC<AppProps> = ({ cwd }) => {
  const [config] = useState<YellowwoodConfig>(DEFAULT_CONFIG);
  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [notification, setNotification] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Load configuration from cosmiconfig
    // TODO: Build initial file tree
    // TODO: Set up file watcher
    setLoading(false);
  }, [cwd]);

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Loading Yellowwood...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      <Header cwd={cwd} filterActive={false} filterQuery="" />
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
    </Box>
  );
};

export default App;
