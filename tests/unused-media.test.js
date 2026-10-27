// Test: media som tagits bort (oanvänd, ingen referens) ska inte finnas kvar och ingen fil ska referera till dem.
// Kör: node tests/unused-media.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const root = path.join(__dirname, '..');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('PASS', m); n++; };

const removed = ['introfilm.mp4', 'introfilm.mov', 'assets/images/decor/dekorationer-ark.webp'];
for (const f of removed) ok(!fs.existsSync(path.join(root, f)), `${f} är borttagen`);

const files = execSync('git ls-files -z', { cwd: root }).toString().split('\0').filter(Boolean)
  .filter(f => !/\.(png|jpe?g|webp|mp4|webm|mov|mp3|wav|woff2)$/i.test(f) && f !== 'tests/unused-media.test.js' && f !== 'package-lock.json');
const needles = ['introfilm.mp4', 'introfilm.mov', 'dekorationer-ark'];
for (const nd of needles) {
  const hits = files.filter(f => fs.existsSync(path.join(root, f)) && fs.readFileSync(path.join(root, f), 'utf8').includes(nd));
  ok(hits.length === 0, `ingen textfil refererar till ${nd}` + (hits.length ? ' (träffar: ' + hits.join(', ') + ')' : ''));
}
console.log(`\n${n} kontroller OK`);
