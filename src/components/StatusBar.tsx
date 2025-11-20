import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { Notification, GitStatus } from '../types/index.js';
import { perfMonitor } from '../utils/perfMetrics.js';
import { ActionButton } from './StatusBar/ActionButton.js';
import { ActionGroup } from './StatusBar/ActionGroup.js';
import { InlineInput } from './StatusBar/InlineInput.js';
import { runCopyTree } from '../utils/copytree.js';
import { useTerminalMouse } from '../hooks/useTerminalMouse.js';
// Import the new type
import type { AIStatus } from '../services/statusGenerator.js';

interface StatusBarProps {
  notification: Notification | null;
  fileCount: number;
  modifiedCount: number;
  filterQuery?: string | null;
  filterGitStatus?: GitStatus | null;
  showPerformance?: boolean;
  activeRootPath?: string;
  
  commandMode: boolean;
  onSetCommandMode: (active: boolean) => void;
  onCommandSubmit: (command: string) => void;

  // New props for AI Status
  aiStatus?: AIStatus | null;
  isAnalyzing?: boolean;
}

export interface StatusBarRef {
  triggerCopyTree: () => Promise<void>;
}

export const StatusBar = forwardRef<StatusBarRef, StatusBarProps>(({
  notification,
  fileCount,
  modifiedCount,
  filterQuery,
  filterGitStatus,
  showPerformance = false,
  activeRootPath = '.',
  commandMode,
  onSetCommandMode,
  onCommandSubmit,
  aiStatus,     // Destructure new props
  isAnalyzing,
}, ref) => {
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [input, setInput] = useState('');
  const { stdout } = useStdout();

  useImperativeHandle(ref, () => ({
    triggerCopyTree: handleCopyTree,
  }));

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const handleCopyTree = async () => {
    try {
      setFeedback({ message: '📎 Running CopyTree...', type: 'success' });
      const output = await runCopyTree(activeRootPath);
      
      const lines = output
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      let lastLine = lines.length > 0 ? lines[lines.length - 1] : '📎 Copied!';
      // eslint-disable-next-line no-control-regex
      lastLine = lastLine.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
      setFeedback({ message: lastLine, type: 'success' });
    } catch (error: any) {
      const errorMsg = (error.message || 'Failed').split('\n')[0];
      setFeedback({ message: errorMsg, type: 'error' });
    }
  };

  useTerminalMouse({
    enabled: !commandMode && !notification && !feedback && stdout !== undefined,
    onMouse: (event) => {
      if (event.button === 'left' && stdout) {
        const buttonWidth = 16; 
        const statusBarHeight = 5; 
        const isBottom = event.y >= stdout.rows - statusBarHeight;
        const isRight = event.x >= stdout.columns - buttonWidth;
        if (isBottom && isRight) {
          handleCopyTree();
        }
      }
    }
  });

  const handleCommandSubmitInternal = (value: string) => {
    const fullCommand = value.startsWith('/') ? value : `/${value}`;
    onCommandSubmit(fullCommand);
    onSetCommandMode(false);
  };

  const handleCommandCancel = () => {
    onSetCommandMode(false);
  };

  if (commandMode) {
    return (
      <Box borderStyle="single" paddingX={1}>
        <InlineInput
          input={input}
          onChange={setInput}
          onSubmit={handleCommandSubmitInternal}
          onCancel={handleCommandCancel}
        />
      </Box>
    );
  }

  if (notification) {
     const colorMap = {
      success: 'green',
      info: 'blue',
      warning: 'yellow',
      error: 'red',
    } as const;

    return (
      <Box borderStyle="single" paddingX={1}>
        <Text color={colorMap[notification.type]} bold={notification.type === 'error'}>
          {notification.message}
        </Text>
      </Box>
    );
  }

  const filterElements: React.JSX.Element[] = [];
  if (filterQuery || filterGitStatus) {
    filterElements.push(<Text key="sep" dimColor> • </Text>);
    if (filterQuery) filterElements.push(<Text key="fq" color="cyan">/filter: {filterQuery}</Text>);
    if (filterQuery && filterGitStatus) filterElements.push(<Text key="sep2" dimColor> • </Text>);
    if (filterGitStatus) filterElements.push(<Text key="fgs" color="cyan">/git: {filterGitStatus}</Text>);
  }

  const perfElements: React.JSX.Element[] = [];
  if (showPerformance) {
    const gitStats = perfMonitor.getStats('git-status-fetch');
    if (gitStats) {
       perfElements.push(<Text key="sep" dimColor> • </Text>);
       perfElements.push(<Text key="perf" dimColor>Git {Math.round(gitStats.avg)}ms</Text>);
    }
  }

  return (
    <Box 
      borderStyle="single" 
      paddingX={1} 
      justifyContent={feedback ? 'flex-start' : 'space-between'}
      // Ensure we take full width to push CopyTree button to the right
      width="100%"
    >
      {feedback ? (
        <Box height={3} width="100%" flexDirection="column" justifyContent="center">
           <Text color={feedback.type === 'success' ? 'green' : 'red'} wrap="truncate-end">
            {feedback.type === 'success' ? '' : '❌ '}
            {feedback.message}
          </Text>
        </Box>
      ) : (
        // NORMAL MODE
        <>
          <Box flexDirection="column">
            <Box>
              <Text>{fileCount} files</Text>
              {filterElements}
              {perfElements}
            </Box>
            
            <Box>
              {modifiedCount > 0 ? (
                <Text color="yellow">{modifiedCount} modified</Text>
              ) : (
                <Text dimColor>No changes</Text>
              )}
            </Box>

            {/* AI Status Line */}
            {(aiStatus || isAnalyzing) && (
               <Box marginTop={0}> 
                 {isAnalyzing && !aiStatus ? (
                   <Text dimColor> 🧠 Analyzing...</Text>
                 ) : aiStatus ? (
                   <Text color="magenta"> {aiStatus.emoji} {aiStatus.description}</Text>
                 ) : null}
               </Box>
            )}
          </Box>
          
          <ActionGroup>
            <ActionButton
              label="CopyTree"
              onAction={handleCopyTree}
            />
          </ActionGroup>
        </>
      )}
    </Box>
  );
});