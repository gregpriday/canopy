#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import App from './App.js';
import { loadConfig } from './utils/config.js';
import { loadEnv } from './utils/envLoader.js';
import type { CanopyConfig } from './types/index.js';
import { clearTerminalScreen } from './utils/terminal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ParsedArgs {
  cwd: string;
  configOverrides: Partial<CanopyConfig>;
  showHelp: boolean;
  showVersion: boolean;
  noWatch: boolean;
  noGit: boolean;
  initialFilter?: string;
  debug: boolean;
}

function parseCliArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); 

  const result: ParsedArgs = {
    cwd: process.cwd(),
    configOverrides: {},
    showHelp: false,
    showVersion: false,
    noWatch: false,
    noGit: false,
    debug: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.showHelp = true;
      continue;
    }
    if (arg === '--version' || arg === '-v') {
      result.showVersion = true;
      continue;
    }
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
      result.noGit = false; 
      result.configOverrides.showGitStatus = true;
      continue;
    }
    if (arg === '--debug') {
      result.debug = true;
      continue;
    }
    if (arg === '--editor' || arg === '-e') {
      const editor = args[++i];
      if (!editor || editor.startsWith('-')) throw new Error(`--editor requires a value`);
      result.configOverrides.editor = editor;
      continue;
    }
    if (arg === '--filter' || arg === '-f') {
      const filter = args[++i];
      if (!filter || filter.startsWith('-')) throw new Error(`--filter requires a value`);
      result.initialFilter = filter;
      continue;
    }
    if (arg === '--max-depth' || arg === '-d') {
      const depth = args[++i];
      if (!depth) throw new Error(`--max-depth requires a number`);
      const maxDepth = parseInt(depth, 10);
      if (isNaN(maxDepth) || maxDepth < 0) throw new Error(`--max-depth must be a non-negative number`);
      result.configOverrides.maxDepth = maxDepth;
      continue;
    }
    if (arg === '--config' || arg === '-c') {
      const configPath = args[++i];
      if (!configPath || configPath.startsWith('-')) throw new Error(`--config requires a path`);
      continue;
    }
    if (!arg.startsWith('-')) {
      result.cwd = arg;
      continue;
    }
    throw new Error(`Unknown flag: ${arg}\nRun 'canopy --help' for usage information.`);
  }

  return result;
}

function showHelp(): void {
  const helpText = `
Canopy - Terminal-based file browser for developers

USAGE
  canopy [path] [options]

OPTIONS
  -e, --editor <cmd>    Command to open files (default: $EDITOR or code)
  -f, --filter <query>  Initial filter query
  -d, --max-depth <n>   Maximum recursion depth for directory traversal
  -c, --config <path>   Path to custom configuration file
  -H, --hidden          Show hidden files
  -g, --git             Force enable git status (default: auto)
  --no-git              Disable git status
  --no-watch            Disable file watching
  --debug               Enable debug logging
  -h, --help            Show this help message
  -v, --version         Show version information

ARGS
  [path]                Directory to browse (default: current directory)

EXAMPLES
  canopy                    # Open current directory
  canopy src                # Open src directory
  canopy -f "test"          # Filter for files matching "test"
  canopy -H                 # Show hidden files
  canopy --editor vim       # Use vim to open files
`;
  console.log(helpText);
}

function showVersion(): void {
  try {
    const packageJsonPath = join(__dirname, '../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    console.log(`canopy v${packageJson.version}`);
  } catch (error) {
    console.log('canopy v?.?.? (version not found)');
  }
}

async function main(): Promise<void> {
  try {
    const parsedArgs = parseCliArgs(process.argv);

    if (parsedArgs.showHelp) {
      showHelp();
      process.exit(0);
    }
    if (parsedArgs.showVersion) {
      showVersion();
      process.exit(0);
    }

    // 1. Load .env from the target directory
    loadEnv(parsedArgs.cwd);

    // 2. Load configuration
    const baseConfig = await loadConfig(parsedArgs.cwd);

    const finalConfig: CanopyConfig = {
      ...baseConfig,
      ...parsedArgs.configOverrides,
    };

    const supportsRaw = Boolean(process.stdin && (process.stdin as any).isTTY && typeof (process.stdin as any).setRawMode === 'function');
    if (!supportsRaw) {
      console.error('Raw mode is not supported in this environment. Cannot start interactive UI.');
      process.exit(1);
    }

    // We no longer use the Alternate Screen Buffer (ENTER_ALT_SCREEN).
    // This keeps the Canopy output visible in the terminal history after exit.

    const { waitUntilExit } = render(
      React.createElement(App, {
        cwd: parsedArgs.cwd,
        config: finalConfig,
        noWatch: parsedArgs.noWatch,
        noGit: parsedArgs.noGit,
        initialFilter: parsedArgs.initialFilter,
      }),
      { exitOnCtrlC: false, stdin: supportsRaw ? process.stdin : undefined, stdout: process.stdout }
    );

    await waitUntilExit();

    clearTerminalScreen();
    process.exit(0);

  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

main();
