#!/usr/bin/env node

/**
 * Static Story Page & Sitemap Generator för Skogsmulle
 * 
 * Detta script genererar statiska HTML-sidor för varje berättelse och en sitemap.
 * FAIL-SAFE: Om Firestore inte är nåbar bygger sajten ändå (utan berättelsesidor).
 * 
 * Användning:
 *   node generate-pages.js
 *   node generate-pages.js --fixture tests/fixtures/stories.fixture.json --out /tmp/ut
 * 
 * Kräver FIREBASE_SERVICE_ACCOUNT miljövariabel för Firestore-åtkomst.
 * I Netlify: sätt miljövariabeln under Site configuration > Environment variables.
 * Saknas den hoppas berättelsesidorna över (med tydlig logg, exit 0) och
 * sitemap.xml skrivs ändå med de statiska sidorna.
 */

const fs = require('fs');
const path = require('path');

// Ladda site config
const SITE_CONFIG = require('./site-config.js');

const GENERATED_MARKER = '<!-- generated-by: generate-pages.js -->';

/**
 * Sökvägar. Kan styras med flaggor/miljövariabler så att generatorn går att testa
 * utan att röra repots riktiga filer eller Firestore:
 *   --fixture <fil.json>   (eller STORIES_FIXTURE)  läs berättelser från JSON i stället för Firestore
 *   --out <katalog>        (eller PAGES_OUT_DIR)    skriv stories/ och sitemap.xml hit (default: repo-roten)
 */
function parseArgs(argv, env) {
  const opts = {
    fixture: env.STORIES_FIXTURE || '',
    outDir: env.PAGES_OUT_DIR || __dirname
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fixture' && argv[i + 1]) opts.fixture = argv[++i];
    else if (argv[i] === '--out' && argv[i + 1]) opts.outDir = argv[++i];
  }
  opts.outDir = path.resolve(opts.outDir);
  opts.storiesDir = path.join(opts.outDir, 'stories');
  opts.sitemapPath = path.join(opts.outDir, 'sitemap.xml');
  return opts;
}

// HTML-/XML-escape för text och attribut
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Gemensam funktion för att generera slug
function generateSlug(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Ger varje berättelse en unik, giltig slug. Faller tillbaka på id och sist på
 * "berattelse-N" om titeln inte ger något användbart; dubbletter får -2, -3 ...
 */
function assignSlugs(stories) {
  const used = new Set();
  return stories.map((story, index) => {
    let base = generateSlug(story.slug || '') || generateSlug(story.title || '')
      || generateSlug(story.id || '') || `berattelse-${index + 1}`;
    let slug = base;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
    used.add(slug);
    return Object.assign({}, story, { slug });
  });
}

/**
 * Försiktig rensning av berättelsens HTML (försvar på djupet; Firestore är bara
 * skrivbar av ägaren och klienten kör DOMPurify vid visning). Tar bort farliga
 * element, on*-attribut och javascript:/data:-länkar (utom data:image).
 */
function sanitizeContent(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|form|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|form|template|noscript|link|meta|base|input|button|textarea|select)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src|xlink:href|action|formaction)\s*=\s*("|')\s*(javascript:|vbscript:|data:(?!image\/(png|jpe?g|gif|webp|svg\+xml)[;,]))[^"']*\2/gi, '')
    .replace(/\s+(href|src)\s*=\s*(javascript:|vbscript:)[^\s>]*/gi, '');
}

// Hittar externa bilder (annan värd än sajten själv) – de kan blockeras/gå ut.
function findExternalImages(html) {
  const hosts = new Set();
  const re = /<img\b[^>]*\ssrc\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi;
  let m;
  const own = (() => { try { return new URL(SITE_CONFIG.BASE_URL).host; } catch (e) { return ''; } })();
  while ((m = re.exec(String(html || '')))) {
    try {
      const host = new URL(m[1]).host;
      if (host !== own) hosts.add(host);
    } catch (e) { /* ogiltig URL */ }
  }
  return [...hosts];
}

