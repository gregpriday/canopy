import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'; // Added useCallback
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { Header } from './components/Header.js';
import { WorktreeOverview, sortWorktrees } from './components/WorktreeOverview.js';
import { getExplorerLabel } from './components/WorktreeCard.js';
import { TreeView } from './components/TreeView.js';
import { ContextMenu } from './components/ContextMenu.js';
import { WorktreePanel } from './components/WorktreePanel.js';
import { ProfileSelector } from './components/ProfileSelector.js';
import { HelpModal } from './components/HelpModal.js';
import { FuzzySearchModal } from './components/FuzzySearchModal.js';
import { CommandPalette } from './components/CommandPalette.js';
import { Notification } from './components/Notification.js';
import { AppErrorBoundary } from './components/AppErrorBoundary.js';
import type { CanopyConfig, Notification as NotificationType, NotificationPayload, Worktree, TreeNode, GitStatus, SystemServices, WorktreeChanges } from './types/index.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useFileTree } from './hooks/useFileTree.js';
import { useDashboardNav } from './hooks/useDashboardNav.js';
import { useQuickLinks } from './hooks/useQuickLinks.js';
import { useAppLifecycle } from './hooks/useAppLifecycle.js';
import { useViewportHeight } from './hooks/useViewportHeight.js';
import { openFile, openWorktreeInEditor } from './utils/fileOpener.js';
import { countTotalFiles } from './utils/fileTree.js';
import { copyFilePath } from './utils/clipboard.js';
import { execa } from 'execa';
import { openGitHubRepo } from './utils/github.js';
// PERF: Removed useWatcher - WorktreeMonitor handles file watching for all worktrees
import path from 'path';
import { useGitStatus } from './hooks/useGitStatus.js';
import { useProjectIdentity } from './hooks/useProjectIdentity.js';
import { useCopyTree } from './hooks/useCopyTree.js';
import { useRecentActivity } from './hooks/useRecentActivity.js';
import { RecentActivityPanel } from './components/RecentActivityPanel.js';
import { useActivity } from './hooks/useActivity.js';
import { worktreeService } from './services/monitor/index.js';
import { useWorktreeMonitor, worktreeStatesToArray } from './hooks/useWorktreeMonitor.js';
import { saveSessionState, loadSessionState } from './utils/state.js';
import { events, type ModalId, type ModalContextMap } from './services/events.js'; // Import event bus
import { clearTerminalScreen } from './utils/terminal.js';
import { logWarn } from './utils/logger.js';
import { ThemeProvider } from './theme/ThemeProvider.js';
import { detectTerminalTheme } from './theme/colorPalette.js';
import open from 'open';
import clipboardy from 'clipboardy';

interface AppProps {
  cwd: string;
  config?: CanopyConfig;
  noWatch?: boolean;
  noGit?: boolean;
  initialFilter?: string;
}

const MODAL_CLOSE_PRIORITY: ModalId[] = [
  'help',
  'context-menu',
  'command-palette',
  'worktree',
  'profile-selector',
  'recent-activity',
];

