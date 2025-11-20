import { useState, useEffect, useRef, useCallback } from 'react';
import type { GitStatus } from '../types/index.js';
import { gatherContext } from '../utils/aiContext.js';
import { generateAIStatus, type AIStatus } from '../services/statusGenerator.js';

export function useAIStatus(
  rootPath: string, 
  gitStatusMap: Map<string, GitStatus>
) {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const isStartup = useRef(true);
  const hasChanges = gitStatusMap.size > 0;

  const runAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    try {
      const context = await gatherContext(rootPath);
      
      // Only query AI if the diff is substantial enough
      if (context.diff.length > 50) {
        const result = await generateAIStatus(context.diff, context.readme);
        if (result) setStatus(result);
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [rootPath]);

  // 1. Startup
  useEffect(() => {
    runAnalysis().finally(() => {
      isStartup.current = false;
    });
  }, [runAnalysis]);

  // 2. Update on Changes
  useEffect(() => {
    // CASE A: No Changes detected by GitStatus
    if (!hasChanges) {
      // If we are starting up, ignore
      if (isStartup.current) return;

      // If we have a status, debounce the clearing.
      // This handles race conditions where runAnalysis finishes (setting status)
      // slightly before useGitStatus populates the map.
      if (status) {
        const clearTimer = setTimeout(() => {
           setStatus(null);
           setIsAnalyzing(false);
        }, 2000); // 2s grace period
        return () => clearTimeout(clearTimer);
      }

      // If no status, ensure clean state immediately
      setStatus(null);
      setIsAnalyzing(false);
      return;
    }

    // CASE B: Changes detected
    // If we already have a status, use long debounce (60s) to avoid churn.
    // If we DON'T have a status (e.g. recovered from empty state), use short debounce (2s).
    const delay = status ? 60000 : 2000;
    
    const timer = setTimeout(runAnalysis, delay); 

    return () => clearTimeout(timer);
  }, [gitStatusMap, rootPath, hasChanges, runAnalysis, status]);

  return { status, isAnalyzing };
}
