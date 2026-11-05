// E2E för inloggning med uppskjuten Firebase Auth (stub — CI-default).
// firebase-auth.js ersätts med en lokal stub via Playwright-routing.
// Inga riktiga konton eller nycklar används och inga skrivningar når Firestore.
// Kör: BASE_URL=http://localhost:PORT/ node tests/e2e-auth.js
// Riktig Auth (när Tomas skapat testkonto): se tests/e2e-auth-live.js och docs/AUTH-TESTKONTO.md
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5077/';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
let pass = 0, fail = 0;
const ok = (m, c, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? ' — ' + x : '')); } };
const STUB = `
const KEY = '__stubAuthUser'; const ls = [];
let current = JSON.parse(localStorage.getItem(KEY) || 'null');
window.__authModuleLoads = (window.__authModuleLoads || 0) + 1;
const emit = () => ls.forEach(cb => cb(current));
export function getAuth() { return { name: 'stub' }; }
export function onAuthStateChanged(a, cb) { ls.push(cb); setTimeout(() => cb(current), 0); return () => {}; }
export async function signInWithEmailAndPassword(a, email, pw) {
  await new Promise(r => setTimeout(r, 50));
  if (email !== 'test@example.com' || pw !== 'ratt-losen') { const e = new Error('bad'); e.code = 'auth/invalid-credential'; throw e; }
  current = { uid: 'u1', email }; localStorage.setItem(KEY, JSON.stringify(current)); emit(); return { user: current };
}
export async function signOut() { current = null; localStorage.removeItem(KEY); emit(); }
`;
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  for (const [tag, vp] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    const ctx = await b.newContext({ viewport: vp });
    let writes = 0, authFetches = 0;
    await ctx.route(/firebasejs\/12\.3\.0\/firebase-auth\.js/, r => { authFetches++; r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }); });
    await ctx.route(/firestore\.googleapis\.com\/.*\/Write\//, r => { writes++; r.abort(); });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    ok(`${tag} Firebase Auth inte laddad vid första renderingen`, await p.evaluate(() => !window.firebaseAuth));
    ok(`${tag} ingen blockerande Firebase-modul i HTML`, await p.evaluate(() => !document.querySelector('script[type=module]')));
    await p.waitForSelector('.story-card', { timeout: 20000 }).catch(() => {});
    ok(`${tag} berättelselistan hämtas som förut`, await p.locator('.story-card').count() > 0);
    ok(`${tag} författarsektion dold för utloggad`, !(await p.locator('#authorSection').isVisible()));
    await p.locator('.story-card').first().click();
    await p.waitForSelector('#storyModal.show-modal, .story-modal.show-modal', { timeout: 5000 }).catch(() => {});
    ok(`${tag} Edit/Delete dolda för utloggad`, await p.evaluate(() => { const a = document.getElementById('storyModalAdminActions'); return !a || a.hidden; }));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);

    // Fel lösenord
    await p.locator('#navLoginBtn').click();
    await p.waitForSelector('#emailInput', { state: 'visible' });
    await p.fill('#emailInput', 'test@example.com'); await p.fill('#passwordInput', 'fel');
    await p.locator('#loginSubmitBtn').click(); await p.waitForTimeout(600);
    ok(`${tag} fel lösenord ger ingen inloggning`, await p.evaluate(() => !isAdmin) && !(await p.locator('#authorSection').isVisible()));
    // Rätt lösenord
    await p.fill('#passwordInput', 'ratt-losen');
    await p.locator('#loginSubmitBtn').click();
    await p.waitForSelector('#authorSection', { state: 'visible', timeout: 5000 }).catch(() => {});
    ok(`${tag} inloggning med e-post/lösenord visar författarverktyg`, await p.locator('#authorSection').isVisible() && await p.evaluate(() => isAdmin && currentUser.email === 'test@example.com'));
    ok(`${tag} nav-knappen visar utloggning`, /logga ut/i.test(await p.locator('#navLoginBtn').innerText()), await p.locator('#navLoginBtn').innerText());
    await p.locator('.story-card').first().click(); await p.waitForTimeout(400);
    ok(`${tag} Edit/Delete synliga för inloggad`, await p.evaluate(() => { const a = document.getElementById('storyModalAdminActions'); return a && !a.hidden && !!document.getElementById('storyModalEditBtn') && !!document.getElementById('storyModalDeleteBtn'); }));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);

    // Omladdning: sessionen kvar, Auth laddas direkt (ledtråd)
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#authorSection', { state: 'visible', timeout: 8000 }).catch(() => {});
    ok(`${tag} sessionen finns kvar efter omladdning`, await p.locator('#authorSection').isVisible() && await p.evaluate(() => isAdmin));

    // Skrivflöde: publicera fångas lokalt
    await p.evaluate(() => { window.__saved = null; window.firebaseAddDoc = async (r, d) => { window.__saved = d; return { id: 'stub-id' }; }; localStorage.removeItem('skogsmulle_draft'); });
    if (await p.locator('#authorTitle').count() === 0 && (await p.evaluate(() => !!window.Author))) await p.evaluate(() => window.Author.open && window.Author.open());
    await p.waitForSelector('#authorTitle', { state: 'visible', timeout: 5000 }).catch(() => {});
    await p.fill('#authorTitle', 'Authtest');
    await p.locator('#postContent').click(); await p.keyboard.type('Ett två tre fyra fem.');
    const cat = await p.evaluate(() => { const s = document.getElementById('authorCategory'); return s && s.options.length > 1 ? s.options[1].value : null; });
    if (cat) await p.selectOption('#authorCategory', cat);
    const age = await p.evaluate(() => { const s = document.getElementById('authorAge'); return s && s.options.length > 1 ? s.options[1].value : null; });
    if (age) await p.selectOption('#authorAge', age);
    await p.locator('#authorPublishBtn').click(); await p.locator('#authorPublishYes').click();
    await p.waitForSelector('#authorSuccessBanner:not([hidden])', { timeout: 5000 }).catch(() => {});
    const saved = await p.evaluate(() => window.__saved);
    ok(`${tag} skrivflödet publicerar (lokalt fångat)`, saved && saved.title === 'Authtest' && /fyra/.test(saved.content || ''), JSON.stringify(saved || {}).slice(0, 120));
    ok(`${tag} inga skrivningar nådde Firestore`, writes === 0);

    // Utloggning
    await p.locator('#navLoginBtn').click(); await p.waitForTimeout(500);
    ok(`${tag} utloggning döljer författarverktyg`, !(await p.locator('#authorSection').isVisible()) && await p.evaluate(() => !isAdmin));
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4500);
    ok(`${tag} utloggad även efter omladdning`, !(await p.locator('#authorSection').isVisible()) && await p.evaluate(() => !isAdmin));
    ok(`${tag} Auth-modulen hämtades (uppskjutet)`, authFetches > 0);
    ok(`${tag} inga sidfel`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
