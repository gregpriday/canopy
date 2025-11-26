import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { Box, Text, measureElement } from 'ink';
import open from 'open';
import { useTheme } from '../theme/ThemeProvider.js';

export interface NoteDockProps {
  /** AI note content (undefined if file doesn't exist) */
  noteContent?: string;
  /** Click region registration for making links clickable */
  registerClickRegion?: (
    id: string,
    bounds?: { x: number; y: number; width: number; height: number },
    handler?: () => void
  ) => void;
}

// URL regex pattern
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

/**
 * Extract the first URL from text, if any.
 */
function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_REGEX);
  return match ? match[0] : null;
}

/**
 * Parse text and return array of text and link segments.
 */
function parseTextWithLinks(text: string): Array<{ type: 'text' | 'link'; content: string }> {
  const segments: Array<{ type: 'text' | 'link'; content: string }> = [];
  let lastIndex = 0;

  // Reset regex state
  URL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_REGEX.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    // Add the URL
    segments.push({ type: 'link', content: match[1] });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last URL
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * NoteDock displays AI agent status notes from .canopy_note.txt.
 * Only renders when content exists; returns null otherwise.
 * Follows the same visual pattern as ServerDock.
 * URLs are clickable - clicking anywhere on the note opens the first URL.
 */
export const NoteDock: React.FC<NoteDockProps> = ({ noteContent, registerClickRegion }) => {
  const { palette } = useTheme();
  const boxRef = useRef<import('ink').DOMElement | null>(null);

  const cleanContent = noteContent?.trim();
  const firstUrl = cleanContent ? extractFirstUrl(cleanContent) : null;

  const handleClick = useCallback(() => {
    if (firstUrl) {
      void open(firstUrl);
    }
  }, [firstUrl]);

  useLayoutEffect(() => {
    if (!registerClickRegion || !boxRef.current || !firstUrl) {
      return;
    }

    const measured = measureElement(boxRef.current) as {
      width: number;
      height: number;
    };
    const yogaNode = boxRef.current.yogaNode;
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

    registerClickRegion('note-dock-link', bounds, handleClick);

    return () => registerClickRegion('note-dock-link', undefined, handleClick);
  }, [registerClickRegion, firstUrl, handleClick]);

  // Don't render if no note content
  if (!cleanContent) {
    return null;
  }

  const segments = parseTextWithLinks(cleanContent);

  return (
    <Box
      ref={boxRef}
      marginTop={1}
      marginX={-1}
      paddingX={1}
      borderStyle="single"
      borderTop={true}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor={palette.text.tertiary}
    >
      <Text color={palette.text.secondary}>
        {segments.map((segment, index) =>
          segment.type === 'link' ? (
            <Text key={index} color={palette.accent.primary} underline>{segment.content}</Text>
          ) : (
            <Text key={index}>{segment.content}</Text>
          )
        )}
      </Text>
    </Box>
  );
};
