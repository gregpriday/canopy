import React from 'react';
import { Box, Text } from 'ink';
import type { Notification } from '../types/index.js';

interface StatusBarProps {
  notification: Notification | null;
  fileCount: number;
  modifiedCount: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({ notification, fileCount, modifiedCount }) => {
  return (
    <Box borderStyle="single" paddingX={1}>
      {notification ? (
        <Text color={notification.type === 'error' ? 'red' : notification.type === 'success' ? 'green' : 'blue'}>
          {notification.message}
        </Text>
      ) : (
        <>
          <Text>{fileCount} files</Text>
          {modifiedCount > 0 && (
            <>
              <Text dimColor>, </Text>
              <Text color="yellow">{modifiedCount} modified</Text>
            </>
          )}
          <Text dimColor> Press </Text>
          <Text bold>?</Text>
          <Text dimColor> for help</Text>
        </>
      )}
    </Box>
  );
};
