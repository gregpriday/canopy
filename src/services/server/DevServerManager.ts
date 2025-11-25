import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { events } from '../events.js';
import type { DevServerState, DevServerStatus } from '../../types/index.js';
import { logInfo, logWarn, logError } from '../../utils/logger.js';

// URL detection patterns for common dev servers
// Patterns allow optional trailing slash and various hosts
const URL_PATTERNS = [
  // Vite
  /Local:\s+(https?:\/\/localhost:\d+\/?)/i,
  // Next.js
  /Ready on (https?:\/\/localhost:\d+\/?)/i,
  // Generic patterns - broader host matching
  /Listening on (https?:\/\/[\w.-]+:\d+\/?)/i,
  /Server (?:is )?(?:running|started) (?:on|at) (https?:\/\/[\w.-]+:\d+\/?)/i,
  // Create React App
  /Local:\s+(https?:\/\/localhost:\d+\/?)/i,
  // Angular
  /Server is listening on (https?:\/\/[\w.-]+:\d+\/?)/i,
  // Express / generic Node
  /(?:Listening|Started) on (?:port )?(\d+)/i,
  // Webpack Dev Server
  /Project is running at (https?:\/\/[\w.-]+:\d+\/?)/i,
  // Generic URL fallback - capture any http(s) URL with port
  /(https?:\/\/[\w.-]+:\d+\/?)/i,
];

// Port-only patterns (extract port number)
const PORT_PATTERNS = [
  /(?:Listening|Started) on (?:port )?(\d+)/i,
  /port[:\s]+(\d+)/i,
];

const FORCE_KILL_TIMEOUT_MS = 5000;
const MAX_LOG_LINES = 100;

/**
 * DevServerManager manages dev server processes for worktrees.
 *
 * Responsibilities:
 * - Start/stop dev server processes per worktree
 * - Detect server URLs from stdout
 * - Emit state updates via event bus
 * - Graceful shutdown with SIGTERM → SIGKILL fallback
 */
class DevServerManager {
  private servers = new Map<string, ChildProcess>();
  private states = new Map<string, DevServerState>();
  private logBuffers = new Map<string, string[]>();

  /**
   * Get the current state for a worktree's dev server.
   */
  public getState(worktreeId: string): DevServerState {
    return this.states.get(worktreeId) ?? {
      worktreeId,
      status: 'stopped',
    };
  }

  /**
   * Get all server states.
   */
  public getAllStates(): Map<string, DevServerState> {
    return new Map(this.states);
  }

  /**
   * Check if a dev server is running for a worktree.
   */
  public isRunning(worktreeId: string): boolean {
    const state = this.states.get(worktreeId);
    return state?.status === 'running' || state?.status === 'starting';
  }

  /**
   * Start a dev server for a worktree.
   *
   * @param worktreeId - Worktree ID
   * @param worktreePath - Path to the worktree
   * @param command - Optional custom command (defaults to auto-detection)
   */
  public async start(
    worktreeId: string,
    worktreePath: string,
    command?: string
  ): Promise<void> {
    // Don't start if already running
    if (this.isRunning(worktreeId)) {
      logWarn('Dev server already running for worktree', { worktreeId });
      return;
    }

    // Detect or use provided command
    const resolvedCommand = command ?? this.detectDevCommand(worktreePath);

    if (!resolvedCommand) {
      this.updateState(worktreeId, {
        status: 'error',
        errorMessage: 'No dev script found in package.json',
      });
      events.emit('server:error', {
        worktreeId,
        error: 'No dev script found in package.json',
      });
      return;
    }

    logInfo('Starting dev server', { worktreeId, command: resolvedCommand });

    // Update state to starting
    this.updateState(worktreeId, { status: 'starting' });

    // Initialize log buffer
    this.logBuffers.set(worktreeId, []);

    try {
      // Parse command and spawn process
      const [cmd, ...args] = this.parseCommand(resolvedCommand);

      const proc = spawn(cmd, args, {
        cwd: worktreePath,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        // Detach on Windows to allow tree-kill
        detached: process.platform !== 'win32',
      });

      if (!proc.pid) {
        throw new Error('Failed to spawn process - no PID');
      }

      this.servers.set(worktreeId, proc);
      this.updateState(worktreeId, { pid: proc.pid });

      // Handle stdout for URL detection
      proc.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        this.appendLog(worktreeId, output);
        this.detectUrl(worktreeId, output);
      });