// Delningsbild: berättelsens egen bild (story.image eller första <img> i innehållet), annars standardbild.
// Bara https-URL:er eller sajtrelativa sökvägar godtas; relativa görs absoluta mot BASE_URL.
function pickShareImage(story) {
  const fallback = `${SITE_CONFIG.BASE_URL}/share-image.jpg`;
  const candidates = [];
  if (story && typeof story.image === 'string') candidates.push(story.image.trim());
  const m = String((story && story.content) || '').match(/<img\b[^>]*\bsrc\s*=\s*("|')([^"']+)\1/i);
  if (m) candidates.push(m[2].trim());
  for (const c of candidates) {
    if (!c) continue;
    if (/^https:\/\//i.test(c)) return c;
    if (/^\/?[\w\-./]+\.(png|jpe?g|webp|avif|gif)$/i.test(c) && !c.startsWith('//')) {
      return `${SITE_CONFIG.BASE_URL}/${c.replace(/^\//, '')}`;
    }
  }
  return fallback;
}

// Generera HTML för en berättelsesida
function generateStoryHTML(story) {
  const slug = story.slug || generateSlug(story.title) || 'berattelse';
  const storyUrl = `/stories/${slug}.html`;
  const title = escapeHtml(story.title || 'Utan titel');
  const plain = String(story.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const excerpt = escapeHtml(plain.substring(0, 150).trim());
  const ellipsis = plain.length > 150 ? '...' : '';
  const siteName = escapeHtml(SITE_CONFIG.SITE_NAME);
  const canonical = escapeHtml(`${SITE_CONFIG.BASE_URL}${storyUrl}`);
  const image = escapeHtml(pickShareImage(story));
  const description = `${excerpt}${ellipsis}`;

  return `<!DOCTYPE html>
${GENERATED_MARKER}
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} - ${siteName}</title>
  <meta name="description" content="${excerpt}${ellipsis}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${excerpt}${ellipsis}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:site_name" content="${siteName}" />
  <meta property="og:locale" content="sv_SE" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />
  <link rel="canonical" href="${canonical}" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <script src="/site-config.js"></script>
  <style>
    :root {
      --p: #1a6b5a;
      --bg: #faf8f4;
      --surface: #ffffff;
      --txt: #2a2a2a;
      --txt-muted: #6b7280;
      --br: #e5e2dc;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--bg);
      color: var(--txt);
      line-height: 1.75;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 40px auto;
      padding: 40px;
      background: var(--surface);
      border-radius: 20px;
      border: 1px solid var(--br);
    }
    .breadcrumb { font-size: 0.9rem; margin-bottom: 20px; color: var(--txt-muted); }
    .breadcrumb a { color: var(--p); text-decoration: none; }
    h1 { font-size: 2.5rem; color: var(--p); margin-bottom: 20px; }
    .meta { font-size: 0.9rem; color: var(--txt-muted); margin-bottom: 30px; }
    .content { font-size: 1.2rem; line-height: 1.9; }
    .content p { margin-bottom: 1.2em; }
    .back-link { display: inline-block; margin-top: 30px; color: var(--p); text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <nav class="breadcrumb">
      <a href="/">Hem</a> / <a href="/#stories">Berättelser</a> / <span>${title}</span>
    </nav>
    <article>
      <h1>${title}</h1>
      <div class="meta">
        ${story.category ? `📂 ${escapeHtml(story.category)}` : ''}
        ${story.age ? `👶 ${escapeHtml(story.age)}` : ''}
        ${story.date ? `📅 ${escapeHtml(story.date)}` : ''}
      </div>
      <div class="content">
        ${sanitizeContent(story.content)}
      </div>
      <a href="/" class="back-link">← Tillbaka till alla berättelser</a>
    </article>
  </div>
</body>
</html>`;
}

function validDate(value) {
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

// Generera sitemap. Statiska sidor ingår alltid; berättelser läggs till när sidor finns.
function generateSitemap(stories) {
  const today = new Date().toISOString().split('T')[0];
  const base = SITE_CONFIG.BASE_URL.replace(/\/+$/, '');
  const url = (loc, lastmod, priority) => `  <url>
    <loc>${escapeHtml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${priority}</priority>
  </url>
`;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
  xml += url(`${base}/`, today, '1.0');
  xml += url(`${base}/integritet.html`, today, '0.5');

  assignSlugs(stories).forEach(story => {
    const date = (story.timestamp && validDate(story.timestamp)) || today;
    xml += url(`${base}/stories/${story.slug}.html`, date, '0.8');
  });

  xml += '</urlset>\n';
  return xml;
}

// Läs berättelser från en lokal JSON-fil (test/fixture). Accepterar en array eller {stories: []}.
function loadStoriesFromFixture(file) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.stories;
  if (!Array.isArray(list)) throw new Error('Fixture måste vara en array eller {"stories": [...]}');
  return list.map((d, i) => ({
    id: d.id || `fixture-${i + 1}`,
    title: d.title || '',
    content: d.content || '',
    date: d.date || '',
    category: d.category || '',
    age: d.age || '',
    slug: d.slug || '',
    timestamp: d.timestamp || null
  }));
}

// Försök hämta berättelser från Firestore. Returnerar [] (och loggar tydligt varför) om det inte går.
async function fetchStoriesFromFirestore() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccountJson) {
    console.log('⏭️  HOPPAR ÖVER berättelsesidor: FIREBASE_SERVICE_ACCOUNT saknas.');
    console.log('   Bygget fortsätter (inte ett fel) och sitemap.xml skrivs för de statiska sidorna.');
    console.log('   För att få berättelsesidor: sätt FIREBASE_SERVICE_ACCOUNT i Netlify (Site configuration > Environment variables).');
    return [];
  }

  try {
    const admin = require('firebase-admin');
    const serviceAccount = JSON.parse(serviceAccountJson);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: SITE_CONFIG.FIREBASE_CONFIG.projectId
      });
    }

    const db = admin.firestore();
    const snapshot = await db.collection('posts').orderBy('createdAt', 'desc').get();

    const stories = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      stories.push({
        id: doc.id,
        title: data.title || '',
        content: data.content || '',
        date: data.date || '',
        category: data.category || '',
        age: data.age || '',
        slug: data.slug || '',
        timestamp: data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : null
      });
    });

    console.log(`✓ Hämtade ${stories.length} berättelser från Firestore`);
    return stories;

  } catch (error) {
    console.log('⏭️  HOPPAR ÖVER berättelsesidor: kunde inte hämta från Firestore:', error.message);
    console.log('   Bygget fortsätter och sitemap.xml skrivs för de statiska sidorna.');
    return [];
  }
}

