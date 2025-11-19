import { generateEmoji } from './services/emoji/generator.js';
import { getProjectHash, loadCache } from './services/emoji/cache.js';
import path from 'node:path';

async function runDebug() {
  console.log('--- Emoji Generation Debugger ---');
  
  const cwd = process.cwd();
  const name = path.basename(cwd);
  
  console.log(`Current Directory: ${cwd}`);
  console.log(`Project Name: ${name}`);
  
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY is not set.');
    process.exit(1);
  }
  console.log('✅ OPENAI_API_KEY found.');

  console.log('\n1. Checking Cache...');
  try {
    const cache = await loadCache();
    const hash = await getProjectHash(cwd);
    console.log(`Current Hash: ${hash}`);
    
    const entry = cache[cwd];
    if (entry) {
      console.log('Cache Entry Found:');
      console.log(`  Emoji: ${entry.emoji}`);
      console.log(`  Stored Hash: ${entry.hash}`);
      console.log(`  Match? ${entry.hash === hash ? 'YES' : 'NO'}`);
    } else {
      console.log('No cache entry for this path.');
    }
  } catch (e) {
    console.error('Cache check failed:', e);
  }

  console.log('\n2. Testing Generation...');
  try {
    const emoji = await generateEmoji(name);
    if (emoji) {
      console.log(`\n🎉 Success! Generated Emoji: ${emoji}`);
    } else {
      console.log('\n❌ Failed to generate emoji.');
    }
  } catch (e) {
    console.error('Generation failed:', e);
  }
}

runDebug().catch(console.error);
