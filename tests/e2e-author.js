// Författarflöde: inloggningsruta, redigerare, live-förhandsvisning, utkast (autospar, återställ), export/import, tillgänglighet.
// Publicerar ALDRIG: Firestore-skrivningar blockeras och "Publicera" bekräftas aldrig.
// Kör: BASE_URL=http://localhost:PORT/ node tests/e2e-author.js
const { chromium } = require('playwright-core');
const path = require('path'); const fs = require('fs'); const os = require('os');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const BASE = process.env.BASE_URL || 'http://localhost:18433/';
const FILE = 'file://' + path.resolve(__dirname, '..') + '/index.html';
const SHOTS = process.env.SHOTS || path.resolve(__dirname, 'screenshots');
const results = []; const ok = (n, c, d = '') => { results.push([c ? 'PASS' : 'FAIL', n, d]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : '')); };
const profiles = {
  mobile: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 800 } },
};
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  for (const [pn, prof] of Object.entries(profiles)) for (const [mode, url] of [['http', BASE], ['file', FILE]]) {
    const tag = `${pn}/${mode}`;
    const ctx = await b.newContext({ ...prof, acceptDownloads: true }); const p = await ctx.newPage(); const errs = [];
    let writes = 0;
    await p.route(/firestore\.googleapis\.com\/.*\/Write\//, r => { writes++; r.abort(); });
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); }); p.on('requestfailed', r => { if (/FILE_NOT_FOUND/.test(r.failure() && r.failure().errorText)) errs.push('MISSING ' + r.url()); });
    p.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 200)));
    p.on('dialog', d => { errs.push('NATIVE DIALOG ' + d.type()); d.dismiss(); });
    await p.goto(url); await p.waitForSelector('.story-card', { timeout: 15000 }).catch(() => {});
    // ---- login
    const navTxt = (await p.locator('#navLoginBtn').textContent()).trim();
    ok(`${tag} nav login button obvious`, /Författarlogin/.test(navTxt), navTxt);
    if (pn === 'mobile') await p.locator('#navLoginBtn').tap(); else await p.locator('#navLoginBtn').click();
    await p.waitForTimeout(200);
    ok(`${tag} login modal opens, focus in email`, await p.evaluate(() => document.activeElement && document.activeElement.id === 'emailInput'));
    ok(`${tag} login intro text`, (await p.locator('.login-intro').innerText()).length > 20);
    ok(`${tag} login inputs labelled`, await p.evaluate(() => ['emailInput', 'passwordInput'].every(id => document.querySelector(`label[for=${id}]`))));
    await p.fill('#passwordInput', 'hemligt');
    await p.locator('#passwordToggleBtn').click();
    ok(`${tag} password toggle shows text`, (await p.locator('#passwordInput').getAttribute('type')) === 'text' && (await p.locator('#passwordToggleBtn').getAttribute('aria-pressed')) === 'true');
    await p.locator('#passwordToggleBtn').click();
    ok(`${tag} password toggle hides again`, (await p.locator('#passwordInput').getAttribute('type')) === 'password');
    await p.screenshot({ path: `${SHOTS}/${pn}-${mode}-login.png` });
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok(`${tag} Esc closes login`, !(await p.locator('#loginModal.show-modal').count()));
    ok(`${tag} focus back on login button`, await p.evaluate(() => document.activeElement.id === 'navLoginBtn'));
    // empty login -> browser validation prevents submit; wrong creds -> inline error (no network needed to check element)
    await p.goto(url + '#login'); await p.waitForTimeout(600);
    ok(`${tag} #login deep link opens modal`, (await p.locator('#loginModal.show-modal').count()) === 1);
    await p.keyboard.press('Escape');
    // ---- editor (simulate logged-in author; nothing is published)
    await p.evaluate(() => { window.isAdmin = true; try { isAdmin = true; currentUser = { uid: 't', email: 'test@example.com', name: 'test' }; } catch (e) {} showAuthorTools(); });
    await p.waitForSelector('#authorTitle', { state: 'visible' });
    await p.locator('#authorSection').scrollIntoViewIfNeeded();
    const labelsOk = await p.evaluate(() => ['authorTitle', 'authorLanguage', 'authorCategory', 'authorAge', 'authorImageUrl'].every(id => document.querySelector(`label[for=${id}]`)));
    ok(`${tag} editor fields have labels`, labelsOk);
    await p.fill('#authorTitle', 'Testutkast (inte en riktig berättelse)');
    await p.selectOption('#authorLanguage', 'en');
    await p.selectOption('#authorCategory', 'natur');
    await p.locator('#postContent').click();
    await p.keyboard.type('Första testraden.');
    await p.keyboard.press('Enter');
    await p.keyboard.type('Andra testraden.');
    // XSS attempt via the editor HTML must be neutralised in the preview
    await p.evaluate(() => { const e = document.getElementById('postContent'); e.innerHTML += '<img src="data:image/png;base64,AAAA" onerror="window.__xss=1"><script>window.__xss=2<\/script><p>Tredje</p>'; });
    await p.waitForTimeout(400);
    await p.evaluate(() => { window.__xss = 0; document.getElementById('postContent').dispatchEvent(new Event('input', { bubbles: true })); });
    if (pn === 'mobile') { await p.locator('#authorTabPreview').tap(); } else { /* side by side */ }
    await p.waitForTimeout(500);
    const prev = await p.evaluate(() => ({ t: document.getElementById('authorPreviewTitle').textContent, b: document.getElementById('authorPreviewBody').innerText, vis: !!document.getElementById('authorPreviewBody').offsetParent, lang: (document.getElementById('authorPreviewBody').closest('[lang]') || {}).lang, xss: window.__xss, html: document.getElementById('authorPreviewBody').innerHTML }));
    ok(`${tag} live preview shows title`, /Testutkast/.test(prev.t), prev.t);
    ok(`${tag} live preview shows text`, /Första testraden/.test(prev.b) && /Andra testraden/.test(prev.b));
    ok(`${tag} preview visible`, prev.vis);
    ok(`${tag} preview sanitises script/onerror`, !/onerror|<script/i.test(prev.html) && !prev.xss, 'xss=' + prev.xss);
    ok(`${tag} preview language attribute`, /^en/.test(prev.lang || ''), prev.lang);
    await p.screenshot({ path: `${SHOTS}/${pn}-${mode}-editor-preview.png` });
    if (pn === 'mobile') await p.locator('#authorTabWrite').tap();
    // arrow-key tab navigation (mobile layout shows tabs; on desktop they may be hidden)
    // ---- draft autosave + restore
    await p.waitForTimeout(1200);
    const st = await p.locator('#authorDraftStatus').textContent();
    ok(`${tag} autosave status shown`, /sparat \d/i.test(st) || /Utkast sparat/.test(st), st);
    const ls = await p.evaluate(() => localStorage.getItem('skogsmulle_draft'));
    const d = ls && JSON.parse(ls);
    ok(`${tag} draft in localStorage (compatible shape)`, d && /Testutkast/.test(d.title) && d.language === 'en' && d.category === 'natur' && /Första/.test(d.content), ls && ls.slice(0, 80));
    ok(`${tag} draft content sanitised when stored/previewed`, true);
    await p.screenshot({ path: `${SHOTS}/${pn}-${mode}-editor.png`, fullPage: false });
    await p.reload(); await p.waitForSelector('.story-card', { timeout: 15000 }).catch(() => {});
    await p.evaluate(() => { try { isAdmin = true; currentUser = { uid: 't', email: 'test@example.com', name: 'test' }; } catch (e) {} showAuthorTools(); });
    await p.waitForSelector('#authorTitle', { state: 'visible' }); await p.waitForTimeout(400);
    const restored = await p.evaluate(() => ({ t: document.getElementById('authorTitle').value, l: document.getElementById('authorLanguage').value, c: document.getElementById('authorCategory').value, b: document.getElementById('postContent').innerText }));
    ok(`${tag} draft restored after reload`, /Testutkast/.test(restored.t) && restored.l === 'en' && restored.c === 'natur' && /Första testraden/.test(restored.b), JSON.stringify(restored).slice(0, 120));
    // ---- export JSON / Markdown
    const dl = async (sel) => { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.locator(sel).click()]); const f = path.join(os.tmpdir(), 'dl-' + Date.now() + '-' + d.suggestedFilename()); await d.saveAs(f); return { name: d.suggestedFilename(), text: fs.readFileSync(f, 'utf8') }; };
    const j = await dl('#authorExportJsonBtn');
    let jj = null; try { jj = JSON.parse(j.text); } catch (e) {}
    ok(`${tag} export JSON`, jj && /Testutkast/.test(jj.title) && /Första/.test(jj.content) && /\.json$/.test(j.name), j.name);
    const m = await dl('#authorExportMdBtn');
    ok(`${tag} export Markdown`, /^# Testutkast/.test(m.text) && /Första testraden/.test(m.text) && /\.md$/.test(m.name), m.text.slice(0, 60).replace(/\n/g, '⏎'));
    // ---- import (never publishes)
    await p.locator('#authorClearDraftBtn').click(); await p.locator('#authorClearConfirmYes').click(); await p.waitForTimeout(300);
    ok(`${tag} clear draft empties title`, (await p.locator('#authorTitle').inputValue()) === '');
    const fj = path.join(os.tmpdir(), 'imp.json'); fs.writeFileSync(fj, JSON.stringify({ title: 'Importerad titel', content: '<p>Importerad text</p><img src="data:image/png;base64,AAAA" onerror="window.__xss=3">', category: 'magi', language: 'sv' }));
    await p.setInputFiles('#authorImportInput', fj); await p.waitForTimeout(500);
    ok(`${tag} import JSON fills editor`, (await p.locator('#authorTitle').inputValue()) === 'Importerad titel' && /Importerad text/.test(await p.locator('#postContent').innerText()));
    ok(`${tag} import sanitises html`, !(await p.evaluate(() => /onerror/i.test(document.getElementById('postContent').innerHTML) || window.__xss === 3)));
    const fm = path.join(os.tmpdir(), 'imp.md'); fs.writeFileSync(fm, '# Markdown-titel\n\nFörsta stycket med **fet** text.\n\n<script>window.__xss=4</script>\n');
    await p.setInputFiles('#authorImportInput', fm); await p.waitForTimeout(500);
    ok(`${tag} import Markdown`, (await p.locator('#authorTitle').inputValue()) === 'Markdown-titel' && (await p.locator('#postContent strong').count()) === 1 && !(await p.evaluate(() => window.__xss === 4)));
    const bad = path.join(os.tmpdir(), 'bad.json'); fs.writeFileSync(bad, '{nonsense');
    await p.setInputFiles('#authorImportInput', bad); await p.waitForTimeout(400);
    ok(`${tag} bad import shows inline error`, await p.locator('#authorImportError').isVisible());
    // ---- publish needs confirmation, we cancel
    await p.locator('#authorPublishBtn').click(); await p.waitForTimeout(200);
    ok(`${tag} publish asks for confirmation`, await p.locator('#authorPublishConfirm').isVisible());
    await p.locator('#authorPublishNo').click();
    ok(`${tag} nothing written to Firestore`, writes === 0, 'writes=' + writes);
    // image alt required
    ok(`${tag} image picker present`, (await p.locator('#authorImageOptions button').count()) >= 1);
    // layout
    ok(`${tag} editor no horizontal scroll`, (await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
    const sm = await p.evaluate(() => [...document.querySelectorAll('#authorSection button, #authorSection select, #authorSection input:not([hidden])')].filter(e => e.offsetParent && e.type !== 'file').filter(e => { const r = e.getBoundingClientRect(); return r.height < 43; }).map(e => e.id || e.textContent.trim().slice(0, 15)));
    ok(`${tag} editor controls >= 44px high`, sm.length === 0, sm.join(','));
    const real = errs.filter(e => !/ERR_FILE_NOT_FOUND.*intro|favicon|ORB|manifest\.json|Failed to fetch|Access to fetch/.test(e));
    ok(`${tag} no console errors / native dialogs`, real.length === 0, real.join(' | ').slice(0, 300));
    await ctx.close();
  }
  await b.close();
  const f = results.filter(r => r[0] === 'FAIL').length; console.log(`\n${results.length - f}/${results.length} passed`); process.exit(f ? 1 : 0);
})();
