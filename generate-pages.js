#!/usr/bin/env node

/**
 * Static Story Page & Sitemap Generator för Skogsmulle
 * 
 * Detta script genererar statiska HTML-sidor för varje berättelse och en sitemap.
 * FAIL-SAFE: Om Firestore inte är nåbar bygger sajten ändå (utan berättelsesidor).
 * 
 * Användning:
 *   node generate-pages.js
 * 
 * Kräver FIREBASE_SERVICE_ACCOUNT miljövariabel för Firestore-åtkomst.
 * I Netlify: sätt miljövariabeln i Build & deploy > Environment.
 */

const fs = require('fs');
const path = require('path');

// Ladda site config
const SITE_CONFIG = require('./site-config.js');

const STORIES_DIR = path.join(__dirname, 'stories');
const SITEMAP_PATH = path.join(__dirname, 'sitemap.xml');

// Skapa stories-katalog om den inte finns
if (!fs.existsSync(STORIES_DIR)) {
  fs.mkdirSync(STORIES_DIR, { recursive: true });
}

// Gemensam funktion för att generera slug
function generateSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Generera HTML för en berättelsesida
function generateStoryHTML(story) {
  const slug = story.slug || generateSlug(story.title);
  const storyUrl = `/stories/${slug}.html`;
  const excerpt = story.content
    .replace(/<[^>]*>/g, '')
    .substring(0, 150)
    .trim();

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${story.title} - ${SITE_CONFIG.SITE_NAME}</title>
  <meta name="description" content="${excerpt}..." />
  <meta property="og:title" content="${story.title}" />
  <meta property="og:description" content="${excerpt}..." />
  <meta property="og:url" content="${SITE_CONFIG.BASE_URL}${storyUrl}" />
  <meta property="og:image" content="${SITE_CONFIG.BASE_URL}/share-image.jpg" />
  <link rel="canonical" href="${SITE_CONFIG.BASE_URL}${storyUrl}" />
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
      <a href="/">Hem</a> / <a href="/#stories">Berättelser</a> / <span>${story.title}</span>
    </nav>
    <article>
      <h1>${story.title}</h1>
      <div class="meta">
        ${story.category ? `📂 ${story.category}` : ''} 
        ${story.age ? `👶 ${story.age}` : ''} 
        ${story.date ? `📅 ${story.date}` : ''}
      </div>
      <div class="content">
        ${story.content}
      </div>
      <a href="/" class="back-link">← Tillbaka till alla berättelser</a>
    </article>
  </div>
</body>
</html>`;
}

// Generera sitemap
function generateSitemap(stories) {
  const today = new Date().toISOString().split('T')[0];
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_CONFIG.BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_CONFIG.BASE_URL}/integritet.html</loc>
    <lastmod>${today}</lastmod>
    <priority>0.5</priority>
  </url>
`;

  stories.forEach(story => {
    const slug = story.slug || generateSlug(story.title);
    const date = story.timestamp
      ? new Date(story.timestamp).toISOString().split('T')[0]
      : today;
    
    xml += `  <url>
    <loc>${SITE_CONFIG.BASE_URL}/stories/${slug}.html</loc>
    <lastmod>${date}</lastmod>
    <priority>0.8</priority>
  </url>
`;
  });

  xml += '</urlset>\n';
  return xml;
}

// Försök hämta berättelser från Firestore
async function fetchStoriesFromFirestore() {
  // Kontrollera om Firebase service account finns
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!serviceAccountJson) {
    console.log('⚠️  FIREBASE_SERVICE_ACCOUNT miljövariabel saknas');
    console.log('   Bygger sajten utan statiska berättelsesidor (fail-safe)');
    console.log('   För att generera berättelsesidor: sätt miljövariabeln i Netlify');
    return [];
  }

  try {
    // Dynamisk import av firebase-admin
    const admin = require('firebase-admin');
    const serviceAccount = JSON.parse(serviceAccountJson);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: SITE_CONFIG.FIREBASE_CONFIG.projectId
      });
    }

    const db = admin.firestore();
    const snapshot = await db.collection('posts')
      .orderBy('createdAt', 'desc')
      .get();

    const stories = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      stories.push({
        id: doc.id,
        title: data.title || 'Utan titel',
        content: data.content || '',
        date: data.date || '',
        category: data.category || '',
        age: data.age || '',
        slug: data.slug || generateSlug(data.title || ''),
        timestamp: data.createdAt?.toMillis() || Date.now()
      });
    });

    console.log(`✓ Hämtade ${stories.length} berättelser från Firestore`);
    return stories;

  } catch (error) {
    console.log('⚠️  Kunde inte hämta berättelser från Firestore:', error.message);
    console.log('   Bygger sajten utan statiska berättelsesidor (fail-safe)');
    return [];
  }
}

// Huvudfunktion
async function main() {
  console.log(`\n🌲 ${SITE_CONFIG.SITE_NAME} - Story Page Generator\n`);

  // Försök hämta berättelser (fail-safe)
  const stories = await fetchStoriesFromFirestore();

  if (stories.length > 0) {
    // Generera HTML-sidor
    let generatedCount = 0;
    for (const story of stories) {
      const slug = story.slug || generateSlug(story.title);
      const html = generateStoryHTML(story);
      const filepath = path.join(STORIES_DIR, `${slug}.html`);
      
      fs.writeFileSync(filepath, html, 'utf8');
      generatedCount++;
    }
    console.log(`✓ Genererade ${generatedCount} berättelsesidor i /stories/`);

    // Generera sitemap
    const sitemap = generateSitemap(stories);
    fs.writeFileSync(SITEMAP_PATH, sitemap, 'utf8');
    console.log(`✓ Genererade sitemap.xml med ${stories.length + 2} URL:er`);

  } else {
    // Generera minimal sitemap utan berättelser
    const sitemap = generateSitemap([]);
    fs.writeFileSync(SITEMAP_PATH, sitemap, 'utf8');
    console.log('✓ Genererade minimal sitemap.xml (endast startsida och integritetspolicy)');
  }

  console.log('\n✓ Build slutförd\n');
}

// Kör endast om detta är huvudmodulen
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Build-fel:', error);
    // Fail gracefully - returnera 0 så att bygget fortsätter
    process.exit(0);
  });
}

module.exports = { generateStoryHTML, generateSlug, generateSitemap };
