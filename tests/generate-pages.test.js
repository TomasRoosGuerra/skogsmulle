// Test för generate-pages.js med lokal fixture (rör varken Firestore eller repots riktiga filer).
// Kör: node tests/generate-pages.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const fixture = path.join(__dirname, 'fixtures', 'stories.fixture.json');
const gen = path.join(root, 'generate-pages.js');
const BASE = require(path.join(root, 'site-config.js')).BASE_URL;
let n = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('PASS', m); n++; };

function run(args, env) {
  const e = Object.assign({}, process.env, env || {});
  delete e.FIREBASE_SERVICE_ACCOUNT;
  Object.assign(e, env || {});
  return spawnSync('node', [gen, ...args], { env: e, encoding: 'utf8' });
}

// 1. Utan variabel och utan fixture: exit 0, tydlig logg, sitemap med statiska sidor, inga story-sidor
let out = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-'));
let r = run(['--out', out]);
ok(r.status === 0, 'saknad FIREBASE_SERVICE_ACCOUNT ger exit 0');
ok(/HOPPAR ÖVER berättelsesidor: FIREBASE_SERVICE_ACCOUNT saknas/.test(r.stdout), 'tydlig loggrad om hoppad generering');
let sm = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
ok(sm.includes(`<loc>${BASE}/</loc>`) && sm.includes(`<loc>${BASE}/integritet.html</loc>`), 'sitemap har startsida + integritet');
ok((sm.match(/<loc>/g) || []).length === 2, 'sitemap har exakt 2 URL:er utan berättelser');
ok(!fs.existsSync(path.join(out, 'stories')), 'ingen stories-katalog skapas utan berättelser');

// 1b. Trasig variabel: ska också hoppa över utan att faila
r = run(['--out', out], { FIREBASE_SERVICE_ACCOUNT: 'inte-json' });
ok(r.status === 0 && /HOPPAR ÖVER berättelsesidor: kunde inte hämta/.test(r.stdout), 'trasig variabel hoppas över med tydlig logg, exit 0');

// 2. Med fixture
out = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-'));
r = run(['--fixture', fixture, '--out', out]);
ok(r.status === 0, 'fixture-körning exit 0');
const files = fs.readdirSync(path.join(out, 'stories')).sort();
ok(files.length === 5, '5 sidor genererade: ' + files.join(', '));
ok(files.includes('testsida-ett.html') && files.includes('testsida-ett-2.html'), 'dubblettitel får unik slug (-2)');
ok(files.includes('fx4.html'), 'tom titel faller tillbaka på id');
sm = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
ok((sm.match(/<loc>/g) || []).length === 7, 'sitemap har 2 statiska + 5 berättelse-URL:er');
files.forEach(f => ok(sm.includes(`<loc>${BASE}/stories/${f}</loc>`), `sitemap innehåller ${f}`));
ok(sm.includes('<lastmod>2026-01-01</lastmod>'), 'lastmod kommer från berättelsens timestamp');
ok([...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].every(m => /^https?:\/\/[A-Za-z0-9._\/-]+$/.test(m[1])), 'alla loc-URL:er är rena (inga specialtecken)');

// 3. Escaping & sanering
const special = fs.readFileSync(path.join(out, 'stories', files.find(f => f.startsWith('asa')) || 'x'), 'utf8');
ok(special.includes('<title>Åsa &amp; &quot;Örjan&quot; &lt;b&gt;test&lt;/b&gt; - '), 'titel escapas i <title>');
ok(!special.includes('<script>x</script>'), 'kategori escapas');
const bad = fs.readFileSync(path.join(out, 'stories', 'farligt-innehall.html'), 'utf8');
const body = bad.slice(bad.indexOf('<div class="content">'));
ok(!/<script|<iframe|onclick|onerror|javascript:/i.test(body), 'farligt innehåll rensat (script/iframe/on*/javascript:)');
ok(body.includes('data:image/png;base64,AAAA'), 'data:image behålls');
ok(/⚠️\s+"Farligt innehåll".*bilder\.example\.test/.test(r.stdout), 'varning om extern bild loggas');

// 4. Gamla genererade sidor städas, handskrivna rörs inte
fs.writeFileSync(path.join(out, 'stories', 'handskriven.html'), '<html>min egen</html>');
const small = path.join(out, 'small.json');
fs.writeFileSync(small, JSON.stringify([{ id: 'a', title: 'Bara en', content: 'x' }]));
r = run(['--fixture', small, '--out', out]);
const after = fs.readdirSync(path.join(out, 'stories')).sort();
ok(after.join() === 'bara-en.html,handskriven.html', 'gamla genererade sidor borttagna, handskriven kvar: ' + after.join(', '));

// 5. Standardkörning rör inte repot när --out anges
ok(!fs.existsSync(path.join(root, 'stories')), 'repo-roten har ingen stories/ efter testet');

console.log(`\nALL PASSED (${n})`);
