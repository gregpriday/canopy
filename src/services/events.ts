import { EventEmitter } from 'events';
import type { NotificationType } from '../types/index.js';

export type ModalId = 'help' | 'worktree' | 'context-menu' | 'command-bar';
export interface ModalContextMap {
  help: undefined;
  worktree: undefined;
  'context-menu': { path: string; position?: { x: number; y: number } };
  'command-bar': { initialInput?: string };
}

// 1. Define Payload Types
export interface CopyTreePayload {
  rootPath?: string;
}

export interface CopyPathPayload {
  path: string;
}

export interface NotifyPayload {
  type: NotificationType;
  message: string;
}

// Navigation Payloads
export interface NavSelectPayload {
  path: string;
}
export interface NavExpandPayload {
  path: string;
}
export interface NavCollapsePayload {
  path: string;
}
export interface NavMovePayload {
  direction: 'up' | 'down' | 'left' | 'right' | 'pageUp' | 'pageDown' | 'home' | 'end';
  amount?: number; // For pageUp/pageDown
}
export interface NavToggleExpandPayload {
  path: string;
}

export type UIModalOpenPayload = {
  [Id in ModalId]: { id: Id; context?: ModalContextMap[Id] };
}[ModalId];

export interface UIModalClosePayload {
  id?: ModalId; // If omitted, close all
}

export interface WatcherChangePayload {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string; // Absolute path
}

// Worktree Payloads
export interface WorktreeCyclePayload {
  direction: number; // +1 for next, -1 for prev
}

export interface WorktreeSelectByNamePayload {
  query: string; // Pattern to match against branch/name/path
}


// 2. Define Event Map
export type CanopyEventMap = {
  'sys:ready': { cwd: string };
  'sys:refresh': void;
  'sys:quit': void;
  'sys:config:reload': void;

  'nav:select': NavSelectPayload;
  'nav:expand': NavExpandPayload;
  'nav:collapse': NavCollapsePayload;
  'nav:move': NavMovePayload;
  'nav:toggle-expand': NavToggleExpandPayload; // Added
  'nav:clear-selection': void;
  'nav:primary': void;

  'file:open': { path: string };
  'file:copy-tree': CopyTreePayload;
  'file:copy-path': CopyPathPayload;

  'ui:notify': NotifyPayload;
  'ui:command:open': { initialInput?: string };
  'ui:command:submit': { input: string };
  'ui:filter:set': { query: string };
  'ui:filter:clear': void;
  'ui:modal:open': UIModalOpenPayload;
  'ui:modal:close': UIModalClosePayload;

  'sys:worktree:switch': { worktreeId: string };
  'sys:worktree:refresh': void;
  'sys:worktree:cycle': WorktreeCyclePayload;
  'sys:worktree:selectByName': WorktreeSelectByNamePayload;

  'watcher:change': WatcherChangePayload;
};

// 3. Create Bus
class TypedEventBus {
  private bus = new EventEmitter();

  private debugEnabled = process.env.CANOPY_DEBUG_EVENTS === '1';

  // Subscribe
  on<K extends keyof CanopyEventMap>(
    event: K,
    listener: CanopyEventMap[K] extends void
      ? () => void
      : (payload: CanopyEventMap[K]) => void
  ) {
    this.bus.on(event, listener as (...args: any[]) => void); // Type assertion for EventEmitter
    // Return un-subscriber for easy useEffect cleanup
    return () => {
      this.bus.off(event, listener as (...args: any[]) => void);
    };
  }

  // Publish
  emit<K extends keyof CanopyEventMap>(
    event: K,
    ...args: CanopyEventMap[K] extends void ? [] : [CanopyEventMap[K]]
  ) {
    if (this.debugEnabled) {
      // eslint-disable-next-line no-console
      console.log('[events]', event, args[0]);
    }
    this.bus.emit(event, ...(args as any[]));
  }
}

export const events = new TypedEventBus();
