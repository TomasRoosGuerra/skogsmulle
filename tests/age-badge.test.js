// Kontrollerar att målgruppen (TARGET_AGE) syns och är synligt renderad.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5077/';
let fails = 0, n = 0;
const ok = (name, c) => { n++; if (!c) fails++; console.log((c ? 'OK   ' : 'FAIL ') + name); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  for (const [label, js, vp] of [['mobil', true, { width: 390, height: 844 }], ['desktop', true, { width: 1280, height: 900 }], ['utan JS', false, { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp, javaScriptEnabled: js });
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'load' });
    const badge = p.locator('.hero .age-badge');
    ok(`${label}: hero-märket synligt`, await badge.isVisible());
    ok(`${label}: hero-märket innehåller '3–12 år'`, (await badge.innerText()).includes('3–12 år'));
    const fs = await badge.evaluate(e => parseFloat(getComputedStyle(e).fontSize));
    ok(`${label}: textstorlek ≥ 14px (${fs})`, fs >= 14);
    const box = await badge.boundingBox();
    ok(`${label}: har yta`, box && box.width > 20 && box.height > 10);
    ok(`${label}: sidfoten nämner '3–12 år'`, (await p.locator('.footer-age').innerText()).includes('3–12 år'));
    ok(`${label}: '3–12 år' i synlig text`, (await p.evaluate(() => document.body.innerText)).includes('3–12 år'));
    if (js) {
      const cfg = await p.evaluate(() => SITE_CONFIG.TARGET_AGE);
      ok(`${label}: texten följer TARGET_AGE`, (await badge.innerText()).includes(cfg));
    }
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `${fails}/${n} FAILED` : `${n}/${n} passed`);
  process.exit(fails ? 1 : 0);
})();
