// Riktig Firebase Auth mot sajten, när testkonto finns i miljövariabler.
// Default utan secrets: SKIP (exit 0). Stub-sviten tests/e2e-auth.js är CI-default.
//
//   SKOGSTROLLET_TEST_EMAIL=... SKOGSTROLLET_TEST_PASSWORD=... \
//   BASE_URL=https://skogsmulle.netlify.app/ node tests/e2e-auth-live.js
//
// Se docs/AUTH-TESTKONTO.md. Inga lösenord i repot. Inga Firestore-skrivningar.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5077/';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const EMAIL = (process.env.SKOGSTROLLET_TEST_EMAIL || '').trim();
const PASS = process.env.SKOGSTROLLET_TEST_PASSWORD || '';

let pass = 0, fail = 0, skip = 0;
const ok = (m, c, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x ? ' — ' + x : '')); } };
const skipped = (m) => { skip++; console.log('SKIP ' + m); };

(async () => {
  if (!EMAIL || !PASS) {
    skipped('SKOGSTROLLET_TEST_EMAIL / SKOGSTROLLET_TEST_PASSWORD saknas — se docs/AUTH-TESTKONTO.md');
    console.log(`0/0 passed (${skip} skipped)`);
    process.exit(0);
  }
  if (/@(gmail|outlook|hotmail|icloud)\./i.test(EMAIL)) {
    fail++; console.log('FAIL använd en fake-adress utan personuppgifter (inte privat mejl)');
    process.exit(1);
  }

  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  // En viewport: riktig Auth är långsam/kostsam; stubben täcker mobil+desktop.
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  let writes = 0;
  await ctx.route(/firestore\.googleapis\.com\/.*\/Write\//, r => { writes++; r.abort(); });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));

  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.story-card', { timeout: 25000 }).catch(() => {});
  ok('berättelselistan laddas', await p.locator('.story-card').count() > 0);

  // Rensa eventuell kvarvarande session
  await p.evaluate(() => {
    try { localStorage.removeItem('skogsmulle_authHint'); } catch (e) {}
  });
  // Om redan inloggad: logga ut först
  const nav = p.locator('#navLoginBtn');
  await nav.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  const navText = ((await nav.innerText().catch(() => '')) || '');
  if (/logga ut/i.test(navText)) {
    await nav.click();
    await p.waitForTimeout(1500);
  }

  ok('författarsektion dold när utloggad', !(await p.locator('#authorSection').isVisible()));

  // Fel lösenord
  await nav.click();
  await p.waitForSelector('#emailInput', { state: 'visible', timeout: 10000 });
  // Se till att Auth-modulen hunnit laddas (deferred)
  await p.waitForFunction(() => typeof window.firebaseSignInWithEmailAndPassword === 'function' || typeof window.ensureAuth === 'function', null, { timeout: 15000 }).catch(() => {});
  await p.fill('#emailInput', EMAIL);
  await p.fill('#passwordInput', PASS + '-fel');
  await p.locator('#loginSubmitBtn').click();
  await p.waitForTimeout(2500);
  ok('fel lösenord ger ingen inloggning', await p.evaluate(() => !window.isAdmin) && !(await p.locator('#authorSection').isVisible()));

  // Rätt lösenord
  await p.fill('#passwordInput', PASS);
  await p.locator('#loginSubmitBtn').click();
  await p.waitForSelector('#authorSection', { state: 'visible', timeout: 20000 }).catch(() => {});
  ok('inloggning med e-post/lösenord visar författarverktyg', await p.locator('#authorSection').isVisible() && await p.evaluate(() => !!window.isAdmin));
  ok('nav visar utloggning', /logga ut/i.test(await nav.innerText()), await nav.innerText());

  await p.locator('.story-card').first().click();
  await p.waitForTimeout(800);
  ok('Edit/Delete synliga för inloggad', await p.evaluate(() => {
    const a = document.getElementById('storyModalAdminActions');
    return a && !a.hidden && !!document.getElementById('storyModalEditBtn') && !!document.getElementById('storyModalDeleteBtn');
  }));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);

  // Session efter omladdning
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#authorSection', { state: 'visible', timeout: 20000 }).catch(() => {});
  ok('sessionen finns kvar efter omladdning', await p.locator('#authorSection').isVisible() && await p.evaluate(() => !!window.isAdmin));

  // Skrivflöde: publicera fångas — Write-routes abortas
  await p.evaluate(() => { localStorage.removeItem('skogsmulle_draft'); });
  if (await p.locator('#authorTitle').count() === 0) {
    await p.evaluate(() => { if (window.Author && window.Author.open) window.Author.open(); });
  }
  await p.waitForSelector('#authorTitle', { state: 'visible', timeout: 8000 }).catch(() => {});
  const title = 'Live-auth-test ' + Date.now();
  await p.fill('#authorTitle', title);
  await p.locator('#postContent').click();
  await p.keyboard.type('Ett två tre fyra fem sex sju åtta.');
  const cat = await p.evaluate(() => {
    const s = document.getElementById('authorCategory');
    return s && s.options.length > 1 ? s.options[1].value : null;
  });
  if (cat) await p.selectOption('#authorCategory', cat);
  const age = await p.evaluate(() => {
    const s = document.getElementById('authorAge');
    return s && s.options.length > 1 ? s.options[1].value : null;
  });
  if (age) await p.selectOption('#authorAge', age);

  // Stubba C.save lokalt om Write-abort ger fel — men försök först riktig väg med abort
  await p.locator('#authorPublishBtn').click();
  await p.locator('#authorPublishYes').click();
  await p.waitForTimeout(2000);
  const publishOutcome = await p.evaluate(() => ({
    err: !!(document.getElementById('authorPublishError') && !document.getElementById('authorPublishError').hidden),
    ok: !!(document.getElementById('authorSuccessBanner') && !document.getElementById('authorSuccessBanner').hidden),
    draft: !!localStorage.getItem('skogsmulle_draft')
  }));
  // Antingen fel (Write avbruten) med kvarvarande text, eller — om klienten stubbar — success. Båda OK så länge ingen Write gick igenom.
  ok('skrivflödet körs utan Firestore-skrivning', writes === 0 && (publishOutcome.err || publishOutcome.ok || publishOutcome.draft), JSON.stringify(publishOutcome) + ' writes=' + writes);

  // Utloggning
  await nav.click();
  await p.waitForTimeout(1500);
  ok('utloggning döljer författarverktyg', !(await p.locator('#authorSection').isVisible()) && await p.evaluate(() => !window.isAdmin));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  ok('utloggad efter omladdning', !(await p.locator('#authorSection').isVisible()) && await p.evaluate(() => !window.isAdmin));
  ok('inga sidfel', errs.length === 0, errs.join(' | '));
  ok('inga Firestore-skrivningar', writes === 0);

  await ctx.close();
  await b.close();
  console.log(`${pass}/${pass + fail} passed (${skip} skipped)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
