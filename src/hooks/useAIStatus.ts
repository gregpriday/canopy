import { useState, useEffect, useRef } from 'react';
import type { GitStatus } from '../types/index.js';
import { gatherContext } from '../utils/aiContext.js';
import { generateStatusUpdate, type AIStatus } from '../services/ai/index.js'; // UPDATED IMPORT

export function useAIStatus(rootPath: string, gitStatusMap: Map<string, GitStatus>) {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const isStartup = useRef(true);
  const hasChanges = gitStatusMap.size > 0;

  useEffect(() => {
    // Clean up state if no changes (unless startup)
    if (!hasChanges && !isStartup.current) {
      setStatus(null);
      setIsAnalyzing(false);
      return;
    }

    let isMounted = true;
    
    // Non-blocking analysis function
    const analyze = async () => {
      if (!isMounted) return;
      setIsAnalyzing(true);
      
      try {
        const context = await gatherContext(rootPath);
        
        // Only query if we have enough diff context
        if (context.diff.length > 50) {
          const result = await generateStatusUpdate(context.diff, context.readme);
          if (isMounted && result) {
            setStatus(result);
          }
        }
      } catch (e) {
        // Ignore errors
      } finally {
        if (isMounted) setIsAnalyzing(false);
      }
    };

    // Debounce logic:
    // Long delay (60s) if we already have status to prevent churn
    // Short delay (2s) if we are fresh or just recovered
    const delay = status ? 60000 : 2000;
    
    const timer = setTimeout(() => {
      analyze().finally(() => {
        isStartup.current = false;
      });
    }, delay);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [gitStatusMap, rootPath, hasChanges, status]);

  return { status, isAnalyzing };
}