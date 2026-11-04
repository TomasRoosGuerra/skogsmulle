// UX-pass: tryckytor ≥44px, laddningsskelett och feltillstånd med "Försök igen".
// Kör: BASE_URL=http://localhost:PORT/ node tests/ux-polish.test.js
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5077/';
let fails = 0, n = 0;
const ok = (name, c, d = '') => { n++; if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d ? ' — ' + d : '')); };
const size = (loc) => loc.evaluate(e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const [vn, vp] of [['mobil', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    const ctx = await b.newContext({ viewport: vp });
    const p = await ctx.newPage();
    await p.route(/firestore\.googleapis\.com\/.*\/Write\//, r => r.abort());
    await p.goto(BASE); await p.waitForSelector('.story-card', { timeout: 20000 });
    for (const [label, sel] of [['varumärkeslänk', '#navBrand'], ['brödsmula Hem', '.breadcrumb-nav a'], ['sidfot Integritetspolicy', 'a.footer-link']]) {
      const s = await size(p.locator(sel).first());
      ok(`${vn}: ${label} ≥44px hög`, s.h >= 44, JSON.stringify(s));
    }
    ok(`${vn}: listan är inte längre aria-busy`, (await p.locator('#posts-container').getAttribute('aria-busy')) === null);
    await p.locator('.story-card').first().click(); await p.waitForSelector('#storyModal.show'); await p.waitForTimeout(200);
    const c = await size(p.locator('.story-modal-close'));
    ok(`${vn}: stängknappen ≥44×44`, c.w >= 44 && c.h >= 44, JSON.stringify(c));
    await ctx.close();
  }
  // Laddningstillstånd: Firestore hålls kvar
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.route(/firestore\.googleapis\.com/, () => {});
    await p.goto(BASE); await p.waitForTimeout(800);
    ok('laddning: skelettkort syns', (await p.locator('#posts-container .skeleton-card').count()) === 3 && await p.locator('.skeleton-card').first().isVisible());
    ok('laddning: role=status med text för skärmläsare', /Laddar berättelser/.test(await p.locator('#posts-container [role=status]').textContent()));
    ok('laddning: aria-busy på listan', (await p.locator('#posts-container').getAttribute('aria-busy')) === 'true');
    await ctx.close();
  }
  // Utan JS: skelettet finns redan i HTML:en (ingen tom yta)
  {
    const ctx = await b.newContext({ javaScriptEnabled: false });
    const p = await ctx.newPage(); await p.goto(BASE);
    ok('utan JS: skelett i statisk HTML', (await p.locator('#posts-container .skeleton-card').count()) === 3);
    await ctx.close();
  }
  // Feltillstånd
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.route(/firestore\.googleapis\.com\/.*\/Write\//, r => r.abort());
    await p.goto(BASE); await p.waitForSelector('.story-card', { timeout: 20000 });
    await p.evaluate(() => showStoriesError());
    const alert = p.locator('#posts-container .error-state[role=alert]');
    ok('fel: vänligt meddelande med role=alert', await alert.isVisible());
    const r = p.locator('#storiesRetry');
    const s = await size(r);
    ok('fel: Försök igen-knapp ≥44px', await r.isVisible() && s.h >= 44, JSON.stringify(s));
    await Promise.all([p.waitForEvent('load'), r.click()]);
    await p.waitForSelector('.story-card', { timeout: 20000 });
    ok('fel: Försök igen laddar om och visar berättelser', (await p.locator('.story-card').count()) > 0);
    await ctx.close();
  }
  await b.close();
  console.log(`\n${n - fails}/${n} passed`);
  process.exit(fails ? 1 : 0);
})();
