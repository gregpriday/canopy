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
    if (!hasChanges) {
      // If git status clears (size 0), clear AI status unless we are just starting up
      if (!isStartup.current) {
        setStatus(null);
        setIsAnalyzing(false);
      }
      return;
    }

    // If we already have a status, use long debounce (60s) to avoid churn.
    // If we DON'T have a status (e.g. recovered from empty state), use short debounce (2s).
    const delay = status ? 60000 : 2000;
    
    const timer = setTimeout(runAnalysis, delay); 

    return () => clearTimeout(timer);
  }, [gitStatusMap, rootPath, hasChanges, runAnalysis, status]);

  return { status, isAnalyzing };
}
