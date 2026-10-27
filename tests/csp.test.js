// Test: varje externt <script src> och varje externt import-from i HTML-filerna måste vara tillåtet av
// script-src i Content-Security-Policy-Report-Only i netlify.toml, och CSP:n måste fortfarande vara Report-Only.
// Kör: node tests/csp.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('PASS', m); n++; };

const toml = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
ok(!/^\s*Content-Security-Policy\s*=/m.test(toml), 'ingen verkställande CSP (endast Report-Only)');
const m = toml.match(/^\s*Content-Security-Policy-Report-Only\s*=\s*"([^"]+)"/m);
ok(!!m, 'Content-Security-Policy-Report-Only finns i netlify.toml');
const dirs = {};
m[1].split(';').map(s => s.trim()).filter(Boolean).forEach(d => { const [k, ...v] = d.split(/\s+/); dirs[k] = v; });
const scriptSrc = dirs['script-src'];
ok(Array.isArray(scriptSrc), 'script-src finns');
ok(scriptSrc.includes('https://cdn.jsdelivr.net'), 'script-src tillåter https://cdn.jsdelivr.net');
ok(scriptSrc.includes('https://www.gstatic.com'), 'script-src tillåter fortfarande https://www.gstatic.com');

const files = ['index.html', 'integritet.html'];
const origins = new Set();
for (const f of files) {
  const html = fs.readFileSync(path.join(root, f), 'utf8');
  for (const r of html.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)["']/g)) origins.add(new URL(r[1]).origin);
  for (const r of html.matchAll(/from\s+["'](https?:\/\/[^"']+)["']/g)) origins.add(new URL(r[1]).origin);
}
ok(origins.size >= 2, 'hittade externa skriptkällor: ' + [...origins].join(', '));
for (const o of origins) ok(scriptSrc.includes(o), 'script-src tillåter ' + o);
console.log(`\n${n} kontroller OK`);
