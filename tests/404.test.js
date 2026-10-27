// Test: riktig 404 i stället för catch-all-rewrite till index.html.
// Kör: node tests/404.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('PASS', m); n++; };
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const toml = read('netlify.toml');
// Plocka ut alla [[redirects]]-block
const redirects = [...toml.matchAll(/\[\[redirects\]\]([\s\S]*?)(?=\n\[\[|\n*$)/g)].map(m => {
  const g = k => (m[1].match(new RegExp('^\\s*' + k + '\\s*=\\s*"([^"]*)"', 'm')) || [])[1];
  const st = m[1].match(/^\s*status\s*=\s*(\d+)/m);
  return { from: g('from'), to: g('to'), status: st && +st[1], force: /^\s*force\s*=\s*true/m.test(m[1]) };
});
ok(redirects.length >= 1, 'hittade redirects i netlify.toml');
ok(!redirects.some(r => r.from === '/*'), 'ingen catch-all-redirect "/*" kvar (annars blir allt 200 i stället för 404)');
ok(!redirects.some(r => r.to === '/index.html' && r.status === 200), 'ingen "-> /index.html 200"-rewrite kvar');
ok(redirects.some(r => r.from === '/stories/*' && r.to === '/#stories' && !r.force), '/stories/* -> /#stories finns kvar och är inte force (riktiga /stories/<slug>.html vinner)');

// Appen använder hash-routing, inga SPA-vägar
const app = read('index.html');
const pushes = [...app.matchAll(/history\.(?:pushState|replaceState)\([^;]*;/g)].map(m => m[0]);
ok(pushes.length > 0, 'hittade history-anrop i index.html');
ok(/location\.hash/.test(app) && !/location\.pathname\.(?:split|match|startsWith)/.test(app), 'appen routar via hash, inte via path');

// 404.html
const f404 = path.join(root, '404.html');
ok(fs.existsSync(f404), '404.html finns i roten (publish = ".")');
const h = read('404.html');
ok(/<html lang="sv"/.test(h), '404.html är på svenska (lang=sv)');
ok(/Sidan[^<]*finns inte|hittades inte/i.test(h), '404.html säger tydligt att sidan inte finns');
ok(/<a[^>]+href="\/"/.test(h), '404.html länkar hem (href="/")');
ok(/name="robots" content="noindex/.test(h), '404.html är noindex');
ok(!/(src|href)="(?!\/|#|mailto:|https?:)/.test(h), '404.html använder bara rotrelativa länkar (fungerar på alla djup)');
ok(/SITE_CONFIG\.SITE_NAME/.test(h) && !/Skogsmulle/.test(h), '404.html hämtar namnet från SITE_NAME, ingen hårdkodad namnsträng');
ok(!/https?:\/\/(?!skogsmulle\.netlify\.app)/.test(h.replace(/<style[\s\S]*?<\/style>/, '')), '404.html laddar inga externa resurser');
console.log(`\n${n} kontroller OK`);
