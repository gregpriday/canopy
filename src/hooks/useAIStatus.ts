import { useState, useEffect, useRef } from 'react';
import type { GitStatus } from '../types/index.js';
import { gatherContext } from '../utils/aiContext.js';
import { generateStatusUpdate, type AIStatus } from '../services/ai/index.js';

export function useAIStatus(rootPath: string, gitStatusMap: Map<string, GitStatus>, isGitLoading: boolean) {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Refs to maintain state across polling cycles without triggering re-renders
  const currentDiffRef = useRef<string>('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track if we have successfully analyzed at least once this session.
  // This prevents the "startup" immediate-fetch token from being burned by transient empty states.
  const hasAnalyzedRef = useRef(false);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    // 1. Guard: Wait for Git to load
    if (isGitLoading) return;
    
    const hasChanges = gitStatusMap.size > 0;
    
    // 2. Guard: Clean Git State
    // If no files are changed, clear everything immediately.
    if (!hasChanges) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setStatus(null);
      setIsAnalyzing(false);
      currentDiffRef.current = '';
      return;
    }

    // 3. Check for Diff Changes
    const checkDiffAndSchedule = async () => {
        try {
            const context = await gatherContext(rootPath);
            const newDiff = context.diff;

            // Only schedule analysis if the diff CONTENT has actually changed
            if (newDiff !== currentDiffRef.current) {
                currentDiffRef.current = newDiff;
                
                // Clear any existing pending analysis
                if (timerRef.current) clearTimeout(timerRef.current);

                // Determine Delay:
                // 1. Startup (First Analysis) -> 0ms (Immediate)
                // 2. Active Typing (Status exists) -> 60,000ms (1 min debounce)
                // 3. Recovery (Status cleared/null) -> 2,000ms (Quick recovery)
                const delay = !hasAnalyzedRef.current 
                    ? 0 
                    : (status ? 60000 : 2000);

                timerRef.current = setTimeout(async () => {
                    setIsAnalyzing(true);
                    try {
                         // Only analyze if there is meaningful content
                         if (newDiff.length > 10) {
                            const result = await generateStatusUpdate(newDiff, context.readme);
                            if (result) {
                                setStatus(result);
                                hasAnalyzedRef.current = true; // Mark startup as complete only on success
                            }
                         }
                    } catch(e) {
                        console.error("AI Status Generation Failed:", e);
                    } finally {
                        setIsAnalyzing(false);
                    }
                }, delay);
            }
        } catch (e) {
            console.error("Context gathering failed:", e);
        }
    };

    checkDiffAndSchedule();

  }, [gitStatusMap, rootPath, isGitLoading, status]); // Added status as dependency for delay calc

  return { status, isAnalyzing };
}