import React from 'react';
import { Box, Text } from 'ink';
import type { Notification, GitStatus } from '../types/index.js';

interface StatusBarProps {
  notification: Notification | null;
  fileCount: number;
  modifiedCount: number;
  filterQuery?: string | null;
  filterGitStatus?: GitStatus | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  notification,
  fileCount,
  modifiedCount,
  filterQuery,
  filterGitStatus,
}) => {
  // When notification exists, show it instead of stats
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

  // Build status sections
  const sections: React.JSX.Element[] = [];

  // Section 1: File statistics
  sections.push(
    <React.Fragment key="stats">
      <Text>{fileCount} files</Text>
      {modifiedCount > 0 && (
        <>
          <Text dimColor> • </Text>
          <Text color="yellow">{modifiedCount} modified</Text>
        </>
      )}
    </React.Fragment>
  );

  // Section 2: Active filters
  if (filterQuery || filterGitStatus) {
    sections.push(
      <React.Fragment key="filters">
        <Text dimColor> • </Text>
        {filterQuery && (
          <Text color="cyan">
            /filter: {filterQuery}
          </Text>
        )}
        {filterQuery && filterGitStatus && (
          <Text dimColor> • </Text>
        )}
        {filterGitStatus && (
          <Text color="cyan">
            /git: {filterGitStatus}
          </Text>
        )}
      </React.Fragment>
    );
  }

  // Section 3: Help hints (only if no filters active)
  if (!filterQuery && !filterGitStatus) {
    sections.push(
      <React.Fragment key="hints">
        <Text dimColor> • Press </Text>
        <Text bold>?</Text>
        <Text dimColor> for help • </Text>
        <Text bold>/</Text>
        <Text dimColor> for commands</Text>
      </React.Fragment>
    );
  }

  return (
    <Box borderStyle="single" paddingX={1}>
      {sections}
    </Box>
  );
};
