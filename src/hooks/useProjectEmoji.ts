import { useState, useEffect } from 'react';
import path from 'node:path';
import { 
  getProjectHash, 
  loadCache, 
  saveCache, 
  type EmojiCacheStore 
} from '../services/emoji/index.js';
import { generateEmoji } from '../services/emoji/generator.js';

export function useProjectEmoji(rootPath: string) {
  const [emoji, setEmoji] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check env var (fast fail)
    if (!process.env.OPENAI_API_KEY) return;

    let isMounted = true;

    const loadEmoji = async () => {
      try {
        // 2. Calculate Hash & Load Cache in parallel
        const [currentHash, cache] = await Promise.all([
          getProjectHash(rootPath),
          loadCache()
        ]);

        // 3. Check Cache
        const cachedEntry = cache[rootPath];
        if (cachedEntry && cachedEntry.hash === currentHash) {
          if (isMounted) setEmoji(cachedEntry.emoji);
          return;
        }

        // 4. Cache Miss - Generate in background
        // If we have a stale entry (different hash), we can show it while loading, 
        // or just wait. The spec suggests: "if (cachedEntry) setEmoji(cachedEntry.emoji); // Show stale temporarily"
        if (cachedEntry && isMounted) {
          setEmoji(cachedEntry.emoji);
        }

        const newEmoji = await generateEmoji(path.basename(rootPath));

        if (newEmoji && isMounted) {
          // 5. Update Cache
          // We need to make sure we're updating the *latest* cache if possible, 
          // but for this simple implementation, using the loaded 'cache' object is fine 
          // as long as we don't have high concurrency on the file itself.
          cache[rootPath] = {
            emoji: newEmoji,
            hash: currentHash,
            timestamp: Date.now(),
            model: 'gpt-5-mini'
          };
          await saveCache(cache);

          setEmoji(newEmoji);
        }
      } catch (error) {
        // Fail silently as per user request to remove logging for this feature.
      }
    };

    loadEmoji();

    return () => { isMounted = false; };
  }, [rootPath]);

  return emoji;
}
