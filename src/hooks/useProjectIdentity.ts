import { useState, useEffect } from 'react';
import path from 'node:path';
import {
  getProjectHash,
  loadIdentityCache,
  saveIdentityCache,
  generateProjectIdentity,
  type ProjectIdentity
} from '../services/ai/index.js';

const DEFAULT_IDENTITY: ProjectIdentity = {
  emoji: '🌲',
  title: 'Canopy',
  gradientStart: '#42b883',
  gradientEnd: '#258b5f'
};

export function useProjectIdentity(rootPath: string) {
  // Initialize with default
  const [identity, setIdentity] = useState<ProjectIdentity>(() => {
    const folderName = path.basename(rootPath);
    return { ...DEFAULT_IDENTITY, title: folderName };
  });

  useEffect(() => {
    if (!process.env.OPENAI_API_KEY) return;

    let isMounted = true;

    const fetchIdentity = async () => {
      try {
        const currentHash = await getProjectHash(rootPath);
        const cache = await loadIdentityCache();
        const cachedEntry = cache[rootPath];
        
        // 1. Try Cache Match
        if (cachedEntry && cachedEntry.hash === currentHash) {
          if (isMounted) {
             // OPTIMIZATION: Only update state if it actually changed
             // This prevents the UI from "blinking" or re-rendering unnecessarily
             if (cachedEntry.emoji !== identity.emoji || cachedEntry.title !== identity.title) {
                setIdentity(cachedEntry);
             }
          }
          return;
        }

        // 2. Generate New Identity (Cache Miss)
        const newIdentity = await generateProjectIdentity(rootPath);

        if (newIdentity && isMounted) {
          const entry = {
            ...newIdentity,
            hash: currentHash,
            timestamp: Date.now(),
            model: 'gpt-5-mini'
          };
          
          cache[rootPath] = entry;
          await saveIdentityCache(cache);
          setIdentity(newIdentity);
        }
      } catch (e) {
        console.error("Identity check failed", e);
      }
    };

    fetchIdentity();

    return () => { isMounted = false; };
  }, [rootPath]); 

  return identity;
}
