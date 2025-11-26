import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'; // Added useCallback
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from './components/Header.js';
import { WorktreeOverview, sortWorktrees } from './components/WorktreeOverview.js';
import { getExplorerLabel } from './components/WorktreeCard.js';
import { WorktreePanel } from './components/WorktreePanel.js';
import { CommandPalette } from './components/CommandPalette.js';
import { Notification } from './components/Notification.js';
import { AppErrorBoundary } from './components/AppErrorBoundary.js';
import type { CanopyConfig, Notification as NotificationType, NotificationPayload, Worktree, GitStatus, WorktreeChanges, AISummaryStatus } from './types/index.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useDashboardNav } from './hooks/useDashboardNav.js';
import { useQuickLinks } from './hooks/useQuickLinks.js';
import { useAppLifecycle } from './hooks/useAppLifecycle.js';
import { openFile, openWorktreeInEditor } from './utils/fileOpener.js';
import { copyFilePath } from './utils/clipboard.js';
import { execa } from 'execa';
import { openGitHubRepo } from './utils/github.js';
// PERF: Removed useWatcher - WorktreeMonitor handles file watching for all worktrees
import path from 'path';
// PERF: Removed useGitStatus - WorktreeMonitor provides git status for all worktrees
import { useProjectIdentity } from './hooks/useProjectIdentity.js';
import { useCopyTree } from './hooks/useCopyTree.js';
import { worktreeService } from './services/monitor/index.js';
import { devServerManager } from './services/server/index.js';
import { useWorktreeMonitor, worktreeStatesToArray } from './hooks/useWorktreeMonitor.js';
import { useTerminalDimensions } from './hooks/useTerminalDimensions.js';
import { saveSessionState, loadSessionState } from './utils/state.js';
import { events, type ModalId, type ModalContextMap } from './services/events.js'; // Import event bus
import { clearTerminalScreen } from './utils/terminal.js';
import { logWarn, logError } from './utils/logger.js';
import { ThemeProvider } from './theme/ThemeProvider.js';
import { setupGlobalErrorHandler, createErrorNotification } from './utils/errorHandling.js';
import { detectTerminalTheme } from './theme/colorPalette.js';
import open from 'open';

interface AppProps {
  cwd: string;
  config?: CanopyConfig;
  noWatch?: boolean;
  noGit?: boolean;
  initialFilter?: string;
}

const MODAL_CLOSE_PRIORITY: ModalId[] = [
  'command-palette',
  'worktree',
];

