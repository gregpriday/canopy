import React, { useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Notification as NotificationType } from '../types/index.js';
import { useTheme } from '../theme/ThemeProvider.js';

interface NotificationProps {
  notification: NotificationType;
  onDismiss: (id: string) => void;
  isActive?: boolean;
}

export function Notification({ notification, onDismiss, isActive = false }: NotificationProps): React.JSX.Element | null {
  const { palette } = useTheme();

  // Auto-dismiss logic (longer for errors)
  useEffect(() => {
    const duration = notification.type === 'error' ? 6000 : 2000;
    const timer = setTimeout(() => {
      onDismiss(notification.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [notification.id, notification.type, onDismiss]);

  // Allow manual dismiss on the active toast
  useInput(
    (_input, key) => {
      if (key.escape || key.return) {
        onDismiss(notification.id);
      }
    },
    { isActive },
  );

  let borderColor = palette.text.secondary;

  switch (notification.type) {
    case 'success':
      borderColor = palette.git.added;
      break;
    case 'error':
      borderColor = palette.alert.error;
      break;
    case 'warning':
      borderColor = palette.alert.warning;
      break;
    case 'info':
    default:
      borderColor = palette.accent.primary;
      break;
  }

  return (
    <Box
      borderStyle="single"
      borderColor={borderColor}
      paddingX={1}
      marginBottom={0}
      width="100%"
    >
      <Text color={palette.text.primary}>
        {notification.message}
      </Text>
    </Box>
  );
}