const AppContent: React.FC<AppProps> = ({ cwd, config: initialConfig, noWatch, noGit, initialFilter }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  // Use terminal height - 1 for calculations to prevent scroll jitter on the last line.
  // Many terminal emulators reserve the last line for scroll behavior.
  const [height, setHeight] = useState((stdout?.rows || 24) - 1);

  useEffect(() => {
    if (!stdout) return;

    const handleResize = () => {
      setHeight(stdout.rows - 1);
    };

    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  // Centralized lifecycle management
  const {
    status: lifecycleStatus,
    config,
    worktrees,
    activeWorktreeId: initialActiveWorktreeId,
    activeRootPath: initialActiveRootPath,
    initialSelectedPath,
    initialExpandedFolders,
    initialGitOnlyMode,
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

  // Listen for view mode changes
  useEffect(() => {
    return events.on('ui:view:mode', ({ mode }) => {
      setViewMode(mode);
    });
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
  const [fuzzySearchQuery, setFuzzySearchQuery] = useState('');

  // Context menu state
  const [contextMenuTarget, setContextMenuTarget] = useState<string>('');
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Active worktree state (can change via user actions)
  const [activeWorktreeId, setActiveWorktreeId] = useState<string | null>(initialActiveWorktreeId);
  const [activeRootPath, setActiveRootPath] = useState<string>(initialActiveRootPath);
  const [focusedWorktreeId, setFocusedWorktreeId] = useState<string | null>(initialActiveWorktreeId);
  const [expandedWorktreeIds, setExpandedWorktreeIds] = useState<Set<string>>(new Set());
  const selectedPathRef = useRef<string | null>(null);
  const [lastCopyProfile, setLastCopyProfile] = useState<string>(initialCopyProfile || 'default');

  useEffect(() => {
    setLastCopyProfile(initialCopyProfile || 'default');
  }, [initialCopyProfile]);

  // Use the new WorktreeMonitor system
  const worktreeStates = useWorktreeMonitor();
  const enrichedWorktrees = worktreeStatesToArray(worktreeStates);

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

  // Mutable initial selection state for session restoration during worktree switches
  const [initialSelection, setInitialSelection] = useState<{
    selectedPath: string | null;
    expandedFolders: Set<string>;
  }>({
    selectedPath: initialSelectedPath,
    expandedFolders: initialExpandedFolders,
  });

  // View mode state - dashboard is default
  const [viewMode, setViewMode] = useState<'dashboard' | 'tree'>('dashboard');

  // Git-only view mode state
  const [gitOnlyMode, setGitOnlyMode] = useState<boolean>(initialGitOnlyMode);
  // Cache the expansion state before entering git-only mode for restoration on exit
  const previousExpandedFoldersRef = useRef<Set<string> | null>(null);

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
      const pathToCopy = payload.path || selectedPathRef.current;
      if (!pathToCopy) return;

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

  const { gitStatus, gitEnabled, refresh: refreshGitStatus, clear: clearGitStatus, isLoading: isGitLoading } = useGitStatus(
    activeRootPath,
    noGit ? false : config.showGitStatus,
    config.refreshDebounce,
  );

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

  const effectiveGitStatus = useMemo(() => {
    if (activeWorktreeChanges?.changes) {
      return new Map(activeWorktreeChanges.changes.map(change => [change.path, change.status] as const));
    }
    return gitStatus;
  }, [activeWorktreeChanges, gitStatus]);

  const isWorktreePanelOpen = activeModals.has('worktree');
  const showHelpModal = activeModals.has('help');
  const contextMenuOpen = activeModals.has('context-menu');
  const isRecentActivityOpen = activeModals.has('recent-activity');
  const isProfileSelectorOpen = activeModals.has('profile-selector');
  const isFuzzySearchOpen = activeModals.has('fuzzy-search');
  const isCommandPaletteOpen = activeModals.has('command-palette');

  // Quick links hook for slash commands and keyboard shortcuts
  const { commands: quickLinkCommands, openByShortcut, enabled: quickLinksEnabled } = useQuickLinks(config.quickLinks);

  const headerRows = 3;
  const overlayRows = (notifications.length > 0 ? notifications.length * 2 : 0);
  // Reserve header + overlays + 1 extra row for the safety margin
  const reservedRows = headerRows + overlayRows + 1;
  const viewportHeight = useViewportHeight(reservedRows);
  const dashboardViewportSize = useMemo(() => {
    const available = Math.max(1, height - reservedRows);
    return Math.max(3, Math.floor(available / 5));
  }, [height, reservedRows]);

  // Reset fuzzy search query when modal closes
  useEffect(() => {
    if (!isFuzzySearchOpen) {
      setFuzzySearchQuery('');
    }
  }, [isFuzzySearchOpen]);

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
        !noWatch
      );
    }
  }, [worktrees, activeWorktreeId, lifecycleStatus, noWatch]);

  // Teardown Effect: Clean up all monitors only on unmount
  // This runs once when the component unmounts, not on every dependency change
  useEffect(() => {
    return () => {
      void worktreeService.stopAll();
    };
  }, []);

  // UseViewportHeight must be declared before useFileTree
  // Reserve a fixed layout height to avoid viewport thrashing when footer content changes
  // Listen for sys:refresh events
  useEffect(() => {
    return events.on('sys:refresh', () => {
      // Optimization: Only refresh the UI-critical status here.
      // The background WorktreeService has its own polling loop and will
      // pick up changes on its next tick (or via its own watcher).
      refreshGitStatus();

      // REMOVED: void worktreeService.refresh();
      // We don't need to force-refresh ALL worktrees every time a file changes
      // in the current one. The active monitor will handle it.

      // useFileTree is already subscribed to sys:refresh internally, so no direct call to refreshTree needed here.
    });
  }, [refreshGitStatus]); // Dependency on refreshGitStatus to ensure latest function is called

  // Initialize Activity Hook for temporal styling
  const { activeFiles } = useActivity();

  const projectIdentity = useProjectIdentity(activeRootPath);

  // Initialize Recent Activity Hook
  const {
    recentEvents,
    lastEvent,
    clearEvents
  } = useRecentActivity(activeRootPath, config.recentActivity || { enabled: false, windowMinutes: 10, maxEntries: 50 });

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

  // Derive tree root path based on view mode
  // In tree mode, use focused worktree path; in dashboard mode, use active worktree path
  const treeRootPath = useMemo(() => {
    if (viewMode === 'tree' && focusedWorktreeId) {
      const focusedWorktree = worktreesWithStatus.find(wt => wt.id === focusedWorktreeId);
      return focusedWorktree?.path || activeRootPath;
    }
    return activeRootPath;
  }, [viewMode, focusedWorktreeId, worktreesWithStatus, activeRootPath]);

  // Update active worktree when tree mode switches to a different focused worktree
  useEffect(() => {
    if (viewMode === 'tree' && focusedWorktreeId && focusedWorktreeId !== activeWorktreeId) {
      const focusedWorktree = worktreesWithStatus.find(wt => wt.id === focusedWorktreeId);
      if (focusedWorktree) {
        setActiveWorktreeId(focusedWorktree.id);
        setActiveRootPath(focusedWorktree.path);
      }
    }
  }, [viewMode, focusedWorktreeId, activeWorktreeId, worktreesWithStatus]);

  // Centralized CopyTree listener
  useCopyTree(activeRootPath, effectiveConfig);

  // PERF: Removed useWatcher call - WorktreeMonitor already watches all worktrees.
  // This eliminates the "double watch" issue where both useWatcher and WorktreeMonitor
  // were watching the active worktree simultaneously, doubling CPU usage.

  // Calculate git status filter based on git-only mode
  const gitStatusFilter = gitOnlyMode
    ? (['modified', 'added', 'deleted', 'untracked'] as GitStatus[])
    : null;

  const { tree: fileTree, rawTree, expandedFolders, selectedPath } = useFileTree({
    rootPath: treeRootPath,
    config: effectiveConfig,
    filterQuery: filterActive ? filterQuery : null,
    gitStatusMap: effectiveGitStatus,
    gitStatusFilter,
    initialSelectedPath: initialSelection.selectedPath,
    initialExpandedFolders: initialSelection.expandedFolders,
    viewportHeight,
    navigationEnabled: viewMode === 'tree',
  });

  useEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);

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

  const handleOpenProfileSelector = useCallback((id: string) => {
    const target = sortedWorktrees.find(wt => wt.id === id);
    if (!target) {
      return;
    }
    setActiveModals((prev) => {
      const next = new Set(prev);
      next.add('profile-selector');
      return next;
    });
    setModalContext((prev) => ({
      ...prev,
      'profile-selector': { worktreeId: target.id },
    }));
    events.emit('ui:modal:open', { id: 'profile-selector', context: { worktreeId: target.id } });
  }, [sortedWorktrees]);

  const handleProfileSelect = useCallback((profileName: string) => {
    setLastCopyProfile(profileName);
    events.emit('ui:notify', { type: 'info', message: `Active profile: ${profileName}` });
    events.emit('ui:modal:close', { id: 'profile-selector' });
  }, []);

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
      if (id === 'context-menu') {
        const targetPath = (context as { path?: string } | undefined)?.path || selectedPathRef.current || '';
        if (targetPath) {
          setContextMenuTarget(targetPath);
          setContextMenuPosition({ x: 0, y: 0 });
        }
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
      if (!id || id === 'context-menu') {
        setContextMenuTarget('');
      }
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
        const expandedSnapshot = expandedFolders ? Array.from(expandedFolders) : [];
        void saveSessionState(activeWorktreeId, {
          selectedPath,
          expandedFolders: expandedSnapshot,
          gitOnlyMode,
          lastCopyProfile,
          timestamp: Date.now(),
        }).catch((err) => {
          console.error('Error saving session state:', err);
        });
      }
    };
  }, [activeWorktreeId, expandedFolders, gitOnlyMode, lastCopyProfile, selectedPath]);

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

  // Helper function to collect all folder paths from a tree
  const collectAllFolderPaths = useCallback((tree: TreeNode[]): string[] => {
    const paths: string[] = [];
    function traverse(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.type === 'directory') {
          paths.push(node.path);
          if (node.children) {
            traverse(node.children);
          }
        }
      }
    }
    traverse(tree);
    return paths;
  }, []);

  // Handle git-only mode toggle
  const handleToggleGitOnlyMode = useCallback(() => {
    if (!gitOnlyMode) {
      // Entering git-only mode

      // Safety check: if we have a large changeset (>100 files), don't auto-expand
      const changedFilesCount = fileTree.length > 0 ? countTotalFiles(fileTree) : 0;

      if (changedFilesCount > 100) {
        // Large changeset - skip auto-expansion for performance
        setGitOnlyMode(true);
        events.emit('ui:notify', {
          type: 'warning',
          message: 'Large changeset detected. Folders collapsed for performance.',
        });
      } else {
        // Cache current expansion state
        previousExpandedFoldersRef.current = new Set(expandedFolders);

        // Auto-expand all folders in the current tree
        const allFolderPaths = collectAllFolderPaths(fileTree);

        // Update expanded folders via event system
        allFolderPaths.forEach(folderPath => {
          events.emit('nav:expand', { path: folderPath });
        });

        setGitOnlyMode(true);
        events.emit('ui:notify', {
          type: 'info',
          message: 'Git-only view enabled',
        });
      }
    } else {
      // Exiting git-only mode - restore previous expansion state
      if (previousExpandedFoldersRef.current) {
        // First collapse all folders
        Array.from(expandedFolders ?? []).forEach(folderPath => {
          events.emit('nav:collapse', { path: folderPath });
        });

        // Then restore the cached expansion state
        Array.from(previousExpandedFoldersRef.current).forEach(folderPath => {
          events.emit('nav:expand', { path: folderPath });
        });

        previousExpandedFoldersRef.current = null;
      }

      setGitOnlyMode(false);
      events.emit('ui:notify', {
        type: 'info',
        message: 'All files view enabled',
      });
    }
  }, [gitOnlyMode, fileTree, expandedFolders, collectAllFolderPaths]);

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
    } else {
      // No modals open and no filter active - clear selection
      events.emit('nav:clear-selection');
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
            selectedPath,
            expandedFolders: Array.from(expandedFolders ?? []),
            gitOnlyMode,
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

      const nextSelectedPath = session?.selectedPath ?? null;
      const nextExpandedFolders = new Set(session?.expandedFolders ?? []);
      const nextGitOnlyMode = session?.gitOnlyMode ?? false;
      const nextCopyProfile = session?.lastCopyProfile ?? 'default';

      // 4. Update all state atomically
      setActiveWorktreeId(targetWorktree.id);
      setActiveRootPath(targetWorktree.path);
      setInitialSelection({
        selectedPath: nextSelectedPath,
        expandedFolders: nextExpandedFolders,
      });
      setGitOnlyMode(nextGitOnlyMode);
      setLastCopyProfile(nextCopyProfile);

      // 5. Reset transient UI state
      setFilterActive(false);
      setFilterQuery('');
      clearGitStatus();
      // Note: WorktreeService handles its own state refresh
      clearEvents(); // Clear activity buffer for new worktree

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
  }, [activeWorktreeId, clearEvents, clearGitStatus, expandedFolders, formatWorktreeSwitchMessage, gitOnlyMode, lastCopyProfile, selectedPath]);

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

  // Handle navigation from Recent Activity Panel to tree
  const handleSelectActivityPath = useCallback((targetPath: string) => {
    // Close the modal
    events.emit('ui:modal:close', { id: 'recent-activity' });

    // Convert relative path to absolute
    const absolutePath = path.join(activeRootPath, targetPath);

    // Emit navigation event (existing nav:select handler will expand parents and set selection)
    events.emit('nav:select', { path: absolutePath });
  }, [activeRootPath]);

  // Handle fuzzy search result selection
  const handleFuzzySearchResult = useCallback(async (relativePath: string, action: 'copy' | 'open') => {
    // Close the modal
    events.emit('ui:modal:close', { id: 'fuzzy-search' });

    // Convert relative path to absolute based on the focused or active worktree
    const targetWorktree = focusedWorktreeId
      ? worktreesWithStatus.find(wt => wt.id === focusedWorktreeId)
      : currentWorktree;

    if (!targetWorktree) {
      events.emit('ui:notify', {
        type: 'error',
        message: 'No worktree selected'
      });
      return;
    }

    const absolutePath = path.join(targetWorktree.path, relativePath);

    try {
      if (action === 'copy') {
        // Copy path to clipboard (copy as relative path)
        await copyFilePath(absolutePath, targetWorktree.path, true);
        events.emit('ui:notify', {
          type: 'success',
          message: `Copied: ${relativePath}`,
        });
      } else {
        // Open file
        await openFile(absolutePath, config);
        events.emit('ui:notify', {
          type: 'success',
          message: `Opened: ${relativePath}`,
        });
      }
    } catch (error) {
      events.emit('ui:notify', {
        type: 'error',
        message: `Failed to ${action} file: ${(error as Error).message}`,
      });
    }
  }, [activeRootPath, config, currentWorktree, focusedWorktreeId, worktreesWithStatus]);

  // handleOpenSelectedFile removed

  // handleCopySelectedPath removed


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
        selectedPath,
        expandedFolders: Array.from(expandedFolders ?? []),
        gitOnlyMode,
        lastCopyProfile,
        timestamp: Date.now(),
      }).catch((err) => {
        console.error('Error saving session state on quit:', err);
      });
    }

    clearGitStatus();
    clearTerminalScreen();
    exit();
  };

  const handleOpenCopyTreeBuilder = () => {
    events.emit('ui:notify', {
      type: 'info',
      message: 'CopyTree builder coming in Phase 2',
    });
  };

  const handleOpenFilter = () => {
    events.emit('ui:modal:open', { id: 'fuzzy-search', context: { initialQuery: '' } });
  };

  const handleOpenProfileSelectorForFocused = useCallback(() => {
    const targetId =
      focusedWorktreeId ||
      activeWorktreeId ||
      sortedWorktrees[0]?.id;
    if (!targetId) {
      return;
    }
    handleOpenProfileSelector(targetId);
  }, [activeWorktreeId, focusedWorktreeId, handleOpenProfileSelector, sortedWorktrees]);

  const anyModalOpen = activeModals.size > 0;

  const { visibleStart, visibleEnd } = useDashboardNav({
    worktrees: sortedWorktrees,
    focusedWorktreeId,
    expandedWorktreeIds,
    isModalOpen: anyModalOpen || viewMode !== 'dashboard', // Disable dashboard nav when not in dashboard mode
    viewportSize: dashboardViewportSize,
    onFocusChange: setFocusedWorktreeId,
    onToggleExpand: handleToggleExpandWorktree,
    onCopyTree: handleCopyTreeForWorktree,
    onOpenEditor: handleOpenWorktreeEditor,
    onOpenProfileSelector: handleOpenProfileSelector,
  });

  useInput(
    (input, key) => {
      // Handle slash to open command palette (when no modal is open and quick links enabled)
      if (input === '/' && !anyModalOpen && quickLinksEnabled) {
        handleOpenCommandPalette();
        return;
      }

      // Handle Cmd+1-9 / Option+1-9 for quick link shortcuts
      // Works when no modal is open OR when only the command palette is open
      const onlyCommandPaletteOpen = isCommandPaletteOpen && activeModals.size === 1;

      // macOS Option+Number mapping (US Layout)
      // Option+1 = ¡, Option+2 = ™, etc.
      const MACOS_OPTION_MAP: Record<string, number> = {
        '¡': 1, '™': 2, '£': 3, '¢': 4, '∞': 5, '§': 6, '¶': 7, '•': 8, 'ª': 9
      };

      // Escape sequence mapping (when terminal sends \x1b1 for Cmd+1)
      // These appear as escape key + number, so input will be the number after escape
      const ESC_SEQ_MAP: Record<string, number> = {
        '\x1b1': 1, '\x1b2': 2, '\x1b3': 3, '\x1b4': 4, '\x1b5': 5,
        '\x1b6': 6, '\x1b7': 7, '\x1b8': 8, '\x1b9': 9
      };

      if ((!anyModalOpen || onlyCommandPaletteOpen) && quickLinksEnabled) {
        let shortcutNum = -1;

        // Case 1: Terminal sends Meta + Number directly
        if (key.meta) {
          const parsed = parseInt(input, 10);
          if (!isNaN(parsed)) shortcutNum = parsed;
        }

        // Case 2: Terminal sends macOS Option key symbol (e.g. ¡ for Option+1)
        if (shortcutNum === -1 && MACOS_OPTION_MAP[input]) {
          shortcutNum = MACOS_OPTION_MAP[input];
        }

        // Case 3: Terminal sends escape sequence (e.g. \x1b1 for configured Cmd+1)
        if (shortcutNum === -1 && ESC_SEQ_MAP[input]) {
          shortcutNum = ESC_SEQ_MAP[input];
        }

        // Case 4: Escape key was pressed, next char is a number (Ghostty sends this way)
        if (shortcutNum === -1 && key.escape) {
          const parsed = parseInt(input, 10);
          if (!isNaN(parsed) && parsed >= 1 && parsed <= 9) {
            shortcutNum = parsed;
          }
        }

        if (shortcutNum >= 1 && shortcutNum <= 9) {
          // Close command palette if open before opening the link
          if (isCommandPaletteOpen) {
            events.emit('ui:modal:close', { id: 'command-palette' });
          }
          void openByShortcut(shortcutNum);
          return;
        }
      }

      if (viewMode !== 'dashboard' || anyModalOpen) {
        return;
      }
      if (input === 'p') {
        handleOpenProfileSelectorForFocused();
      }
      if (input === 'f') {
        handleOpenGitFox();
      }
    },
    { isActive: true }
  );

  useKeyboard({
    navigationEnabled: viewMode === 'tree',

    onOpenFilter: anyModalOpen ? undefined : handleOpenFilter,
    // Don't clear filter when fuzzy search is open (let it handle Escape itself)
    onClearFilter: isFuzzySearchOpen ? undefined : handleClearFilter,

    onNextWorktree: anyModalOpen ? undefined : handleNextWorktree,
    onOpenWorktreePanel: undefined,
    onOpenProfileSelector: anyModalOpen ? undefined : handleOpenProfileSelectorForFocused,

    onToggleGitStatus: anyModalOpen ? undefined : handleToggleGitStatus,
    onToggleGitOnlyMode: anyModalOpen ? undefined : handleToggleGitOnlyMode,

    onOpenCopyTreeBuilder: anyModalOpen ? undefined : handleOpenCopyTreeBuilder,

    onRefresh: anyModalOpen ? undefined : () => {
      events.emit('sys:refresh');
    },
    onOpenHelp: undefined,
    onOpenContextMenu: anyModalOpen
      ? undefined
      : () => {
          const focusedWorktree = sortedWorktrees.find(wt => wt.id === focusedWorktreeId);
          const path = selectedPathRef.current || focusedWorktree?.path;
          if (!path) return;

          events.emit('ui:modal:open', { id: 'context-menu', context: { path } });
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
          currentWorktree={currentWorktree}
          worktreeCount={worktreesWithStatus.length}
          activeWorktreeCount={activeWorktreeCount}
          onWorktreeClick={() => events.emit('ui:modal:open', { id: 'worktree' })}
          identity={projectIdentity}
          config={effectiveConfig}
          isSwitching={isSwitchingWorktree}
          gitOnlyMode={gitOnlyMode}
          onToggleGitOnlyMode={handleToggleGitOnlyMode}
          gitEnabled={gitEnabled}
          gitStatus={effectiveGitStatus}
          onOpenGitFox={handleOpenGitFox}
          onOpenGitHub={handleOpenGitHub}
          commandPaletteOpen={isCommandPaletteOpen}
        />
        {/* Command palette renders as full-width overlay under header */}
        <CommandPalette
          visible={isCommandPaletteOpen}
          commands={quickLinkCommands}
          onExecute={handleCommandPaletteExecute}
          onClose={() => events.emit('ui:modal:close', { id: 'command-palette' })}
        />
        <Box flexGrow={1} marginTop={isCommandPaletteOpen ? 0 : 1}>
          {isProfileSelectorOpen ? (
            <Box flexDirection="row" justifyContent="center">
              <ProfileSelector
                profiles={config.copytreeProfiles || {}}
                currentProfile={lastCopyProfile}
                onSelect={handleProfileSelect}
                onClose={() => events.emit('ui:modal:close', { id: 'profile-selector' })}
              />
            </Box>
          ) : viewMode === 'dashboard' ? (
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
            />
          ) : (
            <TreeView
              fileTree={fileTree}
              selectedPath={selectedPath}
              config={effectiveConfig}
              expandedPaths={expandedFolders}
              viewportHeight={viewportHeight}
              activeFiles={activeFiles}
            />
          )}
        </Box>
        {contextMenuOpen && (() => {
          // Create SystemServices object for context menu
          const contextMenuServices: SystemServices = {
            ui: {
              notify: (n: NotificationPayload) => events.emit('ui:notify', n),
              refresh: refreshTree,
              exit: exitApp,
            },
            system: {
              cwd: activeRootPath,
              openExternal: async (path) => { await open(path); },
              copyToClipboard: async (text) => { await clipboardy.write(text); },
              exec: async (cmd, cmdArgs, execCwd) => {
                const { stdout } = await execa(cmd, cmdArgs || [], { cwd: execCwd || activeRootPath });
                return stdout;
              }
            },
            state: {
              selectedPath,
              fileTree: rawTree,
              expandedPaths: expandedFolders
            }
          };

          return (
            <ContextMenu
              path={contextMenuTarget}
              position={contextMenuPosition}
              config={config}
              services={contextMenuServices}
              onClose={() => events.emit('ui:modal:close', { id: 'context-menu' })}
              onAction={(actionType, result) => {
                if (result.success) {
                  events.emit('ui:notify', {
                    type: 'success',
                    message: result.message || 'Action completed',
                  });
                } else {
                  events.emit('ui:notify', {
                    type: 'error',
                    message: `Action failed: ${result.message || 'Unknown error'}`,
                  });
                }
                events.emit('ui:modal:close', { id: 'context-menu' });
              }}
            />
          );
        })()}
        {isWorktreePanelOpen && (
          <WorktreePanel
            worktrees={worktreesWithStatus}
            activeWorktreeId={activeWorktreeId}
            onClose={() => events.emit('ui:modal:close', { id: 'worktree' })}
          />
        )}
        {isRecentActivityOpen && (
          <RecentActivityPanel
            visible={isRecentActivityOpen}
            events={recentEvents}
            onClose={() => events.emit('ui:modal:close', { id: 'recent-activity' })}
            onSelectPath={handleSelectActivityPath}
          />
        )}
        <HelpModal
          visible={showHelpModal}
          onClose={() => events.emit('ui:modal:close', { id: 'help' })}
        />
        <FuzzySearchModal
          visible={isFuzzySearchOpen}
          searchQuery={fuzzySearchQuery}
          worktrees={worktreesWithStatus}
          focusedWorktreeId={focusedWorktreeId}
          config={config}
          onSelectResult={handleFuzzySearchResult}
          onClose={() => events.emit('ui:modal:close', { id: 'fuzzy-search' })}
          onQueryChange={setFuzzySearchQuery}
        />
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
