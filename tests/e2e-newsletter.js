// Nyhetsbrevsblocket: avstängt som standard, aktiveras bara av NEWSLETTER_ENDPOINT, inget tredjepartsskript.
// Kör: BASE_URL=http://localhost:PORT/ node tests/e2e-newsletter.js   (kräver playwright-core + Chrome)
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const BASE = process.env.BASE_URL || 'http://localhost:18433/';
let fails = 0;
const ok = (n, c, d = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : '')); };
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const setup = async (cfgPatch) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage(); const posts = [];
    await p.route(/firestore\.googleapis\.com\/.*\/Write\//, r => r.abort());
    await p.route(/(gstatic|jsdelivr)/, r => r.abort());
    await p.route('https://newsletter.example.test/**', async r => { posts.push({ m: r.request().method(), body: r.request().postData(), ct: r.request().headers()['content-type'] }); await r.fulfill({ status: cfgPatch && cfgPatch.fail ? 500 : 200, body: 'ok', headers: { 'access-control-allow-origin': '*' } }); });
    if (cfgPatch && cfgPatch.endpoint !== undefined) {
      await p.route('**/site-config.js', async r => { const res = await r.fetch(); let t = await res.text(); t = t.replace(/NEWSLETTER_ENDPOINT: '[^']*'/, `NEWSLETTER_ENDPOINT: '${cfgPatch.endpoint}'`); await r.fulfill({ response: res, body: t }); });
    }
    await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#newsletter', { state: 'attached' });
    return { p, posts };
  };
  // 1. Standard: avstängt
  let { p, posts } = await setup();
  ok('block present', await p.locator('#newsletter').count() === 1);
  ok('state inactive', await p.locator('#newsletter').getAttribute('data-state') === 'inactive');
  ok('email disabled', await p.locator('#newsletterEmail').isDisabled());
  ok('button disabled', await p.locator('#newsletterSubmit').isDisabled());
  ok('only one form field (email)', await p.locator('#newsletterForm input:not([type=submit])').count() === 1);
  ok('inactive text visible', await p.locator('#newsletterInactive').isVisible());
  ok('rubrik', (await p.locator('#newsletterTitle').innerText()).includes('Nya berättelser i inkorgen'));
  ok('double opt-in note', /bekräftar anmälan/.test(await p.locator('#newsletterNote').innerText()));
  ok('link to integritet', await p.locator('#newsletterNote a[href="integritet.html"]').count() === 1);
  ok('label tied to input', await p.locator('label[for=newsletterEmail]').count() === 1);
  ok('visibly inactive (opacity<1, button not-allowed)', await p.evaluate(() => getComputedStyle(document.querySelector('#newsletterForm .newsletter-row')).opacity < 1 /* only the controls are dimmed; the note keeps AA contrast */ && getComputedStyle(document.getElementById('newsletterSubmit')).cursor === 'not-allowed'));
  await p.evaluate(() => { const i = document.getElementById('newsletterEmail'); i.disabled = false; i.value = 'a@b.se'; document.getElementById('newsletterForm').requestSubmit(); });
  await p.waitForTimeout(300);
  ok('forced submit sends nothing', posts.length === 0);
  const thirdParty = await p.evaluate(() => [...document.querySelectorAll('script[src],link[rel=stylesheet]')].map(e => e.src || e.href).filter(u => !u.startsWith(location.origin)));
  ok('no new third-party resources (only existing gstatic/jsdelivr)', thirdParty.every(u => /jsdelivr\.net\/npm\/dompurify/.test(u)), thirdParty.join(','));
  // 2. Ogiltig/ohttps endpoint => fortfarande avstängt
  ({ p, posts } = await setup({ endpoint: 'http://insecure.example.test/x' }));
  ok('http endpoint ignored (inactive)', await p.locator('#newsletter').getAttribute('data-state') === 'inactive');
  // 3. Giltig endpoint => aktiv
  ({ p, posts } = await setup({ endpoint: 'https://newsletter.example.test/subscribe' }));
  ok('state active', await p.locator('#newsletter').getAttribute('data-state') === 'active');
  ok('inputs enabled', await p.locator('#newsletterEmail').isEnabled() && await p.locator('#newsletterSubmit').isEnabled());
  ok('inactive text hidden when active', !(await p.locator('#newsletterInactive').isVisible()));
  await p.fill('#newsletterEmail', 'inte-en-adress'); await p.click('#newsletterSubmit');
  ok('invalid address message, nothing sent', /Kontrollera att e-postadressen/.test(await p.locator('#newsletterStatus').innerText()) && posts.length === 0);
  await p.fill('#newsletterEmail', 'foraldra@example.com'); await p.click('#newsletterSubmit');
  await p.waitForFunction(() => /Tack!/.test(document.getElementById('newsletterStatus').textContent), null, { timeout: 5000 });
  ok('POST with only email', posts.length === 1 && posts[0].m === 'POST' && posts[0].body === 'email=foraldra%40example.com' && /x-www-form-urlencoded/.test(posts[0].ct), JSON.stringify(posts[0]));
  ok('confirm message mentions confirmation mail', /bekräfta/.test(await p.locator('#newsletterStatus').innerText()));
  // 4. Fel från tjänsten
  ({ p, posts } = await setup({ endpoint: 'https://newsletter.example.test/subscribe', fail: true }));
  await p.fill('#newsletterEmail', 'foraldra@example.com'); await p.click('#newsletterSubmit');
  await p.waitForFunction(() => /Något gick fel/.test(document.getElementById('newsletterStatus').textContent), null, { timeout: 5000 });
  ok('server error message', true);
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
