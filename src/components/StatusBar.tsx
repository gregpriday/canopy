import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { Notification, GitStatus } from '../types/index.js';
import { perfMonitor } from '../utils/perfMetrics.js';
import { ActionButton } from './StatusBar/ActionButton.js';
import { ActionGroup } from './StatusBar/ActionGroup.js';
import { InlineInput } from './StatusBar/InlineInput.js';
import { useTerminalMouse } from '../hooks/useTerminalMouse.js';
import { events } from '../services/events.js'; // Import event bus
import type { AIStatus } from '../services/ai/index.js';
import { useTheme } from '../theme/ThemeProvider.js';

interface StatusBarProps {
  notification: Notification | null;
  fileCount: number;
  modifiedCount: number;
  filterQuery?: string | null;
  filterGitStatus?: GitStatus | null;
  showPerformance?: boolean;
  activeRootPath?: string;

  commandMode: boolean;

  aiStatus?: AIStatus | null;
  isAnalyzing?: boolean;
  isIdle?: boolean;
}

const IDLE_MESSAGES = [
  '🌲 Standing tall, watching for changes',
  '🍃 The canopy is calm right now',
  '🔭 Surveying the forest floor',
  '🌤️ Clear view from the top',
  '🌿 Ecosystem is stable',
  '🦅 Keeping a bird\'s-eye view',
  '🪵 Roots are holding steady',
  '🍂 No movement in the undergrowth',
  '🌥️ Mist clearing, ready for code',
  '🏔️ The vantage point is clear',
  '🦉 Silent watch in progress',
  '🌳 The forest awaits your input',
  '🌬️ A gentle breeze in the branches',
  '📡 Monitoring the habitat',
  '🛖 Safe in the treehouse',
];

export const StatusBar: React.FC<StatusBarProps> = ({
  notification,
  fileCount,
  modifiedCount,
  filterQuery,
  filterGitStatus,
  showPerformance = false,
  activeRootPath = '.',
  commandMode,
  aiStatus,
  isAnalyzing,
  isIdle,
}) => {
  const { palette } = useTheme();
  const [input, setInput] = useState('');
  const [idleMessage, setIdleMessage] = useState<string>(() =>
    IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)]
  );
  const [lastIdleState, setLastIdleState] = useState(false);
  const { stdout } = useStdout();
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY?.trim());

  // Pick a new random idle message when transitioning to idle state
  useEffect(() => {
    const isCurrentlyIdle = !isAnalyzing && !aiStatus;

    // Transitioning from non-idle to idle
    if (isCurrentlyIdle && !lastIdleState) {
      setIdleMessage(IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)]);
    }

    setLastIdleState(isCurrentlyIdle);
  }, [isAnalyzing, aiStatus, lastIdleState]);

  // Mouse handler - emit event instead of executing directly
  useTerminalMouse({
    enabled: !commandMode && !notification && stdout !== undefined,
    onMouse: (event) => {
      if (event.button === 'left' && stdout) {
        const buttonWidth = 16;
        const statusBarHeight = 5;
        const isBottom = event.y >= stdout.rows - statusBarHeight;
        const isRight = event.x >= stdout.columns - buttonWidth;
        if (isBottom && isRight) {
          // Emit event instead of calling handler directly
          events.emit('file:copy-tree', { rootPath: activeRootPath });
        }
      }
    }
  });

  const handleCommandSubmitInternal = (value: string) => {
    const fullCommand = value.startsWith('/') ? value : `/${value}`;
    events.emit('ui:command:submit', { input: fullCommand });
    events.emit('ui:modal:close', { id: 'command-bar' });
  };

  const handleCommandCancel = () => {
    events.emit('ui:modal:close', { id: 'command-bar' });
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
      success: palette.git.added,
      info: palette.alert.info,
      warning: palette.alert.warning,
      error: palette.alert.error,
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
    if (filterQuery) filterElements.push(<Text key="fq" color={palette.accent.primary}>/filter: {filterQuery}</Text>);
    if (filterQuery && filterGitStatus) filterElements.push(<Text key="sep2" dimColor> • </Text>);
    if (filterGitStatus) filterElements.push(<Text key="fgs" color={palette.accent.primary}>/git: {filterGitStatus}</Text>);
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
      justifyContent="space-between"
      width="100%"
    >
      {/* NORMAL MODE */}
      <>
        <Box flexDirection="column">
          <Box>
            <Text>{fileCount} files</Text>
            {filterElements}
            {perfElements}
          </Box>

          <Box>
            {modifiedCount > 0 ? (
              <Text color={palette.git.modified}>{modifiedCount} modified</Text>
            ) : (
              <Text dimColor>No changes</Text>
            )}
          </Box>

          {/* Status / AI Line */}
          <Box marginTop={0}>
               {isAnalyzing ? (
                 <Text dimColor>🧠 Analyzing changes...</Text>
               ) : aiStatus ? (
                 <Text color={palette.ai.primary}>{aiStatus.emoji} {aiStatus.description}</Text>
               ) : isIdle ? (
                 <Text dimColor>💤 Canopy • Waiting for changes...</Text>
               ) : (
                 <Box>
                   <Text dimColor>{idleMessage}</Text>
                   {!hasOpenAIKey && (
                     <Text dimColor> [no OpenAI key]</Text>
                   )}
                 </Box>
               )}
          </Box>
        </Box>

        <ActionGroup>
          <ActionButton
            label="CopyTree"
            onAction={() => events.emit('file:copy-tree', { rootPath: activeRootPath })}
          />
        </ActionGroup>
      </>
    </Box>
  );
};
