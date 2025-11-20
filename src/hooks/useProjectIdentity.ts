import { useState, useEffect } from 'react';
import path from 'node:path';
import {
  getProjectHash,
  loadIdentityCache,
  saveIdentityCache,
  generateProjectIdentity,
  type ProjectIdentity
} from '../services/ai/index.js'; // UPDATED IMPORT

const DEFAULT_IDENTITY: ProjectIdentity = {
  emoji: '🌲',
  title: 'Canopy',
  gradientStart: '#42b883',
  gradientEnd: '#258b5f'
};

export function useProjectIdentity(rootPath: string) {
  const [identity, setIdentity] = useState<ProjectIdentity>(() => {
    const folderName = path.basename(rootPath);
    return { ...DEFAULT_IDENTITY, title: folderName };
  });

  useEffect(() => {
    if (!process.env.OPENAI_API_KEY) return;

    let isMounted = true;

    // Non-blocking async wrapper
    const fetchIdentity = async () => {
      try {
        const currentHash = await getProjectHash(rootPath);
        const cache = await loadIdentityCache();
        
        const cachedEntry = cache[rootPath];
        
        // 1. Try Cache
        if (cachedEntry && cachedEntry.hash === currentHash) {
          if (isMounted) setIdentity(cachedEntry);
          return;
        }

        // 2. Generate (Non-blocking API call)
        const newIdentity = await generateProjectIdentity(rootPath);

        if (newIdentity && isMounted) {
          cache[rootPath] = {
            ...newIdentity,
            hash: currentHash,
            timestamp: Date.now(),
            model: 'gpt-5-mini'
          };
          await saveIdentityCache(cache);
          setIdentity(newIdentity);
        }
      } catch (e) {
        // Fail silently, keep default
      }
    };

    fetchIdentity();

    return () => { isMounted = false; };
  }, [rootPath]);

  return identity;
}