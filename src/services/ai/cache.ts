import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export interface ProjectIdentity {
  emoji: string;
  title: string;
  gradientStart: string;
  gradientEnd: string;
}

export interface IdentityCacheEntry extends ProjectIdentity {
  hash: string;
  timestamp: number;
  model: string;
}

const CACHE_DIR = path.join(os.homedir(), '.config', 'canopy');
const CACHE_FILE = path.join(CACHE_DIR, 'identity-cache.json');

export async function getProjectHash(rootPath: string): Promise<string> {
  const folderName = path.basename(rootPath);
  const hash = crypto.createHash('sha256');
  hash.update(folderName);
  return hash.digest('hex');
}

export async function loadIdentityCache(): Promise<Record<string, IdentityCacheEntry>> {
  try {
    const exists = await fs.pathExists(CACHE_FILE);
    if (!exists) return {};
    return await fs.readJson(CACHE_FILE);
  } catch (error) {
    return {};
  }
}

export async function saveIdentityCache(store: Record<string, IdentityCacheEntry>): Promise<void> {
  try {
    await fs.ensureDir(CACHE_DIR);
    await fs.writeJson(CACHE_FILE, store, { spaces: 2 });
  } catch (error) {
    // Fail silently
  }
}
