#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import App from './App.js';
import { loadConfig } from './utils/config.js';
import type { YellowwoodConfig } from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ParsedArgs {
  cwd: string;
  configOverrides: Partial<YellowwoodConfig>;
  showHelp: boolean;
  showVersion: boolean;
  noWatch: boolean;
  noGit: boolean;
  initialFilter?: string;
}

/**
 * Parse command-line arguments.
 * Supports positional directory argument and various flags.
 */
function parseCliArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // Skip 'node' and script path

  const result: ParsedArgs = {
    cwd: process.cwd(),
    configOverrides: {},
    showHelp: false,
    showVersion: false,
    noWatch: false,
    noGit: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Help flags
    if (arg === '--help' || arg === '-h') {
      result.showHelp = true;
      continue;
    }

    // Version flags
    if (arg === '--version' || arg === '-v') {
      result.showVersion = true;
      continue;
    }

    // Boolean flags (no value)
    if (arg === '--no-watch') {
      result.noWatch = true;
      result.configOverrides.autoRefresh = false;
      continue;
    }

    if (arg === '--no-git') {
      result.noGit = true;
      result.configOverrides.showGitStatus = false;
      continue;
    }

    if (arg === '--hidden' || arg === '-H') {
      result.configOverrides.showHidden = true;
      continue;
    }

    if (arg === '--git' || arg === '-g') {
      result.noGit = false; // Allow --git to override --no-git
      result.configOverrides.showGitStatus = true;
      continue;
    }

    // Value flags (require next argument)
    if (arg === '--editor' || arg === '-e') {
      const editor = args[++i];
      if (!editor || editor.startsWith('-')) {
        throw new Error(`--editor requires a value`);
      }
      result.configOverrides.editor = editor;
      continue;
    }

    if (arg === '--filter' || arg === '-f') {
      const filter = args[++i];
      if (!filter || filter.startsWith('-')) {
        throw new Error(`--filter requires a value`);
      }
      // Store filter for later use (will be passed to App)
      result.initialFilter = filter;
      continue;
    }

    if (arg === '--max-depth' || arg === '-d') {
      const depth = args[++i];
      if (!depth) {
        throw new Error(`--max-depth requires a number`);
      }
      const maxDepth = parseInt(depth, 10);
      if (isNaN(maxDepth) || maxDepth < 0) {
        throw new Error(`--max-depth must be a non-negative number`);
      }
      result.configOverrides.maxDepth = maxDepth;
      continue;
    }

    if (arg === '--config' || arg === '-c') {
      const configPath = args[++i];
      if (!configPath || configPath.startsWith('-')) {
        throw new Error(`--config requires a path`);
      }
      // Config path override (not implemented yet - future enhancement)
      // Will be used by loadConfig in future
      continue;
    }

    // Positional argument (directory path)
    if (!arg.startsWith('-')) {
      result.cwd = arg;
      continue;
    }

    // Unknown flag
    throw new Error(`Unknown flag: ${arg}\nRun 'yellowwood --help' for usage information.`);
  }

  return result;
}

/**
 * Display help information.
 */
function showHelp(): void {
  const helpText = `
Yellowwood - Terminal-based file browser for developers

USAGE
  yellowwood [path] [options]

ARGUMENTS
  [path]                    Directory to browse (default: current directory)

OPTIONS
  -e, --editor <cmd>        Editor command (default: code)
  -f, --filter <pattern>    Initial filter pattern
  -d, --max-depth <n>       Maximum tree depth (default: unlimited)
  -c, --config <path>       Path to config file
  -g, --git                 Enable git status (default: true)
  -H, --hidden              Show hidden files (default: false)
  --no-watch                Disable file watching
  --no-git                  Disable git integration
  -h, --help                Show this help message
  -v, --version             Show version number

EXAMPLES
  yellowwood                                    # Browse current directory
  yellowwood /path/to/project                   # Browse specific directory
  yellowwood --filter .ts                       # Start with .ts files filtered
  yellowwood --editor vim --no-watch            # Use vim, disable watching
  yellowwood ~/project --max-depth 3 --hidden   # Limit depth, show hidden

KEYBOARD SHORTCUTS
  ↑/↓         Navigate tree
  ←/→         Collapse/expand folders
  Enter       Open file or toggle folder
  Space       Toggle folder expansion
  /           Open command bar
  g           Toggle git status visibility
  w           Switch worktree
  c           Copy path or CopyTree reference
  r           Manual refresh
  ?           Show help
  q           Quit

CONFIGURATION
  Project:  .yellowwood.json
  Global:   ~/.config/yellowwood/config.json

For more information, visit: https://github.com/gregpriday/yellowwood
`;

  console.log(helpText);
}

/**
 * Display version information.
 */
function showVersion(): void {
  try {
    const packageJsonPath = join(__dirname, '../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    console.log(`yellowwood v${packageJson.version}`);
  } catch (error) {
    console.log('yellowwood v?.?.? (version not found)');
  }
}

// ANSI codes for Alternate Screen Buffer
const ENTER_ALT_SCREEN = '\x1b[?1049h';
const EXIT_ALT_SCREEN = '\x1b[?1049l';

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  try {
    // Parse command-line arguments
    const parsedArgs = parseCliArgs(process.argv);

    // Handle help and version flags (exit after showing)
    if (parsedArgs.showHelp) {
      showHelp();
      process.exit(0);
    }

    if (parsedArgs.showVersion) {
      showVersion();
      process.exit(0);
    }

    // Load configuration from files
    const baseConfig = await loadConfig(parsedArgs.cwd);

    // Merge CLI overrides with loaded config
    // CLI overrides have highest precedence
    const finalConfig: YellowwoodConfig = {
      ...baseConfig,
      ...parsedArgs.configOverrides,
    };

    // Enter Alternate Screen
    process.stdout.write(ENTER_ALT_SCREEN);

    // Render the Ink app
    const { waitUntilExit } = render(
      React.createElement(App, {
        cwd: parsedArgs.cwd,
        config: finalConfig,
        noWatch: parsedArgs.noWatch,
        noGit: parsedArgs.noGit,
        initialFilter: parsedArgs.initialFilter,
      }),
      { exitOnCtrlC: false }
    );

    await waitUntilExit();

    // Exit Alternate Screen on clean exit
    process.stdout.write(EXIT_ALT_SCREEN);
    process.exit(0);

  } catch (error) {
    // Ensure we restore screen even on error
    process.stdout.write(EXIT_ALT_SCREEN);

    // Handle CLI parsing errors
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

// Run the CLI
main();