      // Handle stderr (also check for URL as some servers output there)
      proc.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        this.appendLog(worktreeId, output);
        this.detectUrl(worktreeId, output);
      });

      // Handle process exit
      proc.on('exit', (code, signal) => {
        logInfo('Dev server exited', { worktreeId, code, signal });
        this.servers.delete(worktreeId);

        const currentState = this.states.get(worktreeId);

        // Only update to stopped if not already in error state
        if (currentState?.status !== 'error') {
          if (code !== 0 && code !== null && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
            this.updateState(worktreeId, {
              status: 'error',
              errorMessage: `Process exited with code ${code}`,
            });
          } else {
            this.updateState(worktreeId, {
              status: 'stopped',
              url: undefined,
              port: undefined,
              pid: undefined,
            });
          }
        }
      });

      // Handle process error
      proc.on('error', (error) => {
        logError('Dev server process error', { worktreeId, error: error.message });
        this.servers.delete(worktreeId);
        this.updateState(worktreeId, {
          status: 'error',
          errorMessage: error.message,
        });
        events.emit('server:error', { worktreeId, error: error.message });
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logError('Failed to start dev server', { worktreeId, error: message });
      this.updateState(worktreeId, {
        status: 'error',
        errorMessage: message,
      });
      events.emit('server:error', { worktreeId, error: message });
    }
  }

  /**
   * Stop a dev server for a worktree.
   * Uses graceful SIGTERM with SIGKILL fallback.
   */
  public async stop(worktreeId: string): Promise<void> {
    const proc = this.servers.get(worktreeId);

    if (!proc) {
      // No process - just reset state
      this.updateState(worktreeId, {
        status: 'stopped',
        url: undefined,
        port: undefined,
        pid: undefined,
        errorMessage: undefined,
      });
      return;
    }

    logInfo('Stopping dev server', { worktreeId, pid: proc.pid });

    return new Promise((resolve) => {
      // Set up force kill timer
      const forceKillTimer = setTimeout(() => {
        logWarn('Force killing dev server', { worktreeId });
        try {
          // On Unix, kill the process group
          if (process.platform !== 'win32' && proc.pid) {
            process.kill(-proc.pid, 'SIGKILL');
          } else {
            proc.kill('SIGKILL');
          }
        } catch {
          // Process may have already exited
        }
      }, FORCE_KILL_TIMEOUT_MS);

      proc.once('exit', () => {
        clearTimeout(forceKillTimer);
        this.servers.delete(worktreeId);
        this.updateState(worktreeId, {
          status: 'stopped',
          url: undefined,
          port: undefined,
          pid: undefined,
        });
        resolve();
      });

      // Try graceful shutdown first
      try {
        // On Unix, send SIGTERM to the process group
        if (process.platform !== 'win32' && proc.pid) {
          process.kill(-proc.pid, 'SIGTERM');
        } else {
          proc.kill('SIGTERM');
        }
      } catch {
        // Process may have already exited
        clearTimeout(forceKillTimer);
        resolve();
      }
    });
  }

  /**
   * Toggle dev server state for a worktree.
   * Starts if stopped/error, stops if running/starting.
   */
  public async toggle(worktreeId: string, worktreePath: string, command?: string): Promise<void> {
    const state = this.getState(worktreeId);

    if (state.status === 'stopped' || state.status === 'error') {
      await this.start(worktreeId, worktreePath, command);
    } else {
      await this.stop(worktreeId);
    }
  }

  /**
   * Stop all running dev servers.
   * Should be called on app shutdown.
   */
  public async stopAll(): Promise<void> {
    logInfo('Stopping all dev servers', { count: this.servers.size });

    const promises = Array.from(this.servers.keys()).map(worktreeId =>
      this.stop(worktreeId)
    );

    await Promise.all(promises);
    this.servers.clear();
    this.states.clear();
    this.logBuffers.clear();
  }

  /**
   * Get logs for a worktree's dev server.
   */
  public getLogs(worktreeId: string): string[] {
    return this.logBuffers.get(worktreeId) ?? [];
  }

  /**
   * Detect dev command from package.json scripts.
   */
  public detectDevCommand(worktreePath: string): string | null {
    const packageJsonPath = path.join(worktreePath, 'package.json');

    if (!existsSync(packageJsonPath)) {
      return null;
    }

    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const scripts = pkg.scripts || {};

      // Priority order for script detection
      const candidates = ['dev', 'start:dev', 'serve', 'start'];

      for (const script of candidates) {
        if (scripts[script]) {
          return `npm run ${script}`;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if a worktree has a detectable dev script.
   */
  public hasDevScript(worktreePath: string): boolean {
    return this.detectDevCommand(worktreePath) !== null;
  }

  /**
   * Update state and emit event.
   */
  private updateState(
    worktreeId: string,
    updates: Partial<Omit<DevServerState, 'worktreeId'>>
  ): void {
    const current = this.states.get(worktreeId) ?? { worktreeId, status: 'stopped' as DevServerStatus };
    const next: DevServerState = { ...current, ...updates };
    this.states.set(worktreeId, next);
    events.emit('server:update', next);
  }

  /**
   * Append output to log buffer (with size limit).
   */
  private appendLog(worktreeId: string, output: string): void {
    const logs = this.logBuffers.get(worktreeId) ?? [];

    // Split by newlines and add each line
    const lines = output.split('\n').filter(line => line.trim());
    logs.push(...lines);

    // Trim to max size
    if (logs.length > MAX_LOG_LINES) {
      logs.splice(0, logs.length - MAX_LOG_LINES);
    }

    this.logBuffers.set(worktreeId, logs);

    // Update state with latest logs
    const current = this.states.get(worktreeId);
    if (current) {
      this.states.set(worktreeId, { ...current, logs });
    }
  }

  /**
   * Detect URL from server output.
   */
  private detectUrl(worktreeId: string, output: string): void {
    const currentState = this.states.get(worktreeId);

    // Only detect URL if we're in starting state
    if (currentState?.status !== 'starting') {
      return;
    }

    // Try URL patterns first
    for (const pattern of URL_PATTERNS) {
      const match = output.match(pattern);
      if (match?.[1]) {
        let url = match[1];

        // If just a port number, construct URL
        if (/^\d+$/.test(url)) {
          url = `http://localhost:${url}`;
        }

        // Extract port from URL
        const portMatch = url.match(/:(\d+)/);
        const port = portMatch ? parseInt(portMatch[1], 10) : undefined;

        logInfo('Detected dev server URL', { worktreeId, url, port });

        this.updateState(worktreeId, {
          status: 'running',
          url,
          port,
        });
        return;
      }
    }

    // Try port-only patterns
    for (const pattern of PORT_PATTERNS) {
      const match = output.match(pattern);
      if (match?.[1]) {
        const port = parseInt(match[1], 10);
        const url = `http://localhost:${port}`;

        logInfo('Detected dev server port', { worktreeId, url, port });

        this.updateState(worktreeId, {
          status: 'running',
          url,
          port,
        });
        return;
      }
    }
  }

  /**
   * Parse command string into executable and args.
   *
   * SECURITY NOTE: Commands are executed with shell: true, so they run exactly
   * as the user entered them. This is intentional for dev server commands which
   * may include npm scripts, environment variables, etc. Commands should only
   * come from trusted sources (package.json scripts or user config).
   */
  private parseCommand(command: string): string[] {
    // Simple parsing - split by space, respecting quotes
    const parts: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (const char of command) {
      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuote) {
        inQuote = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuote) {
        if (current) {
          parts.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current);
    }

    return parts;
  }
}

// Export singleton instance
export const devServerManager = new DevServerManager();
