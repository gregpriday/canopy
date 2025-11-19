import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export interface EmojiCacheEntry {
  emoji: string;
  hash: string;
  timestamp: number;
  model: string;
}

export interface EmojiCacheStore {
  [projectPath: string]: EmojiCacheEntry;
}

const CACHE_DIR = path.join(os.homedir(), '.config', 'canopy');
const CACHE_FILE = path.join(CACHE_DIR, 'emoji-cache.json');

export async function loadCache(): Promise<EmojiCacheStore> {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(data) as EmojiCacheStore;
  } catch (error) {
    // If file doesn't exist or is invalid, return empty store
    return {};
  }
}

export async function saveCache(store: EmojiCacheStore): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (error) {
    // Fail silently as per user request to remove logging for this feature.
  }
}

export async function getProjectHash(rootPath: string): Promise<string> {
  const folderName = path.basename(rootPath);
  const hash = crypto.createHash('sha256');
  hash.update(folderName);
  return hash.digest('hex');
}