// Tar bort tidigare genererade sidor som inte längre finns (rör aldrig filer utan vår markör)
function removeStalePages(storiesDir, keepSlugs) {
  if (!fs.existsSync(storiesDir)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(storiesDir)) {
    if (!name.endsWith('.html')) continue;
    if (keepSlugs.has(name.slice(0, -5))) continue;
    const file = path.join(storiesDir, name);
    if (fs.readFileSync(file, 'utf8').includes(GENERATED_MARKER)) {
      fs.unlinkSync(file);
      removed++;
    }
  }
  return removed;
}

// Huvudfunktion
async function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parseArgs(argv, env);
  console.log(`\n🌲 ${SITE_CONFIG.SITE_NAME} - Story Page Generator\n`);

  let stories;
  if (opts.fixture) {
    console.log(`ℹ️  Använder fixture ${opts.fixture} i stället för Firestore`);
    stories = loadStoriesFromFixture(opts.fixture);
  } else {
    stories = await fetchStoriesFromFirestore();
  }
  stories = assignSlugs(stories);

  fs.mkdirSync(opts.outDir, { recursive: true });

  if (stories.length > 0) {
    fs.mkdirSync(opts.storiesDir, { recursive: true });
    for (const story of stories) {
      for (const host of findExternalImages(story.content)) {
        console.log(`⚠️  "${story.title}" (${story.slug}) har en bild från extern värd ${host} – kan sluta fungera eller blockeras. Ladda upp bilden till sajten.`);
      }
      fs.writeFileSync(path.join(opts.storiesDir, `${story.slug}.html`), generateStoryHTML(story), 'utf8');
    }
    console.log(`✓ Genererade ${stories.length} berättelsesidor i /stories/`);
  }

  const removed = removeStalePages(opts.storiesDir, new Set(stories.map(s => s.slug)));
  if (removed) console.log(`✓ Tog bort ${removed} gamla genererade sidor som inte längre finns`);

  fs.writeFileSync(opts.sitemapPath, generateSitemap(stories), 'utf8');
  console.log(`✓ Genererade sitemap.xml med ${stories.length + 2} URL:er` +
    (stories.length === 0 ? ' (endast startsida och integritetspolicy)' : ''));

  console.log('\n✓ Build slutförd\n');
  return { stories, opts };
}

// Kör endast om detta är huvudmodulen
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Build-fel:', error);
    // Fail gracefully - returnera 0 så att bygget fortsätter
    process.exit(0);
  });
}

module.exports = { generateStoryHTML, pickShareImage, generateSlug, generateSitemap, assignSlugs, sanitizeContent, escapeHtml, findExternalImages, loadStoriesFromFixture, main };
