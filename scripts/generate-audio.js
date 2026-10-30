#!/usr/bin/env node
// Genererar inspelad uppläsning (Edge-rösten Sofie, sv-SE) för publicerade berättelser.
// Körs på boxen, INTE i Netlify-bygget. Inga hemligheter: sidan läses som anonym besökare
// med Playwright, och bitarna tas från reader.js (StoryReader.chunkInfo) så att index och hash
// matchar exakt det webbläsaren läser upp.
//
//   node scripts/generate-audio.js [--base https://skogsmulle.netlify.app/] [--out audio] [--force]
//
// Idempotent: en bit genereras bara om dess text ändrats eller filen saknas. Överblivna filer tas bort.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = arg('--base', process.env.BASE_URL || 'https://skogsmulle.netlify.app/');
const OUT = path.resolve(arg('--out', path.join(__dirname, '..', 'audio')));
const TTS = process.env.TTS_BIN || '/workspace/tools/tts/tts';
const FORCE = args.includes('--force');
const VOICE = 'sofie';
const BITRATE = '32k'; // mono, räcker gott för tal
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

function synth(text, file) {
  const tmp = file + '.tmp.mp3';
  execFileSync(TTS, ['--engine', 'edge', '--voice', VOICE, '--lang', 'sv', '-o', tmp, text], { stdio: ['ignore', 'pipe', 'inherit'] });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-ac', '1', '-ar', '24000', '-b:a', BITRATE, '-map_metadata', '-1', file]);
  fs.unlinkSync(tmp);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const page = await (await browser.newContext()).newPage();
  // Bara läsning: blockera alla skrivningar mot Firestore.
  await page.route(/firestore\.googleapis\.com\/.*\/Write\//, (r) => r.abort());
  await page.goto(BASE);
  await page.waitForSelector('.story-card', { timeout: 30000 });
  const count = await page.locator('.story-card').count();
  const stories = [];
  for (let i = 0; i < count; i++) {
    await page.locator('.story-card').nth(i).click();
    await page.waitForSelector('#storyModal.show');
    await page.waitForTimeout(200);
    const info = await page.evaluate(() => {
      const st = window.StoryReader.chunkInfo();
      st.lang = document.body.getAttribute('lang') || 'sv';
      return st;
    });
    stories.push(info);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  await browser.close();

  fs.mkdirSync(OUT, { recursive: true });
  let made = 0, kept = 0;
  const keepDirs = new Set();
  for (const st of stories) {
    if (!st.id || !/^[A-Za-z0-9_-]+$/.test(st.id)) { console.warn('Hoppar över (saknar id):', st.title); continue; }
    if (!/^sv/.test(st.lang)) { console.log('Hoppar över (inte svenska):', st.title); continue; }
    keepDirs.add(st.id);
    const dir = path.join(OUT, st.id);
    fs.mkdirSync(dir, { recursive: true });
    const mf = path.join(dir, 'manifest.json');
    const old = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : { chunks: [] };
    const chunks = st.chunks.map((text, n) => {
      const file = path.join(dir, n + '.mp3');
      const h = sha(VOICE + '|' + BITRATE + '|' + text);
      if (!FORCE && old.chunks[n] && old.chunks[n].h === h && fs.existsSync(file)) { kept++; }
      else { synth(text, file); made++; }
      return { n, h, bytes: fs.statSync(file).size };
    });
    fs.readdirSync(dir).forEach((f) => {
      const m = /^(\d+)\.mp3$/.exec(f);
      if (m && +m[1] >= chunks.length) fs.unlinkSync(path.join(dir, f));
    });
    const manifest = { id: st.id, slug: st.slug, title: st.title, voice: 'sv-SE-SofieNeural', hash: st.hash, count: chunks.length, chunks };
    fs.writeFileSync(mf, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`${st.title}: ${chunks.length} bitar`);
  }
  fs.readdirSync(OUT).forEach((d) => {
    const p = path.join(OUT, d);
    if (fs.statSync(p).isDirectory() && !keepDirs.has(d)) { fs.rmSync(p, { recursive: true }); console.log('Tog bort', d); }
  });
  console.log(`Klart: ${stories.length} berättelser, ${made} nya bitar, ${kept} oförändrade.`);
})().catch((e) => { console.error(e); process.exit(1); });
