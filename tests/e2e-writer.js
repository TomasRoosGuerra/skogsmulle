// Skribentupplevelse: dolda paneler, ordräknare, autospar-status, genvägar, publicera-bekräftelse,
// bild via adress, text går inte förlorad vid fel, redigering rör inte utkastet, bekräftad radering.
// Publicerar ALDRIG och raderar ALDRIG: Firestore-skrivningar blockeras och C.save/C.update ersätts i testet.
// Kör: BASE_URL=http://localhost:PORT/ node tests/e2e-writer.js
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const BASE = process.env.BASE_URL || 'http://localhost:18433/';
const results = []; const ok = (n, c, d = '') => { results.push([c ? 'PASS' : 'FAIL', n, d]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : '')); };
const profiles = {
  mobile: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 800 } },
};
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  for (const [pn, prof] of Object.entries(profiles)) {
    const tag = pn;
    const ctx = await b.newContext(prof); const p = await ctx.newPage(); const errs = [];
    let writes = 0;
    await p.route(/firestore\.googleapis\.com\/.*\/Write\//, r => { writes++; r.abort(); });
    p.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 200)));
    p.on('dialog', d => { errs.push('NATIVE DIALOG ' + d.type()); d.dismiss(); });
    await p.goto(BASE); await p.waitForSelector('.story-card', { timeout: 15000 }).catch(() => {});
    await p.evaluate(() => { localStorage.removeItem('skogsmulle_draft'); window.isAdmin = true; try { isAdmin = true; currentUser = { uid: 't', email: 'test@example.com', name: 'test' }; } catch (e) {} showAuthorTools(); });
    await p.waitForSelector('#authorTitle', { state: 'visible' });
    await p.locator('#authorSection').scrollIntoViewIfNeeded();

    // ---- hidden stays hidden (display:flex used to beat the hidden attribute)
    for (const id of ['authorClearConfirm', 'authorPublishConfirm', 'authorSuccessBanner', 'authorEditBanner', 'authorPublishError', 'authorInlineImagePanel', 'authorImportError']) {
      ok(`${tag} #${id} hidden at start`, !(await p.locator('#' + id).isVisible()));
    }

    // ---- order: title -> text -> settings
    const order = await p.evaluate(() => { const y = id => document.getElementById(id).getBoundingClientRect().top; return y('authorTitle') < y('postContent') && y('postContent') < y('authorCategory'); });
    ok(`${tag} editor comes before the settings`, order);

    // ---- accessibility attributes on the editor
    const attrs = await p.evaluate(() => { const e = document.getElementById('postContent'); return { role: e.getAttribute('role'), multi: e.getAttribute('aria-multiline'), lb: e.getAttribute('aria-labelledby') }; });
    ok(`${tag} editor is a labelled multiline textbox`, attrs.role === 'textbox' && attrs.multi === 'true' && attrs.lb === 'authorContentLabel', JSON.stringify(attrs));

    // ---- empty publish: inline message + focus on the title, no confirm panel
    await p.locator('#authorPublishBtn').click();
    ok(`${tag} empty publish shows inline problem`, await p.locator('#authorPublishError').isVisible() && /Titel saknas/.test(await p.locator('#authorPublishError').innerText()));
    ok(`${tag} empty publish moves focus to title`, await p.evaluate(() => document.activeElement.id === 'authorTitle'));
    ok(`${tag} empty publish opens no confirmation`, !(await p.locator('#authorPublishConfirm').isVisible()));

    // ---- typing: word count, reading time, autosave state
    await p.fill('#authorTitle', 'Skrivtest (ingen riktig berättelse)');
    ok(`${tag} typing hides old publish problem`, !(await p.locator('#authorPublishError').isVisible()));
    ok(`${tag} word count starts at 0`, /^0 ord$/.test((await p.locator('#authorWordCount').innerText()).trim()));
    await p.locator('#postContent').click();
    await p.keyboard.type('Ett två tre fyra fem sex sju åtta nio tio.');
    await p.waitForTimeout(100);
    const wc = (await p.locator('#authorWordCount').innerText()).trim();
    ok(`${tag} word count + reading time`, /^10 ord · ca 1 min högläsning$/.test(wc), wc);
    ok(`${tag} unsaved state visible right after typing`, (await p.locator('#authorDraftStatus').getAttribute('data-state')) === 'dirty', await p.locator('#authorDraftStatus').innerText());
    await p.waitForTimeout(1300);
    const st = (await p.locator('#authorDraftStatus').innerText()).trim();
    ok(`${tag} autosave status says "Utkast sparat HH:MM"`, /^Utkast sparat \d\d:\d\d$/.test(st) && (await p.locator('#authorDraftStatus').getAttribute('data-state')) === 'saved', st);
    ok(`${tag} status is a live region`, (await p.locator('#authorDraftStatus').getAttribute('role')) === 'status');

    // ---- Ctrl+S saves immediately
    await p.keyboard.type(' Elva.');
    await p.keyboard.press('Control+s');
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('skogsmulle_draft') || '{}').content || '');
    ok(`${tag} Ctrl+S saves the draft at once`, /Elva/.test(saved), saved.slice(-30));

    // ---- toolbar: fits width, aria-pressed follows bold
    const tb = await p.evaluate(() => { const w = window.innerWidth; return [...document.querySelectorAll('.editor-toolbar button')].every(x => { const r = x.getBoundingClientRect(); return r.left >= 0 && r.right <= w + 1; }); });
    ok(`${tag} toolbar buttons all inside the viewport`, tb);
    await p.keyboard.press('Control+a');
    await p.keyboard.press('Control+b');
    await p.waitForTimeout(100);
    ok(`${tag} bold button reflects state (aria-pressed)`, (await p.locator('[data-cmd=bold]').getAttribute('aria-pressed')) === 'true');
    await p.keyboard.press('Control+b');
    await p.keyboard.press('End');

    // ---- inline image by URL
    await p.locator('[data-cmd=image]').click();
    ok(`${tag} image panel opens, focus in URL field`, await p.locator('#authorInlineImagePanel').isVisible() && await p.evaluate(() => document.activeElement.id === 'authorInlineImageUrl') && (await p.locator('[data-cmd=image]').getAttribute('aria-expanded')) === 'true');
    await p.fill('#authorInlineImageUrl', 'http://exempel.se/a.jpg');
    await p.locator('#authorInlineImageInsert').click();
    ok(`${tag} http:// image address rejected`, await p.locator('#authorInlineImageError').isVisible() && (await p.locator('#postContent img').count()) === 0);
    await p.fill('#authorInlineImageUrl', 'https://exempel.se/a.jpg');
    await p.locator('#authorInlineImageInsert').click();
    ok(`${tag} alt text is required for a body image`, await p.locator('#authorInlineImageError').isVisible() && /alt/i.test(await p.locator('#authorInlineImageError').innerText()) && (await p.locator('#postContent img').count()) === 0);
    await p.fill('#authorInlineImageAlt', 'En ekorre på en gren');
    await p.keyboard.press('Enter');
    const img = await p.evaluate(() => { const i = document.querySelector('#postContent img'); return i && { src: i.getAttribute('src'), alt: i.getAttribute('alt') }; });
    ok(`${tag} image inserted with src + alt`, img && img.src === 'https://exempel.se/a.jpg' && img.alt === 'En ekorre på en gren', JSON.stringify(img));
    ok(`${tag} image panel closed and focus back in editor`, !(await p.locator('#authorInlineImagePanel').isVisible()) && await p.evaluate(() => document.activeElement.id === 'postContent'));
    const pv = await p.evaluate(() => document.getElementById('authorPreviewBody').innerHTML);
    await p.waitForTimeout(300);
    ok(`${tag} preview keeps the image and its alt`, /<img[^>]+alt="En ekorre/.test(await p.evaluate(() => document.getElementById('authorPreviewBody').innerHTML)), pv.slice(0, 60));
    // Esc closes the panel
    await p.locator('[data-cmd=image]').click(); await p.keyboard.press('Escape');
    ok(`${tag} Esc closes the image panel`, !(await p.locator('#authorInlineImagePanel').isVisible()));
    // pasted image address opens the panel prefilled instead of inserting loose text
    await p.locator('#postContent').click();
    await p.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'https://exempel.se/b.png'); document.getElementById('postContent').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
    ok(`${tag} pasted image URL opens the panel prefilled`, await p.locator('#authorInlineImagePanel').isVisible() && (await p.locator('#authorInlineImageUrl').inputValue()) === 'https://exempel.se/b.png');
    await p.locator('#authorInlineImageCancel').click();

    // ---- Ctrl+Enter only asks; summary + focus; Esc returns focus
    await p.locator('#postContent').click();
    await p.keyboard.press('Control+Enter');
    ok(`${tag} Ctrl+Enter opens the confirmation (does not publish)`, await p.locator('#authorPublishConfirm').isVisible() && writes === 0);
    const cf = (await p.locator('#authorPublishConfirmText').innerText());
    ok(`${tag} confirmation names the story and word count`, /Skrivtest/.test(cf) && /\d+ ord/.test(cf), cf);
    ok(`${tag} focus moves to the confirmation`, await p.evaluate(() => document.activeElement.id === 'authorPublishConfirmText'));
    await p.keyboard.press('Escape');
    ok(`${tag} Esc closes confirmation, focus on Publicera`, !(await p.locator('#authorPublishConfirm').isVisible()) && await p.evaluate(() => document.activeElement.id === 'authorPublishBtn'));

    // ---- failure keeps all text (C.save is replaced; nothing leaves the page)
    await p.evaluate(() => { window.__origSave = window.C.save; window.C.save = () => Promise.reject(new Error('test-fel')); localStorage.removeItem('skogsmulle_draft'); });
    const before = await p.evaluate(() => document.getElementById('postContent').innerHTML);
    await p.locator('#authorPublishBtn').click();
    await p.locator('#authorPublishYes').click();
    await p.waitForTimeout(400);
    ok(`${tag} failed publish shows a persistent inline error`, await p.locator('#authorPublishError').isVisible() && /Din text är kvar/.test(await p.locator('#authorPublishError').innerText()));
    ok(`${tag} failed publish keeps title and text`, (await p.locator('#authorTitle').inputValue()).startsWith('Skrivtest') && (await p.evaluate(() => document.getElementById('postContent').innerHTML)) === before);
    ok(`${tag} failed publish saves a draft as safety net`, await p.evaluate(() => !!localStorage.getItem('skogsmulle_draft')));
    ok(`${tag} publish button usable again after failure`, await p.locator('#authorPublishBtn').isEnabled() && await p.locator('#authorPublishYes').isEnabled());
    await p.evaluate(() => { window.C.save = () => Promise.resolve('test-id-1'); });
    await p.locator('#authorPublishBtn').click();
    await p.locator('#authorPublishYes').click();
    await p.waitForSelector('#authorSuccessBanner:not([hidden])', { timeout: 3000 });
    ok(`${tag} success banner shown and focus moves to "Visa berättelsen"`, await p.evaluate(() => document.activeElement.id === 'authorViewStoryBtn'));
    ok(`${tag} editor emptied + status reset after success`, (await p.locator('#authorTitle').inputValue()) === '' && /Inget utkast/.test(await p.locator('#authorDraftStatus').innerText()) && /^0 ord$/.test((await p.locator('#authorWordCount').innerText()).trim()));
    ok(`${tag} published draft removed`, await p.evaluate(() => !localStorage.getItem('skogsmulle_draft')));
    await p.evaluate(() => { window.C.save = window.__origSave; });

    // ---- editing a published story must not overwrite a pending new-story draft
    await p.fill('#authorTitle', 'Pågående nytt utkast');
    await p.locator('#postContent').click(); await p.keyboard.type('Detta är ett riktigt utkast.');
    await p.waitForTimeout(1200);
    await p.evaluate(() => window.Author.open({ id: 'x1', title: 'Publicerad', content: '<p>Gammal text</p>', category: '', age: '', language: 'sv', date: '1 Jan, 2026', timestamp: 1 }));
    ok(`${tag} edit banner visible while editing`, await p.locator('#authorEditBanner').isVisible());
    await p.locator('#postContent').click(); await p.keyboard.press('End'); await p.keyboard.type(' Ändrad.');
    await p.waitForTimeout(1200);
    ok(`${tag} edit state is explained`, /Ändringar ej uppdaterade/.test(await p.locator('#authorDraftStatus').innerText()));
    const dr = await p.evaluate(() => JSON.parse(localStorage.getItem('skogsmulle_draft') || '{}'));
    ok(`${tag} editing leaves the pending draft untouched`, dr.title === 'Pågående nytt utkast', dr.title);
    await p.locator('#authorCancelEditBtn').click();
    ok(`${tag} cancelling the edit restores the pending draft`, (await p.locator('#authorTitle').inputValue()) === 'Pågående nytt utkast' && !(await p.locator('#authorEditBanner').isVisible()));

    // ---- preview button / back (mobile tabs)
    if (pn === 'mobile') {
      await p.locator('#authorPreviewBtn').click();
      ok(`${tag} preview button switches to preview`, await p.locator('#authorPanelPreview').isVisible() && !(await p.locator('#authorPanelWrite').isVisible()));
      await p.locator('#authorPreviewBack').click();
      ok(`${tag} back button returns to the text`, await p.locator('#authorPanelWrite').isVisible() && await p.evaluate(() => document.activeElement.id === 'postContent'));
      const tabIdx = await p.evaluate(() => [document.getElementById('authorTabWrite').tabIndex, document.getElementById('authorTabPreview').tabIndex]);
      ok(`${tag} tabs use roving tabindex`, tabIdx[0] === 0 && tabIdx[1] === -1, tabIdx.join(','));
    } else {
      ok(`${tag} preview sits beside the editor (no extra button)`, !(await p.locator('#authorPreviewBtn').isVisible()) && await p.locator('#authorPanelPreview').isVisible());
    }

    // ---- delete asks first (never confirmed here)
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator('.story-card').first().click(); await p.waitForTimeout(500);
    await p.locator('#storyModalDeleteBtn').click();
    ok(`${tag} delete asks for confirmation first`, await p.locator('#storyModalDeleteConfirm').isVisible() && await p.evaluate(() => document.activeElement.id === 'storyModalDeleteConfirmText'));
    await p.locator('#storyModalDeleteNo').click();
    ok(`${tag} cancelling delete keeps the story open`, !(await p.locator('#storyModalDeleteConfirm').isVisible()) && await p.locator('#storyModal.show').count() === 1);
    ok(`${tag} nothing written or deleted`, writes === 0, 'writes=' + writes);
    ok(`${tag} no page errors / native dialogs`, errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
  await b.close();
  const f = results.filter(r => r[0] === 'FAIL').length; console.log(`\n${results.length - f}/${results.length} passed`); process.exit(f ? 1 : 0);
})();
