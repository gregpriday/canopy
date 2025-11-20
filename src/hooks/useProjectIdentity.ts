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
    const debugLog = process.env.DEBUG_IDENTITY === 'true';

    if (!process.env.OPENAI_API_KEY) {
      if (debugLog) {
        console.log('[identity] Skipping: OPENAI_API_KEY not set');
      }
      return;
    }

    let isMounted = true;

    const fetchIdentity = async () => {
      try {
        const currentHash = await getProjectHash(rootPath);
        const cache = await loadIdentityCache();
        const cachedEntry = cache[rootPath];

        // 1. Try Cache Match
        if (cachedEntry && cachedEntry.hash === currentHash) {
          if (debugLog) {
            console.log('[identity] Cache hit for:', rootPath);
          }
          if (isMounted) {
             // OPTIMIZATION: Only update state if it actually changed
             // Compare all fields including gradients to avoid missing gradient updates
             const identityUnchanged =
               cachedEntry.emoji === identity.emoji &&
               cachedEntry.title === identity.title &&
               cachedEntry.gradientStart === identity.gradientStart &&
               cachedEntry.gradientEnd === identity.gradientEnd;

             if (!identityUnchanged) {
                // Extract only ProjectIdentity fields (no cache metadata)
                const { emoji, title, gradientStart, gradientEnd } = cachedEntry;
                setIdentity({ emoji, title, gradientStart, gradientEnd });
             }
          }
          return;
        }

        // 2. Generate New Identity (Cache Miss)
        if (debugLog) {
          console.log('[identity] Cache miss, generating for:', rootPath);
        }

        const newIdentity = await generateProjectIdentity(rootPath);

        if (newIdentity && isMounted) {
          if (debugLog) {
            console.log('[identity] Generated:', newIdentity);
          }

          const entry = {
            ...newIdentity,
            hash: currentHash,
            timestamp: Date.now(),
            model: 'gpt-5-mini'
          };

          cache[rootPath] = entry;
          await saveIdentityCache(cache);
          setIdentity(newIdentity);
        } else if (!newIdentity && debugLog) {
          console.log('[identity] Generation returned null');
        }
      } catch (e) {
        console.error('[identity] Failed to fetch/generate identity:', e);
      }
    };

    fetchIdentity();

    return () => { isMounted = false; };
  }, [rootPath]); 

  return identity;
}
