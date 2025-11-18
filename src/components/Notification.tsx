import React, { useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Notification as NotificationType } from '../types/index.js';

interface NotificationProps {
  notification: NotificationType | null;
  onDismiss: () => void;
}

export function Notification({ notification, onDismiss }: NotificationProps): React.JSX.Element | null {
  // Auto-dismiss non-errors after 3 seconds
  useEffect(() => {
    if (!notification) return;

    // Only auto-dismiss success, info, and warning - NOT errors
    if (notification.type !== 'error') {
      const timer = setTimeout(() => {
        onDismiss();
      }, 3000);

      // Cleanup timer if component unmounts or notification changes
      return () => clearTimeout(timer);
    }

    // No cleanup needed for errors (they don't auto-dismiss)
    return undefined;
  }, [notification, onDismiss]);

  // Allow manual dismiss with ESC or Enter only while a notification is visible
  useInput(
    (_input, key) => {
      if (!notification) return;
      if (key.escape || key.return) {
        onDismiss();
      }
    },
    { isActive: Boolean(notification) },
  );

  // Don't render anything if no notification
  if (!notification) return null;

  // Map notification type to colors
  const colorMap: Record<string, string> = {
    success: 'green',
    info: 'blue',
    warning: 'yellow',
    error: 'red',
  };

  const color = colorMap[notification.type] || 'white';

  return (
    <Box
      borderStyle="round"
      borderColor={color}
      paddingX={2}
      paddingY={0}
      marginTop={1}
    >
      <Text color={color} bold={notification.type === 'error'}>
        {notification.message}
      </Text>
    </Box>
  );
}
