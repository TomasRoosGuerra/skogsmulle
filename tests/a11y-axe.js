// Automatiserad tillgänglighetskontroll med axe-core (WCAG 2.0/2.1/2.2 A+AA) på startsida, öppen berättelse,
// inloggningsruta och redigerare (simulerad författare, ingen inloggning, inget publiceras).
// Kräver: axe-core (devDependency), playwright-core + Chrome.
// Kör: BASE_URL=http://localhost:PORT/ node tests/a11y-axe.js            (exit 1 vid överträdelser)
//      SHOT_PREFIX=before SHOTS=/sökväg node tests/a11y-axe.js           (sparar även skärmbilder)
//      REPORT_ONLY=1 ...                                                 (exit 0 oavsett, för före/efter-mätning)
const { chromium } = require('playwright-core');
const path = require('path'); const fs = require('fs');
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const BASE = process.env.BASE_URL || 'http://localhost:18433/';
const SHOTS = process.env.SHOTS || ''; const PREFIX = process.env.SHOT_PREFIX || 'axe';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const profiles = {
  mobile: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1280, height: 800 } },
};
let total = 0; const summary = [];
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  for (const [pn, prof] of Object.entries(profiles)) {
    const ctx = await b.newContext(prof); const p = await ctx.newPage();
    await p.route(/firestore\.googleapis\.com\/.*\/Write\//, r => r.abort()); // aldrig skrivningar
    await p.goto(BASE); await p.waitForSelector('.story-card', { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(800);
    const run = async (name, shotName) => {
      await p.evaluate(src => { if (!window.axe) (0, eval)(src); }, axeSource);
      const res = await p.evaluate(tags => window.axe.run(document, { runOnly: { type: 'tag', values: tags } }), TAGS);
      const nodes = res.violations.reduce((n, v) => n + v.nodes.length, 0);
      total += res.violations.length;
      summary.push({ profile: pn, scene: name, rules: res.violations.length, nodes, incomplete: res.incomplete.length, violations: res.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 3).map(n => n.target.join(' ')) })) });
      console.log(`${res.violations.length ? 'VIOL' : 'PASS'} ${pn}/${name}: ${res.violations.length} regler, ${nodes} element (${res.incomplete.length} ofullständiga)`);
      res.violations.forEach(v => console.log(`   - ${v.id} [${v.impact}] x${v.nodes.length}: ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/${PREFIX}-${pn}-${shotName}.png`, fullPage: shotName === 'home' });
    };
    await run('startsida', 'home');
    await p.locator('.story-card').first().scrollIntoViewIfNeeded();
    await p.locator('.story-card').first().click(); await p.waitForTimeout(500);
    await run('berättelse (modal)', 'story'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.goto(BASE + '#login'); await p.waitForTimeout(700);
    await run('inloggningsruta', 'login'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    // Simulerad författare: bara ett klientflagg, ingen autentisering
    await p.evaluate(() => { try { isAdmin = true; currentUser = { uid: 't', email: 'test@example.com', name: 'test' }; } catch (e) {} showAuthorTools(); });
    await p.waitForSelector('#authorTitle', { state: 'visible' }).catch(() => {});
    await p.locator('#authorSection').scrollIntoViewIfNeeded().catch(() => {});
    await p.waitForTimeout(400);
    await run('redigerare', 'editor');
    await ctx.close();
  }
  await b.close();
  const nodes = summary.reduce((n, s) => n + s.nodes, 0);
  console.log(`\nSumma: ${total} överträdande regler (${nodes} element) över ${summary.length} vyer`);
  if (process.env.JSON_OUT) fs.writeFileSync(process.env.JSON_OUT, JSON.stringify(summary, null, 2));
  process.exit(total && !process.env.REPORT_ONLY ? 1 : 0);
})();
