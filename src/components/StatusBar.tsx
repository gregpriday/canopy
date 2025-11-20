import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { Notification, GitStatus } from '../types/index.js';
import { perfMonitor } from '../utils/perfMetrics.js';
import { ActionButton } from './StatusBar/ActionButton.js';
import { ActionGroup } from './StatusBar/ActionGroup.js';
import { InlineInput } from './StatusBar/InlineInput.js';
import { runCopyTree } from '../utils/copytree.js';
import { useTerminalMouse } from '../hooks/useTerminalMouse.js';

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
      }, 2000); // Changed from 3000 to 2000
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const handleCopyTree = async () => {
    try {
      // 1. Set initial running state
      setFeedback({ message: '📎 Running CopyTree...', type: 'success' });
      
      // 2. Execute command
      const output = await runCopyTree(activeRootPath);
      
      // 3. Parse the output strictly
      // Split by newlines, trim whitespace from every line, remove empty lines
      const lines = output
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      // 4. Get the last line or a fallback
      let lastLine = lines.length > 0 ? lines[lines.length - 1] : '📎 Copied!';

      // 5. CRITICAL: Strip ANSI codes (colors, cursor moves) that break Ink layouts
      // This regex matches standard ANSI escape sequences
      // eslint-disable-next-line no-control-regex
      lastLine = lastLine.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

      setFeedback({ message: lastLine, type: 'success' });
    } catch (error: any) {
      // Normalize error message to single line
      const errorMsg = (error.message || 'Failed').split('\n')[0];
      setFeedback({ message: errorMsg, type: 'error' });
    }
  };

  // Mouse handling for CopyTree button
  useTerminalMouse({
    enabled: !commandMode && !notification && !feedback && stdout !== undefined, // Only active in default mode
    onMouse: (event) => {
      if (event.button === 'left' && stdout) {
        // Heuristic: Check if click is in the bottom-right area where the button is.
        // Button is roughly 16 chars wide (border + padding + "CopyTree" + margin)
        // StatusBar height with 2 lines of text is 4 lines (2 content + 2 border)
        // So checking last 5 rows to be safe.
        
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

  // 1. Command Mode (Overrides everything to allow full width input if needed, or partial)
  // Spec 2.3: "The file stats and buttons disappear (or are pushed out), replaced by the command input."
  // So we render ONLY input.
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

  // 2. Global Notification (Overrides everything)
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



  // 4. Prepare Filter & Perf Elements (Moved up so they are available for the else block)
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

  // 5. Unified Render
  return (
    <Box 
      borderStyle="single" 
      paddingX={1} 
      // If feedback is showing, align left. If stats, space between stats and button.
      justifyContent={feedback ? 'flex-start' : 'space-between'}
    >
      {feedback ? (
        // FEEDBACK MODE
        // We use height={3} to provide 1 line of padding above and below the text.
        // Total height = 1 (top border) + 3 (content) + 1 (bottom border) = 5 lines.
        <Box 
          height={3} 
          width="100%" 
          flexDirection="column" 
          justifyContent="center"
        >
           <Text 
             color={feedback.type === 'success' ? 'green' : 'red'}
             wrap="truncate-end"
           >
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
