// Enhetstest: og-/twitter-taggar i genererade berättelsesidor (fejkade berättelser, ingen Firestore).
// Kör: node tests/og-tags.test.js
const assert = require('assert');
const path = require('path');
const root = path.join(__dirname, '..');
const CFG = require(path.join(root, 'site-config.js'));
const { generateStoryHTML, pickShareImage } = require(path.join(root, 'generate-pages.js'));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('PASS', m); n++; };
const meta = (html, attr, key) => {
  const m = html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`));
  return m ? m[1] : null;
};

const longText = 'Det var en gång en liten igelkott som bodde vid havet. '.repeat(6);
const withImg = { title: 'Igelkotten & havet', slug: 'igelkotten-och-havet', image: 'https://example.com/bild.webp', content: `<p>${longText}</p>` };
let h = generateStoryHTML(withImg);
ok(meta(h, 'property', 'og:title') === 'Igelkotten &amp; havet', 'og:title = berättelsens titel (escapad)');
ok(meta(h, 'property', 'og:type') === 'article', 'og:type = article');
ok(meta(h, 'property', 'og:url') === `${CFG.BASE_URL}/stories/igelkotten-och-havet.html`, 'og:url = sidans kanoniska URL');
ok(meta(h, 'property', 'og:image') === 'https://example.com/bild.webp', 'og:image = berättelsens bild');
const d = meta(h, 'property', 'og:description');
ok(d && d.startsWith('Det var en gång') && d.endsWith('...') && d.length <= 160, 'og:description = kort utdrag');
ok(meta(h, 'property', 'og:site_name') === CFG.SITE_NAME, 'og:site_name från SITE_NAME');
ok(meta(h, 'name', 'twitter:card') === 'summary_large_image', 'twitter:card = summary_large_image');
ok(meta(h, 'name', 'twitter:title') && meta(h, 'name', 'twitter:image') === 'https://example.com/bild.webp', 'twitter-titel och bild');

h = generateStoryHTML({ title: 'Utan bild', content: '<p>Kort.</p>' });
ok(meta(h, 'property', 'og:image') === `${CFG.BASE_URL}/share-image.jpg`, 'standardbild när berättelsen saknar bild');
ok(meta(h, 'property', 'og:description') === 'Kort.', 'kort text utan ellips');

ok(pickShareImage({ content: '<img src="https://cdn.example.org/a.jpg" alt="">' }) === 'https://cdn.example.org/a.jpg', 'första <img> i innehållet används');
ok(pickShareImage({ image: 'assets/images/story/x.webp' }) === `${CFG.BASE_URL}/assets/images/story/x.webp`, 'relativ bild görs absolut');
ok(pickShareImage({ image: 'javascript:alert(1)' }) === `${CFG.BASE_URL}/share-image.jpg`, 'ogiltig URL -> standardbild');
ok(pickShareImage({ image: 'http://osaker.example/a.jpg' }) === `${CFG.BASE_URL}/share-image.jpg`, 'http (ej https) -> standardbild');

const old = CFG.SITE_NAME;
CFG.SITE_NAME = 'Testnamn';
h = generateStoryHTML({ title: 'T', content: 'x' });
CFG.SITE_NAME = old;
ok(meta(h, 'property', 'og:site_name') === 'Testnamn' && h.includes('<title>T - Testnamn</title>'), 'namnet följer SITE_NAME (inget hårdkodat)');
console.log(`\nOK: ${n} test`);
