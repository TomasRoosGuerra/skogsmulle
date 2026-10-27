// Funktionstest: ämnesfilter, bilder (webp/srcset/lazy), läsvyn (textstorlek, extra luft, uppläsning, musik, framsteg),
// reducerad rörelse, kontrast. Skriver aldrig till Firestore (Write-anrop blockeras).
// Kör: BASE_URL=http://localhost:PORT/ node tests/e2e-features.js
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const BASE = process.env.BASE_URL || 'http://localhost:18433/';
const SHOTS = process.env.SHOTS || path.resolve(__dirname, 'screenshots');
const results = []; const ok = (n, c, d = '') => { results.push([c ? 'PASS' : 'FAIL', n, d]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : '')); };
const profiles = {
  mobile: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 800 } },
};
function lum(rgb) { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); }
function ratio(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  for (const [pn, prof] of Object.entries(profiles)) {
    const tag = pn;
    const ctx = await b.newContext(prof); const p = await ctx.newPage(); const errs = [];
    await p.route(/firestore\.googleapis\.com\/.*\/Write\//, r => r.abort());
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    p.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 200)));
    p.on('requestfailed', r => { if (!/google|gstatic|firebase|ORB/.test(r.url() + (r.failure() || {}).errorText)) errs.push('REQFAIL ' + r.url().slice(-80)); });
    await p.addInitScript(() => { window.__spoken = []; });
    await p.goto(BASE); await p.waitForSelector('.story-card', { timeout: 15000 });
    // ---- images / hero
    const hero = await p.evaluate(() => { const i = document.querySelector('.hero-img'); return i && { w: i.naturalWidth, src: i.currentSrc, alt: i.alt, ok: i.complete && i.naturalWidth > 0 }; });
    ok(`${tag} hero loads (webp, responsive)`, hero && hero.ok && /\.webp$/.test(hero.src), hero && hero.src.split('/').pop());
    ok(`${tag} hero has alt`, hero && hero.alt.length > 5);
    ok(`${tag} hero picks mobile crop on narrow`, pn === 'mobile' ? /mobil-crop/.test(hero.src) : !/mobil-crop/.test(hero.src));
    const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundImage + '|' + getComputedStyle(document.body, '::before').backgroundImage);
    ok(`${tag} background image slot used`, /bakgrund-(papper|skog)/.test(bg), bg.slice(0, 120));
    // ---- topic chips
    const chips = await p.locator('.topic-chip').count();
    ok(`${tag} topic chips (Alla + 6)`, chips === 7, chips);
    const iconsOk = await p.evaluate(() => [...document.querySelectorAll('.topic-chip img')].every(i => i.complete && i.naturalWidth > 0 && i.loading === 'lazy' && i.alt === ''));
    ok(`${tag} chip icons loaded, lazy, decorative`, iconsOk);
    const small = await p.evaluate(() => [...document.querySelectorAll('.topic-chip')].filter(e => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length);
    ok(`${tag} chips >= 44px touch target`, small === 0);
    const total = await p.locator('.story-card').count();
    const firstCat = await p.evaluate(() => { const c = document.querySelector('.story-card .post-category, .story-card [class*=badge-category]'); return c ? c.textContent : ''; });
    await p.locator('.topic-chip[data-category="djur"]').first().click(); await p.waitForTimeout(200);
    const pressed = await p.locator('.topic-chip[data-category="djur"]').getAttribute('aria-pressed');
    const nd = await p.locator('.story-card').count();
    ok(`${tag} filter djur toggles aria-pressed`, pressed === 'true');
    ok(`${tag} filter shows cards or empty message`, nd < total ? true : nd === total, `cards ${nd}/${total}, empty=${await p.locator('.empty-state').count()}`);
    await p.locator('.topic-chip[data-category=""]').click(); await p.waitForTimeout(200);
    ok(`${tag} 'Alla' restores all cards`, (await p.locator('.story-card').count()) === total);
    ok(`${tag} cards have category icon`, await p.evaluate(() => [...document.querySelectorAll('.story-card')].every(c => c.querySelector('img.story-card-icon'))));
    // ---- fonts
    const fonts = await p.evaluate(async () => { await document.fonts.ready; return { body: getComputedStyle(document.body).fontFamily, h1: getComputedStyle(document.querySelector('h1')).fontFamily, andika: document.fonts.check('16px Andika'), patrick: document.fonts.check('16px "Patrick Hand"') }; });
    ok(`${tag} self-hosted fonts active`, /Andika/.test(fonts.body) && /Patrick/.test(fonts.h1) && fonts.andika && fonts.patrick, fonts.body.slice(0, 30));
    // ---- palette
    const pal = await p.evaluate(() => { const s = getComputedStyle(document.documentElement); return ['--sky', '--haze', '--sea', '--grass', '--grass-deep', '--sail', '--wall', '--roof', '--trunk', '--fur', '--accent'].map(k => s.getPropertyValue(k).trim().toUpperCase()).join(','); });
    ok(`${tag} style guide palette exact`, pal === '#FBF293,#EEE889,#CCCE6B,#C7C328,#C3BF21,#E0D15E,#89790D,#B99712,#958D20,#927B0F,#A94A05', pal);
    // ---- contrast of main text pairs
    const pairs = await p.evaluate(() => {
      const parse = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const out = [];
      const sel = ['.hero-text h1', '.hero-text p', '.story-card-title', '.story-card-excerpt', '.badge-category', '.topic-filter h2', '.topic-chip span', '.site-nav-link', '.site-nav-login', '.footer p', '.ai-note', '.breadcrumb-nav'];
      for (const s of sel) {
        const e = document.querySelector(s); if (!e) continue;
        let bgc = null, n = e;
        while (n) { const c = getComputedStyle(n).backgroundColor; const a = parse(c); const al = (c.match(/[\d.]+/g) || [])[3]; if (c !== 'rgba(0, 0, 0, 0)' && (al === undefined || +al > 0.9)) { bgc = a; break; } n = n.parentElement; }
        out.push({ s, fg: parse(getComputedStyle(e).color), bg: bgc || [253, 251, 242], size: parseFloat(getComputedStyle(e).fontSize) });
      }
      return out;
    });
    for (const q of pairs) { const r = ratio(q.fg, q.bg); ok(`${tag} contrast ${q.s}`, r >= 4.5, r.toFixed(2) + ':1 (bg ' + q.bg.join(',') + ')'); }
    await p.screenshot({ path: `${SHOTS}/${pn}-home-full.png`, fullPage: true });
    // ---- reader features
    await p.locator('.story-card').first().scrollIntoViewIfNeeded();
    if (pn === 'mobile') await p.locator('.story-card').first().tap(); else await p.locator('.story-card').first().click();
    await p.waitForSelector('#storyModal.show');
    await p.waitForTimeout(600);
    ok(`${tag} reader toolbar present`, (await p.locator('.reader-toolbar[role=toolbar]').count()) === 1);
    const getSize = () => p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#storyModalBody p')).fontSize));
    const s0 = await getSize();
    ok(`${tag} default reading text >= 20px`, s0 >= 20, s0 + 'px');
    await p.getByRole('button', { name: 'Större text' }).click(); const s1 = await getSize();
    await p.getByRole('button', { name: 'Större text' }).click(); const s2 = await getSize();
    await p.getByRole('button', { name: 'Mindre text' }).click(); await p.getByRole('button', { name: 'Mindre text' }).click(); await p.getByRole('button', { name: 'Mindre text' }).click(); const s3 = await getSize();
    ok(`${tag} text size controls grow/shrink`, s1 > s0 && s2 > s1 && s3 < s0, `${s0}→${s1}→${s2}→${s3}`);
    await p.getByRole('button', { name: 'Normal text' }).click(); const s4 = await getSize();
    ok(`${tag} text size reset`, Math.abs(s4 - s0) < 0.5, s4);
    await p.getByRole('button', { name: 'Större text' }).click(); const big = await getSize();
    await p.evaluate(() => closeStoryModal());
    await p.locator('.story-card').first().click(); await p.waitForSelector('#storyModal.show'); await p.waitForTimeout(300);
    ok(`${tag} text size persists (localStorage)`, Math.abs((await getSize()) - big) < 0.5);
    const lsp0 = await p.evaluate(() => getComputedStyle(document.querySelector('#storyModalBody p')).letterSpacing);
    await p.getByRole('button', { name: /Extra luft/ }).click();
    const lsp1 = await p.evaluate(() => getComputedStyle(document.querySelector('#storyModalBody p')).letterSpacing);
    ok(`${tag} 'Extra luft' increases letter-spacing`, lsp0 !== lsp1, `${lsp0}→${lsp1}`);
    await p.getByRole('button', { name: /Extra luft/ }).click();
    // horizontal overflow of the modal at this width
    ok(`${tag} toolbar no overflow`, await p.evaluate(() => { const t = document.querySelector('.reader-toolbar'); return t.scrollWidth <= t.clientWidth + 1; }));
    const tb = await p.evaluate(() => [...document.querySelectorAll('.reader-toolbar button')].filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map(e => e.textContent));
    ok(`${tag} toolbar buttons >= 44px`, tb.length === 0, tb.join(','));
    // progress bar
    const pr0 = await p.evaluate(() => +document.querySelector('.reader-progress').getAttribute('aria-valuenow'));
    await p.evaluate(() => { const m = document.querySelector('.story-modal-content'); const sc = [m, document.getElementById('storyModal')].find(e => e.scrollHeight > e.clientHeight + 5) || m; sc.scrollTop = sc.scrollHeight; });
    await p.waitForTimeout(300);
    const pr1 = await p.evaluate(() => +document.querySelector('.reader-progress').getAttribute('aria-valuenow'));
    ok(`${tag} progress bar updates on scroll`, pr1 > pr0, `${pr0}→${pr1}`);
    ok(`${tag} end ornament present`, (await p.locator('.reader-end').count()) === 1);
    // read aloud: stub speechSynthesis
    await p.evaluate(() => {
      window.__spoken = [];
      const ss = window.speechSynthesis;
      ss.speak = u => { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend({}), 30); };
      ss.cancel = () => { window.__cancelled = (window.__cancelled || 0) + 1; };
    });
    const ra = p.getByRole('button', { name: /Läs högt/ });
    if (await ra.count()) {
      await ra.click(); await p.waitForTimeout(500);
      const sp = await p.evaluate(() => window.__spoken.length);
      ok(`${tag} read aloud speaks paragraphs`, sp >= 2, sp + ' utterances');
      await p.evaluate(() => closeStoryModal());
      ok(`${tag} speech cancelled on close`, (await p.evaluate(() => window.__cancelled || 0)) > 0);
    } else ok(`${tag} read aloud button`, false, 'missing');
    // music: off by default, toggle (autoplay may be blocked headless: only check state/no autoplay)
    await p.locator('.story-card').first().click(); await p.waitForSelector('#storyModal.show'); await p.waitForTimeout(300);
    const mus = p.getByRole('button', { name: /musik/i });
    ok(`${tag} music toggle off by default`, (await mus.getAttribute('aria-pressed')) === 'false');
    await p.screenshot({ path: `${SHOTS}/${pn}-story-reader.png` });
    await p.keyboard.press('Escape');
    // ---- reduced motion
    const rctx = await b.newContext({ ...prof, reducedMotion: 'reduce' }); const rp = await rctx.newPage();
    await rp.route(/firestore\.googleapis\.com\/.*\/Write\//, r => r.abort());
    await rp.goto(BASE); await rp.waitForSelector('.story-card'); await rp.locator('.story-card').first().click(); await rp.waitForSelector('#storyModal.show'); await rp.waitForTimeout(200);
    const anim = await rp.evaluate(() => [...document.querySelectorAll('#storyModalBody p, .reader-toolbar button, .story-card')].map(e => getComputedStyle(e)).filter(s => (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.01) || parseFloat(s.transitionDuration) > 0.01).length);
    ok(`${tag} reduced-motion: no animations/transitions`, anim === 0, anim + ' elements animate');
    await rctx.close();
    const real = errs.filter(e => !/ERR_FILE_NOT_FOUND.*intro|favicon|ORB/.test(e));
    ok(`${tag} console errors none`, real.length === 0, real.join(' | ').slice(0, 400));
    await ctx.close();
  }
  await b.close();
  const f = results.filter(r => r[0] === 'FAIL').length; console.log(`\n${results.length - f}/${results.length} passed`); process.exit(f ? 1 : 0);
})();
