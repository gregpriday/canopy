import { EventEmitter } from 'events';
import type { NotificationType } from '../types/index.js';

export type ModalId = 'help' | 'worktree' | 'context-menu' | 'command-bar';

// 1. Define Payload Types
export interface CopyTreePayload {
  rootPath?: string;
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

export interface UIModalOpenPayload {
  id: ModalId;
  context?: any; // Context-specific payload (path for context menu, etc.)
}

export interface UIModalClosePayload {
  id?: ModalId; // If omitted, close all
}

export interface WatcherChangePayload {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string; // Absolute or normalized path
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
  'nav:primary': { path: string };

  'file:open': { path: string };
  'file:copy-tree': CopyTreePayload;

  'ui:notify': NotifyPayload;
  'ui:command:open': { initialInput?: string };
  'ui:command:submit': { input: string };
  'ui:filter:set': { query: string };
  'ui:filter:clear': void;
  'ui:modal:open': UIModalOpenPayload;
  'ui:modal:close': UIModalClosePayload;

  'sys:worktree:switch': { worktreeId: string };
  
  'watcher:change': WatcherChangePayload;
};

// 3. Create Bus
class TypedEventBus {
  private bus = new EventEmitter();

  // Subscribe
  on<K extends keyof CanopyEventMap>(
    event: K,
    listener: (payload: CanopyEventMap[K]) => void
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
    payload: CanopyEventMap[K]
  ) {
    this.bus.emit(event, payload);
  }
}

export const events = new TypedEventBus();
