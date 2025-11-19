import { useState, useEffect } from 'react';
import path from 'node:path';
import {
  getProjectHash,
  loadCache,
  saveCache,
  type ProjectIdentity
} from '../services/emoji/cache.js';
import { generateIdentity } from '../services/emoji/generator.js';

// Default fallback if API fails or key missing
const DEFAULT_IDENTITY: ProjectIdentity = {
  emoji: '🌲',
  title: 'Canopy',
  gradientStart: '#42b883',
  gradientEnd: '#258b5f'
};

export function useProjectIdentity(rootPath: string) {
  // Initialize state immediately with folder name - no loading delay
  const [identity, setIdentity] = useState<ProjectIdentity>(() => {
    const folderName = path.basename(rootPath);
    return {
      ...DEFAULT_IDENTITY,
      title: folderName
    };
  });

  useEffect(() => {
    if (!process.env.OPENAI_API_KEY) {
      return; // Keep the initial fallback
    }

    let isMounted = true;

    const load = async () => {
      try {
        const [currentHash, cache] = await Promise.all([
          getProjectHash(rootPath),
          loadCache()
        ]);

        // Check Cache
        const cachedEntry = cache[rootPath];
        if (cachedEntry && cachedEntry.hash === currentHash) {
          if (isMounted) {
            setIdentity({
              emoji: cachedEntry.emoji,
              title: cachedEntry.title,
              gradientStart: cachedEntry.gradientStart,
              gradientEnd: cachedEntry.gradientEnd
            });
          }
          return;
        }

        // Cache Miss - Generate in background without blocking UI
        // Pass the full path so AI can use parent folder context
        const newIdentity = await generateIdentity(rootPath);

        if (newIdentity && isMounted) {
          cache[rootPath] = {
            ...newIdentity,
            hash: currentHash,
            timestamp: Date.now(),
            model: 'gpt-4o-mini'
          };
          await saveCache(cache);
          setIdentity(newIdentity);
        }
      } catch (error) {
        // Fail silently - keep showing the folder name
      }
    };

    load();

    return () => { isMounted = false; };
  }, [rootPath]);

  return identity;
}
