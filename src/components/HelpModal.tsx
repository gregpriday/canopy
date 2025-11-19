import React from 'react';
import { Box, Text, useInput } from 'ink';

interface HelpModalProps {
  visible: boolean;
  onClose: () => void;
}

export function HelpModal({ visible, onClose }: HelpModalProps): React.JSX.Element | null {
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
      borderColor="cyan"
      padding={1}
      width={80}
      marginX={2}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Yellowwood Keyboard Shortcuts
        </Text>
      </Box>

      {/* Navigation */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">Navigation:</Text>
        <Text>  <Text color="green">�/�</Text>         Move selection up/down</Text>
        <Text>  <Text color="green">�</Text>           Collapse folder or move to parent</Text>
        <Text>  <Text color="green">�</Text>           Expand folder or open file</Text>
        <Text>  <Text color="green">PageUp/Dn</Text>   Scroll viewport up/down</Text>
        <Text>  <Text color="green">Ctrl+U/D</Text>    Scroll viewport up/down (alternate)</Text>
      </Box>

      {/* Opening/Toggling */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">Opening/Toggling:</Text>
        <Text>  <Text color="green">Enter</Text>       Open file or toggle folder</Text>
        <Text>  <Text color="green">Space</Text>       Toggle folder expansion without opening</Text>
      </Box>

      {/* Worktrees */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">Worktrees:</Text>
        <Text>  <Text color="green">w</Text>           Cycle to next worktree</Text>
        <Text>  <Text color="green">W</Text>           Open Worktree Panel overlay</Text>
      </Box>

      {/* Commands */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">Commands:</Text>
        <Text>  <Text color="green">/</Text>           Open command bar</Text>
        <Text>  <Text color="green">Ctrl+F</Text>      Open filter command (/filter)</Text>
      </Box>

      {/* Git */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">Git:</Text>
        <Text>  <Text color="green">g</Text>           Toggle git status markers</Text>
      </Box>

      {/* Copy/CopyTree */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">Copy/CopyTree:</Text>
        <Text>  <Text color="green">c</Text>           Copy path or CopyTree reference</Text>
        <Text>  <Text color="green">C</Text>           Open CopyTree command builder</Text>
      </Box>

      {/* Misc */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">Misc:</Text>
        <Text>  <Text color="green">r</Text>           Manual refresh</Text>
        <Text>  <Text color="green">?</Text>           Toggle this help overlay</Text>
        <Text>  <Text color="green">q</Text>           Quit Yellowwood</Text>
        <Text>  <Text color="green">m</Text>           Open context menu</Text>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          Press <Text color="green">ESC</Text> or <Text color="green">?</Text> to close
        </Text>
      </Box>
    </Box>
  );
}
