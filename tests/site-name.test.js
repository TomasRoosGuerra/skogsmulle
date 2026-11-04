// Kontrollerar att sajtens synliga namn kommer från SITE_NAME och att det gamla namnet
// inte finns kvar i synlig text/metadata. Domän, Firebase-id och interna nycklar undantas.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m); } };
const root = path.join(__dirname, '..');
global.window = {};
const cfgSrc = fs.readFileSync(path.join(root, 'site-config.js'), 'utf8');
const SITE_CONFIG = new Function(cfgSrc + '; return SITE_CONFIG;')();
const NAME = SITE_CONFIG.SITE_NAME;
ok(NAME === 'Skogstrollet', 'SITE_NAME är Skogstrollet');
ok(SITE_CONFIG.TARGET_AGE === '3–12 år', 'TARGET_AGE oförändrad');
ok(/skogsmulle-c601d/.test(cfgSrc), 'Firebase-projekt-id oförändrat');
// Ta bort tillåtna interna förekomster innan sökning efter gammalt namn
const strip = (s) => s
  .replace(/skogsmulle\.netlify\.app/g, '')
  .replace(/skogsmulle-c601d/g, '')
  .replace(/skogsmulle_[a-zA-Z]+/g, '')
  .replace(/skogsmulleStory/g, '')
  .replace(/Skogsmulle\.mp3/g, '');
for (const f of ['index.html', 'integritet.html', '404.html', 'assets/js/app.js', 'assets/css/main.css', 'assets/js/firebase-loader.js', 'assets/js/author.js']) {
  const h = fs.readFileSync(path.join(root, f), 'utf8');
  ok(!/skogsmulle/i.test(strip(h)), `${f}: inget synligt gammalt namn`);
}
ok(/DEFAULT_SITE_NAME = "Skogstrollet"/.test(fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8')), 'app.js DEFAULT_SITE_NAME = Skogstrollet');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [re, m] of [
  [/<title id="pageTitle">Skogstrollet /, 'title'],
  [/og:site_name" id="ogSiteName" content="Skogstrollet /, 'og:site_name'],
  [/id="ogTitle"[\s\S]{0,80}content="Skogstrollet /, 'og:title'],
  [/"name": "Skogstrollet /, 'Schema.org name'],
  [/id="heroTitle">Skogstrollet</, 'hero-rubrik'],
  [/id="footerSiteName">Skogstrollet</, 'sidfot'],
  [/<link rel="canonical" href="https:\/\/skogsmulle\.netlify\.app/, 'canonical pekar kvar på domänen'],
  [/og:url" content="https:\/\/skogsmulle\.netlify\.app/, 'og:url pekar kvar på domänen'],
]) ok(re.test(idx), `index.html ${m}`);
// Genererade sidor + sitemap (exempeldata, utan Firebase)
const out = fs.mkdtempSync('/tmp/sn-');
const env = { ...process.env }; delete env.FIREBASE_SERVICE_ACCOUNT;
try { execFileSync('node', [path.join(root, 'generate-pages.js'), '--out', out], { env, stdio: 'pipe', cwd: root }); } catch (e) {}
const files = [];
(function walk(d) { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(out);
const pages = files.filter(f => /\.(html|xml)$/.test(f));
ok(pages.length > 0, `generate-pages gav ${pages.length} filer`);
const bad = pages.filter(f => /Skogsmulle - |\| Skogsmulle|>Skogsmulle</.test(strip(fs.readFileSync(f, 'utf8'))));
ok(bad.length === 0, 'genererade sidor saknar gammalt sajtnamn i metadata/ram' + (bad.length ? ': ' + bad.join(',') : ''));
const gen = fs.readFileSync(path.join(root, 'generate-pages.js'), 'utf8');
ok(/SITE_CONFIG\.SITE_NAME/.test(gen) && !/['"`][^'"`]*Skogsmulle/.test(gen), 'generate-pages.js tar namnet från SITE_NAME');
console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
