import { useState, useEffect, useRef } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import type { GitStatus } from '../types/index.js';
import { gatherContext } from '../utils/aiContext.js';
import { generateStatusUpdate, type AIStatus } from '../services/ai/index.js';

export function useAIStatus(rootPath: string, gitStatusMap: Map<string, GitStatus>, isGitLoading: boolean) {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const currentDiffRef = useRef<string>('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const missingApiKeyLoggedRef = useRef(false);
  const isMountedRef = useRef(true);
  const isAnalyzingRef = useRef(false);

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

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    // Always clear the previous timer so rapid changes reset the debounce window
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const hasApiKey = !!process.env.OPENAI_API_KEY;
    if (!hasApiKey) {
      if (!missingApiKeyLoggedRef.current) {
        logDebug('skip: missing OPENAI_API_KEY');
        missingApiKeyLoggedRef.current = true;
      }
      return;
    }

    missingApiKeyLoggedRef.current = false;

    if (isGitLoading) return;
    
    const hasChanges = gitStatusMap.size > 0;
    if (!hasChanges) {
      setStatus(null);
      setIsAnalyzing(false);
      currentDiffRef.current = '';
      logDebug('skip: clean-working-tree');
      return;
    }

    const debounceMs = status === null ? 2000 : 30000;
    logDebug('debounce:start', { delay: debounceMs, files: gitStatusMap.size });

    timerRef.current = setTimeout(async () => {
      if (!isMountedRef.current) return;
      if (isAnalyzingRef.current) {
        logDebug('skip: already-analyzing');
        return;
      }

      setIsAnalyzing(true);
      isAnalyzingRef.current = true;

      try {
        const context = await gatherContext(rootPath);
        const newDiff = context.diff;

        if (newDiff !== currentDiffRef.current) {
          currentDiffRef.current = newDiff;

          if (newDiff.length > 10) {
            logDebug('analyze:start', { diffLength: newDiff.length });
            const result = await generateStatusUpdate(newDiff, context.readme);

            if (isMountedRef.current) {
              if (result) {
                setStatus(result);
                logDebug('analyze:success', { emoji: result.emoji });
              } else {
                logDebug('analyze:null-result');
              }
            }
          }
        } else {
          logDebug('skip: diff-unchanged');
        }
      } catch (e) {
        console.error("AI Status Generation Failed:", e);
        logDebug('analyze:error', { message: e instanceof Error ? e.message : 'unknown' });
      } finally {
        if (isMountedRef.current) {
          setIsAnalyzing(false);
          isAnalyzingRef.current = false;
        }
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };

  }, [gitStatusMap, rootPath, isGitLoading, status]);

  return { status, isAnalyzing };
}
