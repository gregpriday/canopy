import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../theme/ThemeProvider.js';

interface HelpModalProps {
  visible: boolean;
  onClose: () => void;
}

export function HelpModal({ visible, onClose }: HelpModalProps): React.JSX.Element | null {
  const { palette } = useTheme();
  // Handle keyboard input for dismissing modal (only when visible)
  useInput((input, key) => {
    if (visible && (key.escape || input === '?' || (key.shift && input === '/'))) {
      onClose();
    }
  });

  // Don't render if not visible
  if (!visible) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={palette.chrome.border}
      padding={1}
      width={80}
      marginX={2}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color={palette.accent.primary}>
          Canopy Keyboard Shortcuts
        </Text>
      </Box>

      {/* Navigation */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={palette.accent.primary}>Navigation:</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>�/�</Text>         Move selection up/down</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>�</Text>           Collapse folder or move to parent</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>�</Text>           Expand folder or open file</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>PageUp/Dn</Text>   Scroll viewport up/down</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>Ctrl+U/D</Text>    Scroll viewport up/down (alternate)</Text>
      </Box>

      {/* Opening/Toggling */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={palette.accent.primary}>Opening/Toggling:</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>Enter</Text>       Open file or toggle folder</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>Space</Text>       Toggle folder expansion without opening</Text>
      </Box>

      {/* Worktrees */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={palette.accent.primary}>Worktrees:</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>w</Text>           Cycle to next worktree</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>W</Text>           Open Worktree Panel overlay</Text>
      </Box>

      {/* Commands */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={palette.accent.primary}>Commands:</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>/</Text>           Open command bar</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>Ctrl+F</Text>      Open filter command (/filter)</Text>
      </Box>

      {/* Git */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={palette.accent.primary}>Git:</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>g</Text>           Toggle git status markers</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>G</Text>           Toggle Git-only view (show only changed files)</Text>
      </Box>

      {/* Copy/CopyTree */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={palette.accent.primary}>Copy/CopyTree:</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>c</Text>           Copy path or CopyTree reference</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>C</Text>           Open CopyTree command builder</Text>
      </Box>

      {/* Misc */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={palette.accent.primary}>Misc:</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>r</Text>           Manual refresh</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>?</Text>           Toggle this help overlay</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>q</Text>           Quit Canopy</Text>
        <Text>  <Text color={palette.semantic.srcFolder}>m</Text>           Open context menu</Text>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          Press <Text color={palette.semantic.srcFolder}>ESC</Text> or <Text color={palette.semantic.srcFolder}>?</Text> to close
        </Text>
      </Box>
    </Box>
  );
}
