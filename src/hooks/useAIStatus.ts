import { useState, useEffect, useRef } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import type { GitStatus } from '../types/index.js';
import { gatherContext } from '../utils/aiContext.js';
import { generateStatusUpdate, type AIStatus } from '../services/ai/index.js';

export function useAIStatus(rootPath: string, gitStatusMap: Map<string, GitStatus>, isGitLoading: boolean) {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Refs to maintain state across polling cycles without triggering re-renders
  const currentDiffRef = useRef<string>('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const missingApiKeyLoggedRef = useRef(false);
  
  // Track if we have successfully analyzed at least once this session.
  // This prevents the "startup" immediate-fetch token from being burned by transient empty states.
  const hasAnalyzedRef = useRef(false);

  const debugEnabled = process.env.DEBUG_AI_STATUS === '1' || process.env.DEBUG_AI_STATUS === 'true';
  const logDebug = (event: string, details?: Record<string, unknown>): void => {
    if (!debugEnabled) return;
    try {
      const dir = path.join(rootPath, 'debug');
      fs.mkdirSync(dir, { recursive: true });
      const line = `[${new Date().toISOString()}] ${event}${details ? ` ${JSON.stringify(details)}` : ''}\n`;
      fs.appendFileSync(path.join(dir, 'ai-status.log'), line, 'utf-8');
    } catch {
      // If debug logging fails, do nothing to avoid impacting the UI.
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const hasApiKey = !!process.env.OPENAI_API_KEY;
    if (!hasApiKey) {
      if (!missingApiKeyLoggedRef.current) {
        logDebug('skip: missing OPENAI_API_KEY');
        missingApiKeyLoggedRef.current = true;
      }
      return;
    }

    missingApiKeyLoggedRef.current = false;

    // 1. Guard: Wait for Git to load
    if (isGitLoading) return;
    
    const hasChanges = gitStatusMap.size > 0;
    logDebug('effect:start', { gitLoading: isGitLoading, hasChanges, gitEntries: gitStatusMap.size });
    
    // 2. Guard: Clean Git State
    // If no files are changed, clear everything immediately.
    if (!hasChanges) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setStatus(null);
      setIsAnalyzing(false);
      currentDiffRef.current = '';
      logDebug('skip: clean-working-tree');
      return;
    }

    // 3. Check for Diff Changes
    const checkDiffAndSchedule = async () => {
        // Prevent concurrent checks while already analyzing
        if (isAnalyzing) {
            logDebug('skip: already-analyzing');
            return;
        }

        try {
            const context = await gatherContext(rootPath);
            const newDiff = context.diff;

            // Only schedule analysis if the diff content has changed or we have never analyzed.
            if (newDiff !== currentDiffRef.current || !hasAnalyzedRef.current) {
                currentDiffRef.current = newDiff;
                logDebug('schedule: diff-updated', { diffLength: newDiff.length });

                // Clear any existing pending analysis
                if (timerRef.current) clearTimeout(timerRef.current);

                // On first analysis (startup), run immediately. For subsequent updates, use 30s debounce.
                const delay = hasAnalyzedRef.current ? 30000 : 0;

                timerRef.current = setTimeout(async () => {
                    setIsAnalyzing(true);
                    logDebug('analyze:start', { diffLength: newDiff.length, readmeLength: context.readme.length });
                    try {
                         // Only analyze if there is meaningful content
                         if (newDiff.length > 10) {
                            const result = await generateStatusUpdate(newDiff, context.readme);
                            if (result) {
                                setStatus(result);
                                hasAnalyzedRef.current = true; // Mark startup as complete only on success
                                logDebug('analyze:success', { emoji: result.emoji, description: result.description });
                            } else {
                                logDebug('analyze:null-result');
                            }
                         }
                    } catch(e) {
                        console.error("AI Status Generation Failed:", e);
                        logDebug('analyze:error', { message: e instanceof Error ? e.message : 'unknown error' });
                    } finally {
                        setIsAnalyzing(false);
                        logDebug('analyze:complete');
                    }
                }, delay);
            } else {
                logDebug('skip: diff-unchanged');
            }
        } catch (e) {
            console.error("Context gathering failed:", e);
            logDebug('context:error', { message: e instanceof Error ? e.message : 'unknown error' });
        }
    };

    checkDiffAndSchedule();

  }, [gitStatusMap, rootPath, isGitLoading]);

  return { status, isAnalyzing };
}
