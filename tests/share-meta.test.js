// Delningsmetadata på genererade berättelsesidor: säker og:image, alt-texter, ikon, JSON-LD.
// Kör: node tests/share-meta.test.js (ingen nätverksåtkomst, inga Firestore-anrop)
const assert = require('assert');
const path = require('path');
const root = path.join(__dirname, '..');
const SITE_CONFIG = require(path.join(root, 'site-config.js'));
const { generateStoryHTML, pickShareImage } = require(path.join(root, 'generate-pages.js'));
const BASE = SITE_CONFIG.BASE_URL;
let n = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('PASS', m); n++; };
const FALLBACK = `${BASE}/share-image.jpg`;

// pickShareImage
ok(pickShareImage({ content: '<img src="https://chatgpt.com/backend-api/estuary/content?id=x&amp;sig=y">' }) === FALLBACK, 'extern signerad bild-URL ger standardbild');
ok(pickShareImage({ content: '<img src="https://example.com/a.jpg">' }) === FALLBACK, 'annan extern värd i innehållet ger standardbild');
ok(pickShareImage({ image: 'https://example.com/a.jpg' }) === 'https://example.com/a.jpg', 'uttryckligt story.image godtas');
ok(pickShareImage({ image: 'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media&amp;token=t' }) === 'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media&token=t', 'Firebase Storage godtas och &amp; avkodas');
ok(pickShareImage({ content: `<img src="${BASE}/assets/x.webp">` }) === `${BASE}/assets/x.webp`, 'egen sajt godtas');
ok(pickShareImage({ content: '<img src="/assets/images/a.png">' }) === `${BASE}/assets/images/a.png`, 'relativ sökväg görs absolut');
ok(pickShareImage({ content: '<img src="javascript:alert(1)">' }) === FALLBACK, 'javascript: ignoreras');
ok(pickShareImage({}) === FALLBACK, 'ingen bild ger standardbild');

// Genererad HTML
const story = { title: 'Test </script><b>', slug: 'test', content: '<p>Hej på dig.</p><img src="https://chatgpt.com/x?a=1&amp;b=2">' };
const html = generateStoryHTML(story);
const meta = (prop) => { const m = html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`)); return m && m[1]; };
ok(meta('og:image') === FALLBACK && meta('twitter:image') === FALLBACK, 'og/twitter:image = standardbild när innehållsbilden är extern');
ok(!/chatgpt\.com/.test(html.split('<body')[0]), 'ingen extern bild-URL i <head>');
ok(!/&amp;amp;/.test(html), 'ingen dubbelkodning (&amp;amp;)');
ok(!!meta('og:image:alt') && meta('og:image:alt') === meta('twitter:image:alt'), 'og:image:alt och twitter:image:alt finns');
ok(meta('og:image:width') === '1200' && meta('og:image:height') === '630', 'mått för standardbilden');
ok(meta('og:site_name') === SITE_CONFIG.SITE_NAME, 'og:site_name = SITE_NAME');
ok(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" \/>/.test(html), 'apple-touch-icon');
ok(/<meta name="theme-color"/.test(html), 'theme-color');
const ldm = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
ok(!!ldm, 'JSON-LD finns');
const ld = JSON.parse(ldm[1]);
ok(ld['@type'] === 'Article' && ld.headline === story.title && ld.inLanguage === 'sv', 'JSON-LD Article med rubrik och språk');
ok(ld.isPartOf.name === SITE_CONFIG.SITE_NAME && ld.publisher.name === SITE_CONFIG.SITE_NAME, 'JSON-LD använder SITE_NAME');
ok(ld.audience.audienceType.includes(SITE_CONFIG.TARGET_AGE), 'JSON-LD målgrupp från TARGET_AGE');
ok(!/<\/script><b>/.test(ldm[1]), 'titel kan inte bryta ut ur JSON-LD');
ok(ld.url === `${BASE}/stories/test.html`, 'JSON-LD url = canonical på befintlig domän');
// Egen bild (Firebase Storage) behåller sin bild, utan standardmått
const h2 = generateStoryHTML({ title: 'B', slug: 'b', content: '<p>x</p>', image: 'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media' });
ok(/og:image" content="https:\/\/firebasestorage/.test(h2) && !/og:image:width/.test(h2), 'egen Storage-bild används, inga påhittade mått');
console.log(`${n} kontroller OK`);