const AppContent: React.FC<AppProps> = ({ cwd, config: initialConfig, noWatch, noGit, initialFilter }) => {
  const { exit } = useApp();

  // Centralized terminal dimensions with debounced resize handling
  // The hook handles: debouncing, minimum thresholds, scroll jitter prevention, and event emission
  const { width: terminalWidth, height } = useTerminalDimensions();

  // Centralized lifecycle management
  const {
    status: lifecycleStatus,
    config,
    worktrees,
    activeWorktreeId: initialActiveWorktreeId,
    activeRootPath: initialActiveRootPath,
    initialCopyProfile,
    error: lifecycleError,
    notification: lifecycleNotification,
    setNotification: setLifecycleNotification,
    reinitialize,
  } = useAppLifecycle({ cwd, initialConfig, noWatch, noGit });

  // Local notification state (merged with lifecycle notifications)
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const createNotification = useCallback(
    (payload: NotificationPayload): NotificationType => ({
      id: payload.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      message: payload.message,
      type: payload.type,
    }),
    []
  );

  useEffect(() => {
    if (!lifecycleNotification) {
      return;
    }

    setNotifications(prev => [...prev, createNotification(lifecycleNotification)]);
    setLifecycleNotification(null);
  }, [createNotification, lifecycleNotification, setLifecycleNotification]);
  
  // Subscribe to UI notifications from event bus
  useEffect(() => {
    return events.on('ui:notify', (payload) => {
      setNotifications(prev => [...prev, createNotification(payload)]);
    });
  }, [createNotification]);

  // Set up global error handler for uncaught exceptions and unhandled rejections
  useEffect(() => {
    const cleanup = setupGlobalErrorHandler((error: unknown) => {
      // Log error for debugging (setupGlobalErrorHandler already logs, but we add context)
      logError('Global error caught in App', error);

      // Create user-facing notification
      const notification = createErrorNotification(error, 'An unexpected error occurred');
      events.emit('ui:notify', notification);
    });

    return cleanup;
  }, []);


  // Listen for file:open events
  useEffect(() => {
    return events.on('file:open', async (payload) => {
      if (!payload.path) return;
      try {
        await openFile(payload.path, config);
        events.emit('ui:notify', { type: 'success', message: `Opened ${path.basename(payload.path)}` });
      } catch (error) {
        events.emit('ui:notify', { type: 'error', message: `Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}` });
      }
    });
  }, [config]);

  // Listen for ui:modal:open events
  const [activeModals, setActiveModals] = useState<Set<ModalId>>(new Set());
  const [modalContext, setModalContext] = useState<Partial<ModalContextMap>>({});

  // Filter state - initialize from CLI if provided
  const [filterActive, setFilterActive] = useState(!!initialFilter);
  const [filterQuery, setFilterQuery] = useState(initialFilter || '');

  // Active worktree state (can change via user actions)
  const [activeWorktreeId, setActiveWorktreeId] = useState<string | null>(initialActiveWorktreeId);
  const [activeRootPath, setActiveRootPath] = useState<string>(initialActiveRootPath);
  const [focusedWorktreeId, setFocusedWorktreeId] = useState<string | null>(initialActiveWorktreeId);
  const [expandedWorktreeIds, setExpandedWorktreeIds] = useState<Set<string>>(new Set());
  const [lastCopyProfile, setLastCopyProfile] = useState<string>(initialCopyProfile || 'default');

  useEffect(() => {
    setLastCopyProfile(initialCopyProfile || 'default');
  }, [initialCopyProfile]);

  // Use the new WorktreeMonitor system
  const worktreeStates = useWorktreeMonitor();
  const enrichedWorktrees = useMemo(
    () => worktreeStatesToArray(worktreeStates),
    [worktreeStates]
  );

  // Build worktreeChanges map for backward compatibility
  const worktreeChanges = useMemo(() => {
    const map = new Map<string, WorktreeChanges>();
    for (const state of worktreeStates.values()) {
      if (state.worktreeChanges) {
        map.set(state.id, state.worktreeChanges);
      }
    }
    return map;
  }, [worktreeStates]);


  // Track latest requested worktree to prevent race conditions during rapid switches
  const latestWorktreeSwitchRef = useRef<string | null>(null);
  const pendingCycleDirectionRef = useRef<number | null>(null);

  // Track worktree switching state for UI feedback
  const [isSwitchingWorktree, setIsSwitchingWorktree] = useState(false);
  const lastWorktreeSwitchTime = useRef<number>(0);
  const WORKTREE_SWITCH_DEBOUNCE_MS = 300; // Prevent double-switches

  // Listen for file:copy-path events
  useEffect(() => {
    return events.on('file:copy-path', async (payload) => {
      if (!payload.path) return;
      const pathToCopy = payload.path;

      try {
        // Normalize paths to absolute (copyFilePath requires absolute paths)
        const normalizedRoot = path.isAbsolute(activeRootPath)
          ? activeRootPath
          : path.resolve(activeRootPath);
        const normalizedPath = path.isAbsolute(pathToCopy)
          ? pathToCopy
          : path.resolve(normalizedRoot, pathToCopy);

        await copyFilePath(normalizedPath, normalizedRoot, true); // Use relative paths
        events.emit('ui:notify', { type: 'success', message: 'Path copied to clipboard' });
      } catch (error) {
        events.emit('ui:notify', { type: 'error', message: `Failed to copy path: ${error instanceof Error ? error.message : 'Unknown error'}` });
      }
    });
  }, [activeRootPath]);

  // Git visibility state
  const [showGitMarkers, setShowGitMarkers] = useState(config.showGitStatus && !noGit);
  const effectiveConfig = useMemo(
    () => ({ ...config, showGitStatus: showGitMarkers }),
    [config, showGitMarkers]
  );

  // PERF: Removed useGitStatus hook - WorktreeMonitor provides git status
  // gitEnabled is now derived from whether the active worktree has been monitored
  const gitEnabled = useMemo(() => {
    if (noGit) return false;
    // Check if the active worktree is being monitored (not just any worktree)
    return activeWorktreeId ? worktreeStates.has(activeWorktreeId) : worktreeStates.size > 0;
  }, [noGit, worktreeStates, activeWorktreeId]);

  const worktreesWithStatus = useMemo(() => {
    return enrichedWorktrees.map(wt => {
      const changes = worktreeChanges.get(wt.id);
      const modifiedCount = changes?.changedFileCount ?? wt.modifiedCount;
      return {
        ...wt,
        modifiedCount,
        changes: changes?.changes,
      };
    });
  }, [enrichedWorktrees, worktreeChanges]);

  const sortedWorktrees = useMemo(() => sortWorktrees(worktreesWithStatus), [worktreesWithStatus]);

  // Derive aggregated AI status for header display
  // Priority: error > disabled > loading > active
  const aggregatedAIStatus = useMemo((): AISummaryStatus => {
    let hasError = false;
    let hasDisabled = false;
    let hasLoading = false;

    for (const state of worktreeStates.values()) {
      if (state.aiStatus === 'error') hasError = true;
      else if (state.aiStatus === 'disabled') hasDisabled = true;
      else if (state.aiStatus === 'loading') hasLoading = true;
    }

    if (hasError) return 'error';
    if (hasDisabled) return 'disabled';
    if (hasLoading) return 'loading';
    return 'active';
  }, [worktreeStates]);

  const currentWorktree = worktreesWithStatus.find(wt => wt.id === activeWorktreeId) || null;

  // Compute active worktree count (worktrees with changes)
  const activeWorktreeCount = useMemo(() => {
    return worktreesWithStatus.filter(wt =>
      worktreeChanges.get(wt.id)?.changedFileCount ?? 0 > 0
    ).length;
  }, [worktreesWithStatus, worktreeChanges]);

  const activeWorktreeChanges = useMemo(
    () => (activeWorktreeId ? worktreeChanges.get(activeWorktreeId) : undefined),
    [activeWorktreeId, worktreeChanges]
  );

  // Git status for tree view - derived entirely from WorktreeMonitor via worktreeStates
  const effectiveGitStatus = useMemo(() => {
    if (activeWorktreeChanges?.changes) {
      return new Map(activeWorktreeChanges.changes.map(change => [change.path, change.status] as const));
    }
    return new Map();
  }, [activeWorktreeChanges]);

  const isWorktreePanelOpen = activeModals.has('worktree');
  const isCommandPaletteOpen = activeModals.has('command-palette');

  // Quick links hook for slash commands and keyboard shortcuts
  const { commands: quickLinkCommands, openByShortcut, enabled: quickLinksEnabled } = useQuickLinks(config.quickLinks);

  const headerRows = 3;
  const overlayRows = (notifications.length > 0 ? notifications.length * 2 : 0);
  // Reserve header + overlays + 1 extra row for the safety margin
  const reservedRows = headerRows + overlayRows + 1;
  const dashboardViewportSize = useMemo(() => {
    const available = Math.max(1, height - reservedRows);
    return Math.max(3, Math.floor(available / 5));
  }, [height, reservedRows]);

  const worktreesRef = useRef<Worktree[]>([]);
  worktreesRef.current = worktreesWithStatus;
  // Sync active worktree/path from lifecycle on initialization
  useEffect(() => {
    if (lifecycleStatus === 'ready') {
      const fallbackWorktree =
        (initialActiveWorktreeId
          ? worktreesWithStatus.find(wt => wt.id === initialActiveWorktreeId)
          : worktreesWithStatus.find(wt => wt.isCurrent)) ??
        worktreesWithStatus[0];

      const nextWorktreeId = fallbackWorktree?.id ?? initialActiveWorktreeId;
      const nextRootPath = fallbackWorktree?.path ?? initialActiveRootPath;

      setActiveWorktreeId(nextWorktreeId);
      setActiveRootPath(nextRootPath);
      events.emit('sys:ready', { cwd: nextRootPath });
    }
  }, [initialActiveRootPath, initialActiveWorktreeId, lifecycleStatus, worktreesWithStatus]);

  useEffect(() => {
    if (sortedWorktrees.length === 0) {
      setFocusedWorktreeId(null);
      return;
    }

    const hasFocused = sortedWorktrees.some(wt => wt.id === focusedWorktreeId);
    if (!hasFocused) {
      const fallback =
        sortedWorktrees.find(wt => wt.id === activeWorktreeId) ||
        sortedWorktrees.find(wt => wt.isCurrent) ||
        sortedWorktrees[0];
      setFocusedWorktreeId(fallback?.id ?? null);
    }
  }, [activeWorktreeId, focusedWorktreeId, sortedWorktrees]);

  // Synchronization Effect: Sync WorktreeService when worktrees or active worktree changes
  // This allows WorktreeService to incrementally add/remove/update monitors
  useEffect(() => {
    if (lifecycleStatus === 'ready' && worktrees.length > 0) {
      void worktreeService.sync(
        worktrees,
        activeWorktreeId,
        'main', // mainBranch - could be made configurable
        !noWatch,
        config.monitor,
        config.ai
      );
    }
  }, [worktrees, activeWorktreeId, lifecycleStatus, noWatch, config.monitor, config.ai]);

  // Teardown Effect: Clean up all monitors only on unmount
  // This runs once when the component unmounts, not on every dependency change
  useEffect(() => {
    return () => {
      void worktreeService.stopAll();
    };
  }, []);

  // Dev Server Auto-Start: Start dev servers on app launch if configured
  const devServerAutoStartDone = useRef(false);
  useEffect(() => {
    // Only run once when lifecycle is ready and we have worktrees
    if (lifecycleStatus !== 'ready' || worktrees.length === 0 || devServerAutoStartDone.current) {
      return;
    }

    const devServerConfig = config.devServer;
    const autoStart = devServerConfig?.autoStart ?? false;
    const enabled = devServerConfig?.enabled ?? true;

    // Skip if feature is disabled or auto-start is off
    if (!enabled || !autoStart) {
      devServerAutoStartDone.current = true;
      return;
    }

    devServerAutoStartDone.current = true;

    // Auto-start dev servers for all worktrees with dev scripts
    const startServers = async () => {
      const customCommand = devServerConfig?.command;

      for (const wt of worktrees) {
        const hasDevScript = await devServerManager.hasDevScriptAsync(wt.path);
        if (hasDevScript) {
          // Start with custom command if provided, otherwise auto-detect
          void devServerManager.start(wt.id, wt.path, customCommand);
        }
      }
    };

    void startServers();
  }, [lifecycleStatus, worktrees, config.devServer]);

  // Note: sys:refresh is handled by WorktreeMonitor internally.
  // PERF: Removed useGitStatus refresh call - WorktreeMonitor handles git status updates.

  const projectIdentity = useProjectIdentity(activeRootPath);

  // Resolve theme mode (auto detects terminal background)
  const themeMode = useMemo(() => {
    const configTheme = effectiveConfig.theme || 'auto';
    return configTheme === 'auto' ? detectTerminalTheme() : configTheme;
  }, [effectiveConfig.theme]);

  // Extract project accent colors for theme
  const projectAccent = useMemo(() => {
    if (projectIdentity) {
      return {
        primary: projectIdentity.gradientStart,
        secondary: projectIdentity.gradientEnd,
      };
    }
    return undefined;
  }, [projectIdentity]);

  // Centralized CopyTree listener
  useCopyTree(activeRootPath, effectiveConfig);

  const handleDismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const handleToggleExpandWorktree = useCallback((id: string) => {
    setExpandedWorktreeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleOpenWorktreeEditor = useCallback(async (id: string) => {
    const target = sortedWorktrees.find(wt => wt.id === id);
    if (!target) {
      return;
    }

    const openerName = effectiveConfig.openers?.default?.cmd ?? effectiveConfig.editor;
    const label = target.branch ?? target.name ?? target.path;

    try {
      await openWorktreeInEditor(target, effectiveConfig);
      events.emit('ui:notify', { type: 'success', message: `Opened '${label}' in ${openerName}` });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to open editor';
      events.emit('ui:notify', { type: 'error', message });
    }
  }, [effectiveConfig, sortedWorktrees]);

  const handleOpenWorktreeExplorer = useCallback(async (id: string) => {
    const target = sortedWorktrees.find(wt => wt.id === id);
    if (!target) {
      return;
    }

    try {
      await open(target.path);
      const label = getExplorerLabel();
      events.emit('ui:notify', { type: 'success', message: `Opened in ${label}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open folder';
      events.emit('ui:notify', { type: 'error', message });
    }
  }, [sortedWorktrees]);

  const handleOpenGitFox = useCallback(async () => {
    try {
      // Open GitFox in the main repository root
      await execa('gitfox', [cwd], { detached: true, stdio: 'ignore' });
      events.emit('ui:notify', { type: 'success', message: 'Opening GitFox...' });
    } catch (error) {
      events.emit('ui:notify', {
        type: 'error',
        message: 'Failed to launch GitFox. Is the CLI installed?'
      });
    }
  }, [cwd]);

  const handleOpenGitHub = useCallback(async () => {
    try {
      await openGitHubRepo(activeRootPath);
      events.emit('ui:notify', { type: 'success', message: 'Opening GitHub...' });
    } catch (error) {
      events.emit('ui:notify', {
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to open GitHub'
      });
    }
  }, [activeRootPath]);

  const handleCopyTreeForWorktree = useCallback((id: string, profile?: string) => {
    const target = sortedWorktrees.find(wt => wt.id === id);
    if (!target) {
      return;
    }

    const resolvedProfile = profile || lastCopyProfile || 'default';

    events.emit('file:copy-tree', {
      rootPath: target.path,
      profile: resolvedProfile,
    });

    setLastCopyProfile(resolvedProfile);
  }, [lastCopyProfile, sortedWorktrees]);

  const handleToggleServerForWorktree = useCallback((id: string) => {
    const target = sortedWorktrees.find(wt => wt.id === id);
    if (!target) {
      return;
    }

    // Pass custom command from config if provided
    void devServerManager.toggle(target.id, target.path, config.devServer?.command);
  }, [sortedWorktrees, config.devServer?.command]);

  const handleCommandPaletteExecute = useCallback((command: { name: string; action: () => void }) => {
    events.emit('ui:modal:close', { id: 'command-palette' });
    command.action();
  }, []);

  const handleOpenCommandPalette = useCallback(() => {
    events.emit('ui:modal:open', { id: 'command-palette' });
  }, []);

  useEffect(() => {
    const handleOpen = events.on('ui:modal:open', ({ id, context }) => {
      setActiveModals((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      if (context !== undefined) {
        setModalContext((prev) => ({ ...prev, [id]: context }));
      }
    });

    const handleClose = events.on('ui:modal:close', ({ id }) => {
      setActiveModals((prev) => {
        if (!id) {
          return new Set();
        }
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setModalContext((prev) => {
        if (!id) {
          return {};
        }
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    return () => {
      handleOpen();
      handleClose();
    };
  }, []);

  const refreshTree = useCallback(async () => {
    events.emit('sys:refresh');
  }, []);

  const exitApp = useCallback(() => {
    exit();
  }, [exit]);


  useEffect(() => {
    return () => {
      if (activeWorktreeId) {
        void saveSessionState(activeWorktreeId, {
          lastCopyProfile,
          timestamp: Date.now(),
        }).catch((err) => {
          console.error('Error saving session state:', err);
        });
      }
    };
  }, [activeWorktreeId, lastCopyProfile]);

  useEffect(() => {
    const unsubscribeFilterSet = events.on('ui:filter:set', ({ query }) => {
      setFilterActive(true);
      setFilterQuery(query);
    });

    const unsubscribeFilterClear = events.on('ui:filter:clear', () => {
      setFilterActive(false);
      setFilterQuery('');
    });

    return () => {
      unsubscribeFilterSet();
      unsubscribeFilterClear();
    };
  }, []);


  const handleClearFilter = () => {
    const closeModalByPriority = () => {
      for (const modalId of MODAL_CLOSE_PRIORITY) {
        if (activeModals.has(modalId)) {
          events.emit('ui:modal:close', { id: modalId });
          return true;
        }
      }
      return false;
    };

    if (closeModalByPriority()) {
      return;
    }

    if (filterActive) {
      setFilterActive(false);
      setFilterQuery('');
      events.emit('ui:notify', {
        type: 'info',
        message: 'Filter cleared',
      });
    }
  };

  const handleNextWorktree = () => {
    // Edge case: only one worktree
    if (worktreesWithStatus.length <= 1) {
      events.emit('ui:notify', {
        type: 'info',
        message: 'Only one worktree available',
      });
      return;
    }

    // Debounce rapid key presses to prevent double-switching
    const now = Date.now();
    if (now - lastWorktreeSwitchTime.current < WORKTREE_SWITCH_DEBOUNCE_MS) {
      return; // Ignore rapid presses
    }
    lastWorktreeSwitchTime.current = now;

    // Find next worktree (wrap around to first after last)
    const currentIndex = worktreesWithStatus.findIndex(wt => wt.id === activeWorktreeId);
    const nextIndex = (currentIndex + 1) % worktreesWithStatus.length;
    const nextWorktree = worktreesWithStatus[nextIndex];

    if (nextWorktree) {
      handleSwitchWorktree(nextWorktree);
    }
  };

  const formatWorktreeSwitchMessage = useCallback((targetWorktree: Worktree) => {
    let message = `Switched to ${targetWorktree.branch || targetWorktree.name}`;
    if (targetWorktree.summary) {
      message += ` — ${targetWorktree.summary}`;
    }
    if (targetWorktree.modifiedCount !== undefined && targetWorktree.modifiedCount > 0) {
      message += ` [${targetWorktree.modifiedCount} files]`;
    }
    return message;
  }, []);

  const handleSwitchWorktree = useCallback(async (targetWorktree: Worktree, options?: { suppressNotify?: boolean }) => {
    const suppressNotify = options?.suppressNotify ?? false;
    // Mark this as the latest requested switch to prevent race conditions
    latestWorktreeSwitchRef.current = targetWorktree.id;

    // Show switching state in UI
    setIsSwitchingWorktree(true);

    try {
      // Show "Switching to..." notification
      events.emit('ui:notify', {
        type: 'info',
        message: `Switching to ${targetWorktree.branch || targetWorktree.name}...`,
      });

      // 1. Save current worktree's session BEFORE switching
      if (activeWorktreeId) {
        try {
          await saveSessionState(activeWorktreeId, {
            lastCopyProfile,
            timestamp: Date.now(),
          });
        } catch (error) {
          logWarn('Failed to save session state during worktree switch', {
            message: (error as Error).message,
          });
        }
      }

      // 2. Load target worktree's session
      let session: Awaited<ReturnType<typeof loadSessionState>> | null = null;
      try {
        session = await loadSessionState(targetWorktree.id);
      } catch (error) {
        logWarn('Failed to load session state for worktree', {
          worktreeId: targetWorktree.id,
          message: (error as Error).message,
        });
      }

      // 3. Check if a newer switch was requested while we were awaiting - bail out if so
      if (latestWorktreeSwitchRef.current !== targetWorktree.id) {
        return; // A newer switch is in progress, don't apply stale state
      }

      const nextCopyProfile = session?.lastCopyProfile ?? 'default';

      // 4. Update all state atomically
      setActiveWorktreeId(targetWorktree.id);
      setActiveRootPath(targetWorktree.path);
      setLastCopyProfile(nextCopyProfile);

      // 5. Reset transient UI state
      setFilterActive(false);
      setFilterQuery('');
      // PERF: Removed clearGitStatus() - WorktreeService handles git status per-worktree

      // 6. Notify user of success
      events.emit('ui:modal:close', { id: 'worktree' });

      events.emit('ui:notify', {
        type: 'success',
        message: formatWorktreeSwitchMessage(targetWorktree),
      });
    } catch (error) {
      // Only show error if this is still the latest requested switch
      if (latestWorktreeSwitchRef.current === targetWorktree.id) {
        events.emit('ui:notify', {
          type: 'error',
          message: `Failed to switch worktree: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    } finally {
      // Only clear the indicator if this was the latest requested switch
      if (latestWorktreeSwitchRef.current === targetWorktree.id) {
        setIsSwitchingWorktree(false);
      }
    }
  }, [activeWorktreeId, formatWorktreeSwitchMessage, lastCopyProfile]);

  useEffect(() => {
    return events.on('sys:worktree:switch', async ({ worktreeId }) => {
      const targetWorktree = worktreesRef.current.find(wt => wt.id === worktreeId);
      if (targetWorktree) {
        await handleSwitchWorktree(targetWorktree);
      } else {
        events.emit('ui:notify', { type: 'error', message: 'Worktree not found' });
      }
    });
  }, [handleSwitchWorktree]);

  // Listen for sys:worktree:cycle (from /wt next or /wt prev)
  useEffect(() => {
    return events.on('sys:worktree:cycle', async ({ direction }) => {
      const worktreeList =
        worktreesRef.current.length > 0
          ? worktreesRef.current
          : (worktreesWithStatus.length > 0
            ? worktreesWithStatus
            : worktrees);
      if (worktreeList.length <= 1) {
        if (lifecycleStatus !== 'ready') {
          pendingCycleDirectionRef.current = direction;
          return;
        }
        events.emit('ui:notify', {
          type: 'warning',
          message: 'No other worktrees to switch to',
        });
        return;
      }

      const currentIndex = worktreeList.findIndex(wt => wt.id === activeWorktreeId);
      const fallbackIndex = worktreeList.findIndex(wt => wt.isCurrent);
      const resolvedIndex = currentIndex >= 0
        ? currentIndex
        : (fallbackIndex >= 0 ? fallbackIndex : 0);
      const nextIndex = (resolvedIndex + direction + worktreeList.length) % worktreeList.length;
      const nextWorktree = worktreeList[nextIndex];

      await handleSwitchWorktree(nextWorktree);
    });
  }, [activeWorktreeId, handleSwitchWorktree, lifecycleStatus, worktreesWithStatus, worktrees]);

  useEffect(() => {
    if (pendingCycleDirectionRef.current === null) {
      return;
    }
    if (worktreesWithStatus.length <= 1 || lifecycleStatus !== 'ready') {
      return;
    }

    const direction = pendingCycleDirectionRef.current;
    pendingCycleDirectionRef.current = null;

    const worktreeList = worktreesWithStatus;
    const currentIndex = worktreeList.findIndex(wt => wt.id === activeWorktreeId);
    const fallbackIndex = worktreeList.findIndex(wt => wt.isCurrent);
    const resolvedIndex = currentIndex >= 0
      ? currentIndex
      : (fallbackIndex >= 0 ? fallbackIndex : 0);
    const nextIndex = (resolvedIndex + direction + worktreeList.length) % worktreeList.length;
    const nextWorktree = worktreeList[nextIndex];

    if (nextWorktree) {
      void handleSwitchWorktree(nextWorktree);
    }
  }, [activeWorktreeId, handleSwitchWorktree, lifecycleStatus, worktreesWithStatus]);

  // Listen for sys:worktree:selectByName (from /wt <pattern>)
  useEffect(() => {
    return events.on('sys:worktree:selectByName', async ({ query }) => {
      let worktreeList =
        worktreesRef.current.length > 0 ? worktreesRef.current : worktreesWithStatus;

      // If worktrees aren't ready yet, wait briefly before failing
      if (worktreeList.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
        worktreeList =
          worktreesRef.current.length > 0 ? worktreesRef.current : worktreesWithStatus;
      }

      if (worktreeList.length === 0) {
        events.emit('ui:notify', {
          type: 'error',
          message: 'No worktrees available',
        });
        return;
      }

      const q = query.toLowerCase();

      // Try exact match on branch first
      let match = worktreeList.find(wt => wt.branch?.toLowerCase() === q);

      // Then try exact match on name
      if (!match) {
        match = worktreeList.find(wt => wt.name.toLowerCase() === q);
      }

      // Finally try substring match on path
      if (!match) {
        match = worktreeList.find(wt => wt.path.toLowerCase().includes(q));
      }

      if (match) {
        await handleSwitchWorktree(match);
      } else {
        events.emit('ui:notify', {
          type: 'error',
          message: `No worktree matching "${query}"`,
        });
      }
    });
  }, [handleSwitchWorktree, worktreesWithStatus]);

  const handleToggleGitStatus = () => {
    setShowGitMarkers(!showGitMarkers);
    events.emit('ui:notify', {
      type: 'info',
      message: showGitMarkers ? 'Git markers hidden' : 'Git markers shown',
    });
  };

  const handleQuit = async () => {
    events.emit('sys:quit');

    // Save session state before exiting
    if (activeWorktreeId) {
      await saveSessionState(activeWorktreeId, {
        lastCopyProfile,
        timestamp: Date.now(),
      }).catch((err) => {
        console.error('Error saving session state on quit:', err);
      });
    }

    // Stop all running dev servers gracefully
    await devServerManager.stopAll().catch((err) => {
      console.error('Error stopping dev servers on quit:', err);
    });

    // PERF: Removed clearGitStatus() - WorktreeService cleans up on stopAll()
    clearTerminalScreen();
    exit();
  };

  const handleOpenCopyTreeBuilder = () => {
    events.emit('ui:notify', {
      type: 'info',
      message: 'CopyTree builder coming in Phase 2',
    });
  };

  const anyModalOpen = activeModals.size > 0;

  // Build devScriptMap for keyboard shortcut guard (async to avoid blocking UI)
  const [devScriptMap, setDevScriptMap] = useState<Map<string, boolean>>(new Map());
  const devServerEnabled = config.devServer?.enabled ?? true;
  const devServerCommand = config.devServer?.command;

  // Memoize devServerConfig to prevent unnecessary re-renders
  const devServerConfig = useMemo(() => ({
    enabled: devServerEnabled,
    command: devServerCommand,
  }), [devServerEnabled, devServerCommand]);

  useEffect(() => {
    // If dev server feature is disabled, return empty map
    if (!devServerEnabled) {
      setDevScriptMap(new Map());
      return;
    }

    let cancelled = false;

    const loadDevScripts = async () => {
      // Pre-warm the cache for all worktrees in parallel
      const paths = sortedWorktrees.map(wt => wt.path);
      await devServerManager.warmCache(paths);

      if (cancelled) return;

      // Build the map from the warmed cache
      const map = new Map<string, boolean>();
      for (const wt of sortedWorktrees) {
        map.set(wt.id, devServerManager.hasDevScript(wt.path));
      }
      setDevScriptMap(map);
    };

    void loadDevScripts();

    return () => {
      cancelled = true;
    };
  }, [sortedWorktrees, devServerEnabled]);

  const { visibleStart, visibleEnd } = useDashboardNav({
    worktrees: sortedWorktrees,
    focusedWorktreeId,
    expandedWorktreeIds,
    isModalOpen: anyModalOpen,
    viewportSize: dashboardViewportSize,
    onFocusChange: setFocusedWorktreeId,
    onToggleExpand: handleToggleExpandWorktree,
    onCopyTree: handleCopyTreeForWorktree,
    onOpenEditor: handleOpenWorktreeEditor,
    onToggleServer: handleToggleServerForWorktree,
    devScriptMap,
  });

  useInput(
    (input, key) => {
      // All shortcuts in this block only work when no modal is open
      if (anyModalOpen) {
        return;
      }

      // Handle slash to open command palette (when quick links enabled)
      if (input === '/' && quickLinksEnabled) {
        handleOpenCommandPalette();
        return;
      }

      // Handle 1-9 for quick link shortcuts (first-class shortcuts)
      if (quickLinksEnabled) {
        const parsed = parseInt(input, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 9) {
          void openByShortcut(parsed);
          return;
        }
      }

      if (input === 'f') {
        handleOpenGitFox();
      }
    },
    { isActive: true }
  );

  useKeyboard({
    onClearFilter: handleClearFilter,

    onNextWorktree: anyModalOpen ? undefined : handleNextWorktree,
    onOpenWorktreePanel: undefined,

    onToggleGitStatus: anyModalOpen ? undefined : handleToggleGitStatus,

    onOpenCopyTreeBuilder: anyModalOpen ? undefined : handleOpenCopyTreeBuilder,

    onRefresh: anyModalOpen ? undefined : () => {
      events.emit('sys:refresh');
    },
    onQuit: handleQuit,
    onForceExit: handleQuit,
    onWarnExit: () => {
      events.emit('ui:notify', {
        type: 'warning',
        message: 'Press Ctrl+C again to quit',
      });
    },
  }, config);

  if (lifecycleStatus === 'initializing') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Loading Canopy...</Text>
        <Text dimColor>Initializing configuration and file tree for {cwd}</Text>
      </Box>
    );
  }

  if (lifecycleStatus === 'error') {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="red">
        <Text bold color="red">Initialization Error</Text>
        <Text> </Text>
        <Text>Failed to initialize Canopy:</Text>
        <Text italic color="yellow">{lifecycleError?.message || 'Unknown error'}</Text>
        <Text> </Text>
        <Text dimColor>Press Ctrl+C to exit</Text>
      </Box>
    );
  }

  return (
    <ThemeProvider mode={themeMode} projectAccent={projectAccent}>
      {/* Remove fixed height to allow natural top-to-bottom rendering without forced blank space */}
      <Box flexDirection="column">
        <Header
          cwd={cwd}
          filterActive={filterActive}
          filterQuery={filterQuery}
          identity={projectIdentity}
          onOpenGitFox={handleOpenGitFox}
          commandPaletteOpen={isCommandPaletteOpen}
          aiStatus={aggregatedAIStatus}
          terminalWidth={terminalWidth}
        />
        {/* Command palette renders as full-width overlay under header */}
        <CommandPalette
          visible={isCommandPaletteOpen}
          commands={quickLinkCommands}
          onExecute={handleCommandPaletteExecute}
          onClose={() => events.emit('ui:modal:close', { id: 'command-palette' })}
          terminalWidth={terminalWidth}
        />
        <Box flexGrow={1} marginTop={isCommandPaletteOpen ? 0 : 1}>
          <WorktreeOverview
            worktrees={sortedWorktrees}
            worktreeChanges={worktreeChanges}
            activeWorktreeId={activeWorktreeId}
            activeRootPath={activeRootPath}
            focusedWorktreeId={focusedWorktreeId}
            expandedWorktreeIds={expandedWorktreeIds}
            visibleStart={visibleStart}
            visibleEnd={visibleEnd}
            onToggleExpand={handleToggleExpandWorktree}
            onCopyTree={handleCopyTreeForWorktree}
            onOpenEditor={handleOpenWorktreeEditor}
            onOpenExplorer={handleOpenWorktreeExplorer}
            devServerConfig={devServerConfig}
          />
        </Box>
        {isWorktreePanelOpen && (
          <WorktreePanel
            worktrees={worktreesWithStatus}
            activeWorktreeId={activeWorktreeId}
            onClose={() => events.emit('ui:modal:close', { id: 'worktree' })}
          />
        )}
        {notifications.length > 0 && (
          <Box flexDirection="column" width="100%">
            {notifications.map((notification, index) => (
              <Notification
                key={notification.id}
                notification={notification}
                onDismiss={handleDismissNotification}
                isActive={index === notifications.length - 1}
              />
            ))}
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
};

const App: React.FC<AppProps> = (props) => {
  return (
    <AppErrorBoundary>
      <AppContent {...props} />
    </AppErrorBoundary>
  );
};

export default App;
