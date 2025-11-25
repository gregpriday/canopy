import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Box, Text, measureElement } from 'ink';
import type { DevServerState } from '../types/index.js';
import { useTheme } from '../theme/ThemeProvider.js';

export interface ServerDockProps {
  /** Worktree ID for click region registration */
  worktreeId: string;
  /** Current server state */
  serverState: DevServerState;
  /** Whether a dev script exists for this worktree */
  hasDevScript: boolean;
  /** Whether this card is focused (show keyboard hint) */
  isFocused: boolean;
  /** Callback when toggle button is pressed */
  onToggle: () => void;
  /** Click region registration */
  registerClickRegion?: (
    id: string,
    bounds?: { x: number; y: number; width: number; height: number },
    handler?: () => void
  ) => void;
}

const StatusIndicator: React.FC<{ status: DevServerState['status']; palette: any }> = ({
  status,
  palette,
}) => {
  switch (status) {
    case 'stopped':
      return <Text color={palette.text.tertiary}></Text>;
    case 'starting':
      return <Text color={palette.alert.warning}></Text>;
    case 'running':
      return <Text color={palette.git.added}></Text>;
    case 'error':
      return <Text color={palette.alert.error}></Text>;
    default:
      return <Text color={palette.text.tertiary}></Text>;
  }
};

const ActionButton: React.FC<{
  id: string;
  label: string;
  color: string;
  disabled?: boolean;
  onPress?: () => void;
  registerRegion?: (
    id: string,
    bounds?: { x: number; y: number; width: number; height: number },
    handler?: () => void
  ) => void;
}> = ({ id, label, color, disabled, onPress, registerRegion }) => {
  const ref = React.useRef<import('ink').DOMElement | null>(null);
  const [isPressed, setIsPressed] = useState(false);

  const handlePress = useCallback(() => {
    if (disabled || isPressed) return;

    setIsPressed(true);
    onPress?.();

    setTimeout(() => {
      setIsPressed(false);
    }, 150);
  }, [onPress, disabled, isPressed]);

  useLayoutEffect(() => {
    if (!registerRegion || !ref.current || !onPress || disabled) {
      return;
    }

    const measured = measureElement(ref.current) as {
      width: number;
      height: number;
    };
    const yogaNode = ref.current.yogaNode;
    if (!yogaNode) {
      return;
    }

    const getAbsolutePosition = (node: any): { x: number; y: number } => {
      let x = 0;
      let y = 0;
      let current = node;
      while (current) {
        x += current.getComputedLeft?.() ?? 0;
        y += current.getComputedTop?.() ?? 0;
        current = current.getParent?.();
      }
      return { x, y };
    };

    const { x, y } = getAbsolutePosition(yogaNode);
    const bounds = { x, y, width: measured.width, height: measured.height };

    registerRegion(id, bounds, handlePress);

    return () => registerRegion(id, undefined, handlePress);
  }, [registerRegion, id, label, color, onPress, handlePress, disabled]);

  return (
    <Box
      ref={ref}
      backgroundColor={isPressed ? 'white' : undefined}
      // @ts-ignore
      onClick={!disabled ? handlePress : undefined}
    >
      <Text color={isPressed ? 'black' : color} bold dimColor={disabled}>
        [{label}]
      </Text>
    </Box>
  );
};

/**
 * ServerDock component displays dev server status and controls within a WorktreeCard.
 *
 * States:
 * - stopped: Shows "Dev Server" label + Start button
 * - starting: Shows "Starting..." + disabled Stop button
 * - running: Shows URL + Stop button
 * - error: Shows error message + Retry button
 */
export const ServerDock: React.FC<ServerDockProps> = ({
  worktreeId,
  serverState,
  hasDevScript,
  isFocused,
  onToggle,
  registerClickRegion,
}) => {
  const { palette } = useTheme();

  // Don't render if no dev script detected
  if (!hasDevScript) {
    return null;
  }

  const { status, url, errorMessage } = serverState;

  const getButtonLabel = (): string => {
    switch (status) {
      case 'stopped':
        return '▶ Start';
      case 'starting':
        return 'Starting...';
      case 'running':
        return '■ Stop';
      case 'error':
        return '▶ Retry';
      default:
        return '▶ Start';
    }
  };

  const getButtonColor = (): string => {
    switch (status) {
      case 'stopped':
        return palette.git.added;
      case 'starting':
        return palette.alert.warning;
      case 'running':
        return palette.alert.error;
      case 'error':
        return palette.git.added;
      default:
        return palette.text.secondary;
    }
  };

  const getStatusText = (): React.ReactNode => {
    switch (status) {
      case 'stopped':
        return (
          <Text color={palette.text.tertiary}>Dev Server</Text>
        );
      case 'starting':
        return (
          <Text color={palette.alert.warning}>Starting...</Text>
        );
      case 'running':
        return url ? (
          <Text color={palette.git.added}>{url}</Text>
        ) : (
          <Text color={palette.git.added}>Running</Text>
        );
      case 'error':
        return (
          <Text color={palette.alert.error}>
            {errorMessage ? `Error: ${errorMessage.slice(0, 40)}` : 'Error'}
          </Text>
        );
      default:
        return (
          <Text color={palette.text.tertiary}>Dev Server</Text>
        );
    }
  };

  return (
    <Box
      marginTop={1}
      paddingX={0}
      justifyContent="space-between"
      alignItems="center"
      borderStyle="single"
      borderTop={true}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor={palette.chrome.separator}
    >
      <Box gap={1}>
        <StatusIndicator status={status} palette={palette} />
        {getStatusText()}
        {isFocused && status !== 'starting' && (
          <Text color={palette.text.tertiary} dimColor>
            [s]
          </Text>
        )}
      </Box>
      <ActionButton
        id={`${worktreeId}-server-toggle`}
        label={getButtonLabel()}
        color={getButtonColor()}
        disabled={status === 'starting'}
        onPress={onToggle}
        registerRegion={registerClickRegion}
      />
    </Box>
  );
};
