import { generateProjectIdentity, getProjectHash, loadIdentityCache } from './services/ai/index.js';
import path from 'node:path';

async function runDebug() {
  console.log('--- Identity Generation Debugger ---');
  
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
    const cache = await loadIdentityCache();
    const hash = await getProjectHash(cwd);
    console.log(`Current Hash: ${hash}`);
    
    const entry = cache[cwd];
    if (entry) {
      console.log('Cache Entry Found:');
      console.log(`  Title: ${entry.title}`);
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
    const identity = await generateProjectIdentity(cwd);
    if (identity) {
      console.log(`\n🎉 Success! Generated Identity:`);
      console.log(`  Emoji: ${identity.emoji}`);
      console.log(`  Title: ${identity.title}`);
      console.log(`  Gradient: ${identity.gradientStart} -> ${identity.gradientEnd}`);
    } else {
      console.log('\n❌ Failed to generate identity.');
    }
  } catch (e) {
    console.error('Generation failed:', e);
  }
}

runDebug().catch(console.error);