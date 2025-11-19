import React, { Component, ReactNode } from 'react';
import { Box, Text } from 'ink';

interface AppErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component for catching React rendering errors in Canopy.
 * Displays a terminal-friendly fallback UI when a child component throws.
 *
 * NOTE: Error boundaries only catch errors in:
 * - Rendering
 * - Lifecycle methods
 * - Constructors
 *
 * They do NOT catch:
 * - Event handlers (use try/catch)
 * - Async code (use try/catch)
 * - Server-side rendering
 * - Errors in the boundary itself
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console for debugging
    console.error('Error caught by AppErrorBoundary:', error);
    console.error('Component stack:', errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box flexDirection="column" padding={1} borderStyle="round" borderColor="red">
          <Text bold color="red">
            Application Error
          </Text>
          <Text> </Text>
          <Text>An unexpected error occurred:</Text>
          <Text italic color="yellow">
            {this.state.error?.message || 'Unknown error'}
          </Text>
          <Text> </Text>
          <Text dimColor>
            Stack trace has been logged to console.
          </Text>
          <Text dimColor>
            Press Ctrl+C to exit, then restart the application.
          </Text>
        </Box>
      );
    }

    return this.props.children;
  }
}
