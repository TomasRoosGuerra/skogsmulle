// Läsarupplevelse (barn 3–12, föräldrar): läsbarhet, tryckytor, lugn rörelse, tillgänglighet, tomt läge, layoutstabilitet.
// Kör: BASE_URL=http://localhost:PORT/ node tests/e2e-reader-ux.js   (kräver playwright-core + Chrome)
// Inget skrivs: Firestore-skrivningar blockeras. Inga publiceringar.
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const BASE = process.env.BASE_URL || 'http://localhost:18433/';
let fails = 0; const ok = (n, c, d = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : '')); };
const profiles = {
  mobile: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 800 } },
};
const px = (p, sel, prop) => p.evaluate(([s, pr]) => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e)[pr]) : NaN; }, [sel, prop]);
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  for (const [pn, prof] of Object.entries(profiles)) {
    const t = pn;
    const open = async (extra = {}) => {
      const ctx = await b.newContext({ ...prof, ...extra }); const p = await ctx.newPage();
      await p.route(/firestore\.googleapis\.com\/.*\/Write\//, r => r.abort());
      await p.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {} });
      await p.goto(BASE); await p.waitForSelector('.story-card', { timeout: 20000 }); await p.waitForTimeout(1200);
      return [ctx, p];
    };
    let [ctx, p] = await open();

    // Landmärken, språk, hoppa-länk
    ok(`${t} html lang=sv`, (await p.getAttribute('html', 'lang')) === 'sv');
    ok(`${t} exactly one main landmark`, (await p.locator('main').count()) === 1);
    ok(`${t} nav + footer landmarks`, (await p.locator('nav').count()) >= 1 && (await p.locator('footer').count()) === 1);
    await p.keyboard.press('Tab'); await p.waitForTimeout(400);
    const skip = await p.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { cls: a.className, top: r.top, bottom: r.bottom }; });
    ok(`${t} skip link is first tab stop and visible on focus`, /skip-link/.test(skip.cls) && skip.top >= 0 && skip.bottom > 0, JSON.stringify(skip));

    // Kort: namn kommer från innehållet (ingen aria-label som motsäger synlig text), tangentbord, fokusring
    const card = p.locator('.story-card').first();
    ok(`${t} card has no overriding aria-label (label-in-name)`, !(await card.getAttribute('aria-label')) && !(await card.getAttribute('aria-labelledby')));
    ok(`${t} card is a focusable button`, (await card.getAttribute('role')) === 'button' && (await card.getAttribute('tabindex')) === '0');
    ok(`${t} card icon is decorative and has width/height (no layout shift)`, await card.locator('img').first().evaluate(i => i.getAttribute('alt') === '' && +i.getAttribute('width') > 0 && +i.getAttribute('height') > 0 && i.loading === 'lazy'));
    await card.focus();
    const ring = await card.evaluate(e => parseFloat(getComputedStyle(e).outlineWidth));
    ok(`${t} focused card has visible focus ring >= 2px`, ring >= 2, ring + 'px');
    await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    ok(`${t} Enter on card opens the story`, await p.locator('#storyModal').isVisible());
    // Läsverktyg: synlig text ingår i namnet (A−, A, A+)
    const btnNames = await p.evaluate(() => [...document.querySelectorAll('.reader-toolbar .reader-btn')].map(b => [b.textContent.trim(), b.getAttribute('aria-label')]));
    const bad = btnNames.filter(([vis, name]) => name && !name.toLowerCase().includes(vis.toLowerCase()));
    ok(`${t} reader buttons: visible text is part of accessible name`, btnNames.length >= 3 && bad.length === 0, JSON.stringify(bad));
    const small = await p.evaluate(() => [...document.querySelectorAll('.reader-toolbar .reader-btn')].filter(b => b.getBoundingClientRect().height < 43.5 || b.getBoundingClientRect().width < 43.5).length);
    ok(`${t} reader buttons >= 44x44`, small === 0, small + ' too small');
    ok(`${t} story body text >= 18px, line-height >= 1.6`, (await px(p, '#storyModalBody', 'fontSize')) >= 18 && (await px(p, '#storyModalBody', 'lineHeight')) / (await px(p, '#storyModalBody', 'fontSize')) >= 1.6);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);

    // Läsbarhet: ingen text under 14px på startsidan
    const tiny = await p.evaluate(() => { const out = []; const w = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.textContent.trim()) continue; const e = n.parentElement; const cs = getComputedStyle(e); if (!e.getClientRects().length || cs.visibility === 'hidden') continue; if (parseFloat(cs.fontSize) < 14) out.push(e.className + ':' + cs.fontSize); } return out; });
    ok(`${t} no visible text under 14px in main`, tiny.length === 0, tiny.slice(0, 4).join(', '));
    ok(`${t} card excerpt >= 15px`, (await px(p, '.story-card-excerpt', 'fontSize')) >= 15);
    ok(`${t} card date + CTA >= 14px`, (await px(p, '.story-card-date', 'fontSize')) >= 14 && (await px(p, '.story-card-cta', 'fontSize')) >= 14);

    // Tryckytor >= 44px
    const targets = await p.evaluate(() => ['.site-nav-link', '.site-nav-login', '.topic-chip'].map(s => [s, [...document.querySelectorAll(s)].filter(e => e.offsetParent).filter(e => e.getBoundingClientRect().height < 43.5).length]));
    ok(`${t} nav links, login and topic chips are >= 44px high`, targets.every(([, n]) => n === 0), JSON.stringify(targets));

    // Tillstånd inte bara med färg
    ok(`${t} selected topic chip shows a check mark (not colour only)`, await p.evaluate(() => { const c = document.querySelector('.topic-chip[aria-pressed="true"]'); return !!c && getComputedStyle(c, '::after').content.includes('\u2713'); }));

    // Nyhetsbrev: anteckningen är inte dämpad (kontrast)
    ok(`${t} newsletter note not dimmed`, await p.evaluate(() => { let e = document.getElementById('newsletterNote'); let o = 1; while (e) { o *= parseFloat(getComputedStyle(e).opacity); e = e.parentElement; } return o === 1; }));
    ok(`${t} newsletter controls still visibly dimmed while inactive`, await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.newsletter-row')).opacity) < 1));

    // Rörelse: entré + hover när rörelse är OK
    ok(`${t} cards animate in when motion is allowed`, (await card.evaluate(e => getComputedStyle(e).animationName)) === 'storyCardIn');
    // Tomt läge (inga berättelser) – lugn, med bild, status-roll
    await p.evaluate(() => { allPosts = []; renderAllPosts(); });
    ok(`${t} empty state: picture (decorative), text, role=status`, await p.evaluate(() => { const e = document.querySelector('.empty-state'); const i = e && e.querySelector('img'); return !!e && e.getAttribute('role') === 'status' && !!i && i.alt === '' && /snart berättelser/.test(e.textContent); }));
    ok(`${t} empty state picture bobs when motion allowed`, (await p.evaluate(() => getComputedStyle(document.querySelector('.empty-state-icon')).animationName)) === 'emptyBob');
    await ctx.close();

    // Layoutstabilitet vid laddning
    [ctx, p] = await open();
    const cls = await p.evaluate(() => window.__cls);
    ok(`${t} cumulative layout shift < 0.1`, cls < 0.1, cls.toFixed(4));

    // Filter utan träffar → "Visa alla berättelser" tar tillbaka listan och fokus till "Alla"
    const cats = await p.evaluate(() => [...document.querySelectorAll('.topic-chip')].map(c => c.dataset.category).filter(Boolean));
    const empty = await p.evaluate(cs => cs.find(c => !allPosts.some(x => (x.category || '').toLowerCase() === c)), cats);
    if (empty) {
      await p.click(`.topic-chip[data-category="${empty}"]`);
      ok(`${t} empty filter shows reset button`, await p.locator('#emptyStateReset').isVisible());
      await p.click('#emptyStateReset');
      ok(`${t} reset button restores all stories`, (await p.locator('.story-card').count()) === (await p.evaluate(() => allPosts.length)));
      ok(`${t} reset moves focus to "Alla"`, await p.evaluate(() => document.activeElement.dataset.category === ''));
    } else console.log('SKIP empty-filter test: every category has stories');
    await ctx.close();

    // prefers-reduced-motion: ingen entré-/hover-/gungrörelse
    [ctx, p] = await open({ reducedMotion: 'reduce' });
    ok(`${t} reduced motion: no card entrance animation`, (await p.locator('.story-card').first().evaluate(e => getComputedStyle(e).animationName)) === 'none');
    await p.evaluate(() => { allPosts = []; renderAllPosts(); });
    ok(`${t} reduced motion: empty state does not bob`, (await p.evaluate(() => getComputedStyle(document.querySelector('.empty-state-icon')).animationName)) === 'none');
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
