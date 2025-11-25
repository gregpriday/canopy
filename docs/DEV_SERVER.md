# Dev Server Integration

Canopy includes integrated dev server management, allowing you to start, stop, and monitor development servers directly from the dashboard. This is especially useful when working across multiple worktrees, each with its own frontend or backend server.

## Overview

The dev server feature provides:

- **One-keystroke server control** - Press `s` to start/stop the dev server for the focused worktree
- **Automatic URL detection** - Server URLs are extracted from stdout and displayed in the UI
- **Per-worktree servers** - Each worktree can run its own independent dev server
- **Graceful shutdown** - Servers are properly terminated when stopped or when Canopy exits
- **Cross-platform support** - Works on macOS, Linux, and Windows

## Enabling Dev Server

The dev server feature is **disabled by default** and must be explicitly enabled in your project configuration.

Add to your `.canopy.json`:

```json
{
  "devServer": {
    "enabled": true
  }
}
```

Once enabled, a **Server Dock** appears at the bottom of each worktree card that has a detectable dev script.

## Configuration Options

```json
{
  "devServer": {
    "enabled": true,
    "command": "npm run dev",
    "autoStart": false
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable the dev server feature |
| `command` | string | auto-detect | Custom command to run (overrides auto-detection) |
| `autoStart` | boolean | `false` | Automatically start servers when Canopy launches |

### Auto-Detection

When no custom `command` is specified, Canopy looks for common dev scripts in `package.json` (in priority order):

1. `dev` - Most common (Vite, Next.js, etc.)
2. `start:dev` - NestJS and similar frameworks
3. `serve` - Vue CLI, Angular
4. `start` - Create React App, Express

The first matching script is used with `npm run <script>`.

## Usage

### Starting/Stopping Servers

**Keyboard:**
- Press `s` on a focused worktree card to toggle the dev server

**Mouse:**
- Click the `[Start]` / `[Stop]` button in the Server Dock

### Server States

The Server Dock displays different states with visual indicators:

| State | Indicator | Description |
|-------|-----------|-------------|
| Stopped | Gray circle | Server is not running |
| Starting | Yellow circle | Server is starting up, waiting for URL |
| Running | Green circle | Server is running, URL displayed |
| Error | Red circle | Server failed to start or crashed |

### URL Detection

When a server starts, Canopy monitors its output (stdout and stderr) for URL patterns. Once detected, the URL is displayed in the Server Dock:

```
────────────────────────────────────────────────
● http://localhost:5173                  [■ Stop]
```

Supported URL patterns include:

- **Vite:** `Local: http://localhost:5173`
- **Next.js:** `Ready on http://localhost:3000`
- **Create React App:** `Local: http://localhost:3000`
- **Angular:** `Server is listening on http://localhost:4200`
- **Webpack Dev Server:** `Project is running at http://localhost:8080`
- **Express/Generic:** `Listening on port 3000`
- **Any URL with port:** `http://localhost:XXXX` or `https://...`

If only a port number is detected (e.g., "Listening on port 3000"), Canopy constructs `http://localhost:<port>`.

## Architecture

### Components

The dev server system consists of three main parts:

1. **DevServerManager** (`src/services/server/DevServerManager.ts`)
   - Singleton service managing all server processes
   - Handles start/stop/toggle operations
   - Monitors stdout/stderr for URL detection
   - Maintains state and logs per worktree
   - Graceful shutdown with SIGTERM → SIGKILL fallback

2. **ServerDock** (`src/components/ServerDock.tsx`)
   - UI component rendered within WorktreeCard
   - Displays server status, URL, and control button
   - Only renders when dev server feature is enabled and a dev script exists

3. **useDevServer Hook** (`src/hooks/useDevServer.ts`)
   - React hook for components to interact with DevServerManager
   - Subscribes to state updates via event bus
   - Provides start/stop/toggle methods

### Event Flow

```
User Action (keyboard/click)
    ↓
useDashboardNav / ServerDock
    ↓
DevServerManager.toggle()
    ↓
Process spawned via execa
    ↓
stdout/stderr monitored
    ↓
URL detected → state updated
    ↓
events.emit('server:update')
    ↓
UI components re-render
```

### Process Management

- **Process spawning:** Uses `execa` for robust cross-platform process management
- **Shell execution:** Commands run in a shell to support npm scripts and complex commands
- **Process tree cleanup:** `execa` handles killing child processes on all platforms
- **Graceful shutdown:** SIGTERM is sent first, with SIGKILL fallback after 5 seconds
- **Cleanup on exit:** All servers are stopped when Canopy exits

### Caching

Dev script detection is cached to avoid repeated disk I/O:

- Cache TTL: 5 minutes
- Cache is pre-warmed on startup for all worktrees
- Can be invalidated manually when `package.json` changes

## Example Configurations

### Basic (Auto-Detection)

```json
{
  "devServer": {
    "enabled": true
  }
}
```

Uses auto-detection to find the dev script in `package.json`.

### Custom Command

```json
{
  "devServer": {
    "enabled": true,
    "command": "npm run start:frontend"
  }
}
```

Useful when your dev script has a non-standard name or you want to run a specific variant.

### Auto-Start on Launch

```json
{
  "devServer": {
    "enabled": true,
    "autoStart": true
  }
}
```

Automatically starts dev servers for all worktrees when Canopy launches. Use with caution as this starts multiple processes immediately.

### Monorepo with Multiple Servers

For monorepos, you might want different commands per worktree. Currently, the `command` option applies globally. For per-worktree commands, consider:

1. Using workspace-specific `package.json` scripts
2. Creating wrapper scripts that detect the current directory

## Troubleshooting

### Server Dock Not Appearing

1. **Check `enabled` is `true`** - Dev server is disabled by default
2. **Verify `package.json` exists** - Auto-detection requires a package.json
3. **Check for valid scripts** - Must have `dev`, `start:dev`, `serve`, or `start` script
4. **Use custom command** - If your script has a different name, set `command` explicitly

### URL Not Detected

1. **Check server output** - The URL must be printed to stdout or stderr
2. **Verify URL format** - Must match one of the supported patterns
3. **Wait for startup** - Some servers take time before printing the URL
4. **Check logs** - Server logs are stored and can be accessed programmatically

### Server Won't Stop

1. **Wait for graceful shutdown** - SIGTERM is sent first, wait up to 5 seconds
2. **Force quit** - If stuck, quit Canopy with `q` (all servers are killed on exit)
3. **Manual cleanup** - Check for orphaned processes with `ps aux | grep node`

### Server Crashes on Start

1. **Check the error message** - Displayed in the Server Dock
2. **Verify dependencies** - Run `npm install` in the worktree
3. **Check port conflicts** - Another process may be using the port
4. **Try the command manually** - Run the command directly to see full error output

## Keyboard Reference

| Key | Action |
|-----|--------|
| `s` | Toggle dev server for focused worktree (start if stopped, stop if running) |

The `s` key only works when:
- Dev server feature is enabled (`devServer.enabled: true`)
- A dev script is detected for the focused worktree
- No modal is currently open
