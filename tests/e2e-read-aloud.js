// Läs högt (mockad speechSynthesis), Föregående/Nästa/Tillbaka och A+/A− i läsvyn.
// Kör: BASE_URL=http://localhost:PORT/ node tests/e2e-read-aloud.js   (kräver playwright + Chrome)
// Inget skrivs: Firestore-skrivningar blockeras.
const { chromium } = require('playwright');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const BASE = process.env.BASE_URL || 'http://localhost:18433/';
let fails = 0, n = 0; const ok = (name, c, d = '') => { n++; if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d ? ' — ' + d : '')); };

// Mock: spelar in yttranden, låter dem "ta slut" först när testet säger till.
const MOCK = (withSv) => {
  const log = window.__ss = { spoken: [], utter: [], cancel: 0, pause: 0, resume: 0 };
  const voices = withSv ? [{ name: 'Alva', lang: 'sv-SE' }, { name: 'Sam', lang: 'en-US' }] : [{ name: 'Sam', lang: 'en-US' }];
  const ss = {
    speaking: false, paused: false,
    getVoices: () => voices,
    speak(u) { log.spoken.push(u.text); log.utter.push({ rate: u.rate, lang: u.lang, voice: u.voice && u.voice.name }); log.current = u; },
    cancel() { log.cancel++; log.current = null; },
    pause() { log.pause++; }, resume() { log.resume++; },
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: ss, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  window.__finish = () => { const u = log.current; log.current = null; if (u && u.onend) u.onend({}); };
};

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const mk = async (init, arg, extra = {}) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ...extra });
    const p = await ctx.newPage();
    await p.route(/firestore\.googleapis\.com\/.*\/Write\//, r => r.abort());
    if (init) await p.addInitScript(init, arg);
    await p.goto(BASE); await p.waitForSelector('.story-card', { timeout: 20000 });
    return [ctx, p];
  };
  const openStory = async (p, i = 0) => { await p.locator('.story-card').nth(i).click(); await p.waitForSelector('#storyModal.show'); await p.waitForTimeout(300); };

  // ---- Läs högt med svensk röst
  let [ctx, p] = await mk(MOCK, true);
  await openStory(p, 1);
  const btn = p.locator('.reader-btn-speech');
  const stop = p.locator('.reader-btn-stop');
  ok('Läs högt-knapp syns och är stor (≥56px hög)', await btn.isVisible() && (await btn.boundingBox()).height >= 55.5);
  ok('Stoppa dold innan uppläsning', !(await stop.isVisible()));
  ok('ingen röstvarning när svensk röst finns', !(await p.locator('.reader-voice-note').isVisible()));
  await btn.click();
  let s = await p.evaluate(() => window.__ss);
  ok('läser titeln först', s.spoken.length === 1 && s.spoken[0] === (await p.textContent('#storyModalTitle')));
  ok('rate 0,9 och sv-SE-röst', s.utter[0].rate === 0.9 && s.utter[0].voice === 'Alva' && /^sv/.test(s.utter[0].lang), JSON.stringify(s.utter[0]));
  await p.evaluate(() => window.__finish());
  ok('första stycket markeras', (await p.locator('#storyModalBody p.reader-reading').count()) === 1);
  ok('knappen visar Pausa och Stoppa syns', /Pausa/.test(await btn.textContent()) && await stop.isVisible());
  await btn.click();
  s = await p.evaluate(() => window.__ss);
  ok('Pausa anropar speechSynthesis.pause()', s.pause === 1 && /Fortsätt/.test(await btn.textContent()));
  await btn.click();
  s = await p.evaluate(() => window.__ss);
  ok('Fortsätt anropar resume()', s.resume === 1 && /Pausa/.test(await btn.textContent()));
  await p.evaluate(() => window.__finish());
  ok('går vidare till nästa stycke', (await p.evaluate(() => window.__ss.spoken.length)) === 3);
  const c0 = await p.evaluate(() => window.__ss.cancel);
  await stop.click();
  ok('Stoppa avbryter, tar bort markering och återställer knappen', (await p.evaluate(() => window.__ss.cancel)) > c0 && (await p.locator('#storyModalBody p.reader-reading').count()) === 0 && /Läs högt/.test(await btn.textContent()) && !(await stop.isVisible()));
  await btn.click(); await p.evaluate(() => window.__finish());
  const c1 = await p.evaluate(() => window.__ss.cancel);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok('talet stoppas när man lämnar berättelsen', (await p.evaluate(() => window.__ss.cancel)) > c1);
  const after = await p.evaluate(() => window.__ss.spoken.length);
  await p.evaluate(() => window.__finish()); await p.waitForTimeout(100);
  ok('inget mer läses efter stängning', (await p.evaluate(() => window.__ss.spoken.length)) === after);

  // ---- Föregående / Nästa / Tillbaka
  await openStory(p, 0);
  const cards = await p.locator('.story-card').count();
  const prev = p.locator('#storyNavPrev'), next = p.locator('#storyNavNext'), back = p.locator('#storyNavBack');
  ok('första berättelsen: ingen Föregående', !(await prev.isVisible()));
  if (cards > 1) {
    ok('Nästa syns med nästa titel', await next.isVisible() && (await p.textContent('#storyNavNextTitle')).length > 0);
    const want = await p.textContent('#storyNavNextTitle');
    const hashLen = await p.evaluate(() => history.length);
    await btn.click();
    await next.click(); await p.waitForTimeout(300);
    ok('Nästa öppnar nästa berättelse', (await p.textContent('#storyModalTitle')) === want);
    ok('byte stoppar uppläsningen', /Läs högt/.test(await btn.textContent()) && (await p.locator('#storyModalBody p.reader-reading').count()) === 0);
    ok('byte staplar inte historik', (await p.evaluate(() => history.length)) === hashLen);
    ok('fokus flyttas till titeln', await p.evaluate(() => document.activeElement && document.activeElement.id === 'storyModalTitle'));
    ok('Föregående syns nu', await prev.isVisible());
  }
  const sizes = await p.evaluate(() => [...document.querySelectorAll('.story-nav-btn')].filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
  ok('nav-knappar ≥44px', sizes.length >= 1 && sizes.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(sizes));
  await back.focus();
  const outline = await back.evaluate(e => parseFloat(getComputedStyle(e).outlineWidth));
  await p.keyboard.press('Tab'); await p.keyboard.press('Shift+Tab');
  const ow = await p.evaluate(() => parseFloat(getComputedStyle(document.activeElement).outlineWidth));
  ok('tydlig fokusstil (≥2px outline)', Math.max(outline, ow) >= 2, `${outline}/${ow}`);
  await back.click(); await p.waitForTimeout(300);
  ok('Tillbaka till alla berättelser stänger läsvyn', !(await p.locator('#storyModal.show').count()) && !/#story-/.test(await p.evaluate(() => location.hash)));
  ok('admin-knappar dolda för besökare', await p.evaluate(() => { const a = document.getElementById('storyModalAdminActions'); return !a || getComputedStyle(a).display === 'none'; }));

  // ---- A+/A− sparas
  await openStory(p, 0);
  const fs0 = await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('storyModalBody')).fontSize));
  await p.getByRole('button', { name: /A\+/ }).click();
  const fs1 = await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('storyModalBody')).fontSize));
  ok('A+ ger större text', fs1 > fs0, `${fs0}→${fs1}`);
  ok('storlek sparas i localStorage', (await p.evaluate(() => localStorage.getItem('reader.size'))) !== null);
  await p.reload(); await p.waitForSelector('.story-card'); await p.waitForTimeout(500); if (!(await p.locator('#storyModal.show').count())) await openStory(p, 0);
  const fs2 = await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('storyModalBody')).fontSize));
  ok('storleken finns kvar efter omladdning', Math.abs(fs2 - fs1) < 0.5, `${fs2}`);
  await p.getByRole('button', { name: /A−/ }).click();
  const fs3 = await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('storyModalBody')).fontSize));
  ok('A− ger mindre text', fs3 < fs2);
  await ctx.close();

  // ---- Ingen svensk röst: vänlig förklaring
  [ctx, p] = await mk(MOCK, false);
  await openStory(p, 0);
  ok('utan svensk röst: vänlig förklaring visas', await p.locator('.reader-voice-note').isVisible() && /svensk röst/.test(await p.textContent('.reader-voice-note')));
  await ctx.close();

  // ---- Utan speechSynthesis: knappen döljs
  [ctx, p] = await mk(() => { try { delete window.speechSynthesis; Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); } catch (e) {} });
  await openStory(p, 0);
  ok('utan speechSynthesis: ingen Läs högt-knapp', (await p.locator('.reader-btn-speech').count()) === 0);
  await ctx.close();

  // ---- Reduced motion: inga animationer på nya delar
  [ctx, p] = await mk(MOCK, true, { reducedMotion: 'reduce' });
  await openStory(p, 0);
  const anim = await p.evaluate(() => [...document.querySelectorAll('.reader-speech *, .story-nav *, .story-nav')].map(e => getComputedStyle(e)).filter(s => parseFloat(s.transitionDuration) > 0.01 || (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.01)).length);
  ok('reduced-motion: inga övergångar', anim === 0, anim + '');
  await ctx.close();

  await b.close();
  console.log(`\n${n - fails}/${n} passed`);
  process.exit(fails ? 1 : 0);
})();
