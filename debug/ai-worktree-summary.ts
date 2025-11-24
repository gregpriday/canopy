#!/usr/bin/env tsx
import path from 'node:path';
import { loadEnv } from '../src/utils/envLoader.js';
import { generateWorktreeSummary } from '../src/services/ai/worktree.js';
import { getWorktreeChangesWithStats } from '../src/utils/git.js';
import simpleGit from 'simple-git';

async function main(): Promise<void> {
  const target = process.argv[2] ? path.resolve(process.argv[2]!) : process.cwd();
  loadEnv(target);

  // eslint-disable-next-line no-console
  console.log(`\n=== AI Worktree Summary Debug ===`);
  // eslint-disable-next-line no-console
  console.log(`Target: ${target}`);
  // eslint-disable-next-line no-console
  console.log(`OPENAI_API_KEY present: ${Boolean(process.env.OPENAI_API_KEY)}\n`);

  try {
    // Get worktree changes with stats
    const changes = await getWorktreeChangesWithStats(target);

    // eslint-disable-next-line no-console
    console.log('--- Worktree Changes ---');
    // eslint-disable-next-line no-console
    console.log(`Total files changed: ${changes.changedFileCount}`);
    // eslint-disable-next-line no-console
    console.log(`Total insertions: ${changes.totalInsertions}`);
    // eslint-disable-next-line no-console
    console.log(`Total deletions: ${changes.totalDeletions}`);
    // eslint-disable-next-line no-console
    console.log(`Latest file mtime: ${changes.latestFileMtime ? new Date(changes.latestFileMtime).toISOString() : 'N/A'}\n`);

    // Show scored files
    // eslint-disable-next-line no-console
    console.log('--- File Scores (top 10) ---');
    const now = Date.now();
    const scoredFiles = changes.changes.map(change => {
      const relPath = path.relative(target, change.path);
      const isSrc = relPath.startsWith('src/');
      const isTest = /(__tests__|\.test\.|\.spec\.)/.test(relPath);
      const isDoc = /README|docs?\//i.test(relPath);

      const typeWeight =
        isSrc ? 1.0 :
        isTest ? 0.9 :
        isDoc ? 0.8 :
        0.7;

      const absChanges = (change.insertions ?? 0) + (change.deletions ?? 0);
      const magnitudeScore = Math.log2(1 + absChanges);

      const ageMs = change.mtimeMs ? now - change.mtimeMs : Number.MAX_SAFE_INTEGER;
      const recencyScore =
        ageMs < 5 * 60_000 ? 2.0 :
        ageMs < 60 * 60_000 ? 1.0 :
        ageMs < 24 * 60 * 60_000 ? 0.5 :
        0.25;

      const score = 3 * recencyScore + 2 * magnitudeScore + 1 * typeWeight;

      return {
        relPath,
        score,
        recencyScore,
        magnitudeScore,
        typeWeight,
        insertions: change.insertions ?? 0,
        deletions: change.deletions ?? 0,
        ageMs,
        status: change.status
      };
    }).sort((a, b) => b.score - a.score).slice(0, 10);

    for (const file of scoredFiles) {
      // eslint-disable-next-line no-console
      console.log(`  [${file.score.toFixed(2)}] ${file.relPath}`);
      // eslint-disable-next-line no-console
      console.log(`    status=${file.status}, changes=+${file.insertions}/-${file.deletions}`);
      // eslint-disable-next-line no-console
      console.log(`    recency=${file.recencyScore.toFixed(2)}, magnitude=${file.magnitudeScore.toFixed(2)}, type=${file.typeWeight.toFixed(2)}`);
      const ageMinutes = Math.floor(file.ageMs / 60_000);
      // eslint-disable-next-line no-console
      console.log(`    age=${ageMinutes}min\n`);
    }

    // Get branch name
    const git = simpleGit(target);
    const branchInfo = await git.branch();
    const branchName = branchInfo.current;

    // eslint-disable-next-line no-console
    console.log('--- Generating Summary ---');
    // eslint-disable-next-line no-console
    console.log(`Branch: ${branchName}`);

    const summary = await generateWorktreeSummary(target, branchName, 'main', changes);

    if (summary) {
      // eslint-disable-next-line no-console
      console.log(`\n✅ Summary: "${summary.summary}"`);
      // eslint-disable-next-line no-console
      console.log(`   Modified count: ${summary.modifiedCount}`);
    } else {
      // eslint-disable-next-line no-console
      console.log('\n⚠️  No summary generated (AI client unavailable)');
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error:', error);
    throw error;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('\nAI worktree summary debug failed:', err);
  process.exit(1);
});
