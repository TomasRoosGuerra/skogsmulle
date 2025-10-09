#!/usr/bin/env node

/**
 * Story Page Generator for Skogsmulle
 *
 * This script generates individual HTML pages for each story stored in Firebase.
 * Run this script after deploying to generate static story pages for SEO.
 *
 * Usage: node generate-pages.js
 */

const fs = require("fs");
const path = require("path");

// Configuration
const STORIES_DIR = path.join(__dirname, "stories");
const BASE_URL = "https://skogsmulle.netlify.app";

// Ensure stories directory exists
if (!fs.existsSync(STORIES_DIR)) {
  fs.mkdirSync(STORIES_DIR, { recursive: true });
  console.log("✓ Created stories directory");
}

// Function to generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Function to generate story page HTML
function generateStoryPage(story) {
  const slug = story.slug || generateSlug(story.title);
  const storyUrl = `/stories/${slug}.html`;

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${story.title} - Skogsmulle Barnberättelse</title>
  <meta name="description" content="${
    story.title
  } - Läs denna magiska svenska barnberättelse. ${
    story.category ? "Kategori: " + story.category + "." : ""
  } ${story.age ? "Lämplig för barn " + story.age + "." : ""}" />
  <meta name="keywords" content="svenska sagor,barnberättelser,${story.title},${
    story.category || "berättelse"
  },barn,läsa sagor,Skogsmulle" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <meta property="og:locale" content="sv_SE" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${
    story.title
  } - Skogsmulle Barnberättelse" />
  <meta property="og:description" content="Läs berättelsen ${story.title}. ${
    story.category
      ? "En " + story.category + "-berättelse"
      : "En magisk berättelse"
  } för barn." />
  <meta property="og:url" content="${BASE_URL}${storyUrl}" />
  <meta property="og:site_name" content="Skogsmulle - Svenska Barnböcker" />
  <meta property="og:image" content="${BASE_URL}/igelkotten.png" />
  <meta property="article:published_time" content="${
    story.date ? new Date(story.timestamp).toISOString() : ""
  }" />
  <meta property="article:author" content="Tomas Roos Guerra" />
  ${
    story.category
      ? `<meta property="article:tag" content="${story.category}" />`
      : ""
  }
  <link rel="canonical" href="${BASE_URL}${storyUrl}" />
  
  <!-- Schema.org Article Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${story.title}",
    "description": "${story.title} - En svensk barnberättelse",
    "image": "${BASE_URL}/igelkotten.png",
    "author": {
      "@type": "Person",
      "name": "Tomas Roos Guerra"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Skogsmulle",
      "logo": {
        "@type": "ImageObject",
        "url": "${BASE_URL}/igelkotten.png"
      }
    },
    "datePublished": "${
      story.timestamp ? new Date(story.timestamp).toISOString() : ""
    }",
    "dateModified": "${
      story.timestamp ? new Date(story.timestamp).toISOString() : ""
    }",
    "inLanguage": "sv-SE",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": "${BASE_URL}${storyUrl}"
    }
  }
  </script>
  
  <!-- Breadcrumb Schema -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [{
      "@type": "ListItem",
      "position": 1,
      "name": "Hem",
      "item": "${BASE_URL}"
    },{
      "@type": "ListItem",
      "position": 2,
      "name": "Berättelser",
      "item": "${BASE_URL}/#stories"
    },{
      "@type": "ListItem",
      "position": 3,
      "name": "${story.title}",
      "item": "${BASE_URL}${storyUrl}"
    }]
  }
  </script>
  
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@300;400;500;600;700&family=Nunito:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  
  <style>
    :root {
      --p: #8b4513;
      --s: #a0522d;
      --a: #dc143c;
      --bg: rgba(255, 248, 220, 0.95);
      --txt: #2f4f2f;
      --w: rgba(255, 255, 255, 0.95);
      --lg: rgba(255, 248, 220, 0.8);
      --br: rgba(139, 69, 19, 0.6);
      --r: 8px;
      --f: "Fredoka", "Nunito", sans-serif;
    }
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: var(--f);
    }
    body {
      background: var(--bg);
      color: var(--txt);
      line-height: 1.7;
      font-family: var(--f);
      min-height: 100vh;
      padding: 20px;
    }
    body::before {
      content: "";
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: url("../igelkotten.png") repeat;
      background-size: cover;
      background-position: center;
      filter: blur(2px);
      z-index: -1;
      opacity: 0.3;
    }
    .story-page-container {
      max-width: 800px;
      margin: 40px auto;
      padding: 40px;
      background: var(--w);
      border-radius: 20px;
      border: 3px solid var(--br);
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    }
    .breadcrumb {
      font-size: 0.9rem;
      margin-bottom: 20px;
      color: var(--s);
    }
    .breadcrumb a {
      color: var(--p);
      text-decoration: none;
      transition: color 0.3s ease;
    }
    .breadcrumb a:hover {
      color: var(--a);
      text-decoration: underline;
    }
    .story-header {
      margin-bottom: 30px;
      border-bottom: 3px solid var(--br);
      padding-bottom: 20px;
    }
    .story-title {
      font-size: 2.5rem;
      color: var(--p);
      margin-bottom: 15px;
      line-height: 1.2;
    }
    .story-meta {
      display: flex;
      gap: 15px;
      flex-wrap: wrap;
      align-items: center;
      font-size: 0.95rem;
      color: var(--s);
    }
    .story-date {
      color: var(--a);
    }
    .story-tag {
      background: var(--lg);
      padding: 5px 12px;
      border-radius: 15px;
      border: 1px solid var(--br);
      font-weight: 600;
    }
    .story-content {
      font-size: 1.2rem;
      line-height: 1.9;
      color: var(--txt);
      margin-bottom: 30px;
    }
    .story-content p {
      margin-bottom: 1.2em;
    }
    .story-actions {
      display: flex;
      gap: 15px;
      flex-wrap: wrap;
      margin-top: 40px;
      padding-top: 30px;
      border-top: 2px solid var(--br);
    }
    .btn-primary {
      background: var(--p);
      color: var(--w);
      border: 2px solid var(--br);
      border-radius: var(--r);
      padding: 12px 24px;
      font-size: 1rem;
      font-weight: 600;
      text-decoration: none;
      display: inline-block;
      transition: all 0.3s ease;
      cursor: pointer;
    }
    .btn-primary:hover {
      background: var(--s);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(139,69,19,0.3);
    }
    @media (max-width: 768px) {
      body { padding: 10px; }
      .story-page-container {
        padding: 20px;
        margin: 20px auto;
      }
      .story-title { font-size: 1.8rem; }
      .story-content { font-size: 1.1rem; }
    }
  </style>
</head>
<body>
  <div class="story-page-container">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">🏠 Hem</a> / <a href="/#stories">Berättelser</a> / <span>${
        story.title
      }</span>
    </nav>
    
    <article class="story-article">
      <header class="story-header">
        <h1 class="story-title">${story.title}</h1>
        <div class="story-meta">
          <span class="story-date">📅 ${story.date || "Opublicerad"}</span>
          ${
            story.category
              ? `<span class="story-tag">🏷️ ${story.category}</span>`
              : ""
          }
          ${story.age ? `<span class="story-tag">👶 ${story.age}</span>` : ""}
        </div>
      </header>
      
      <div class="story-content">
        ${story.content}
      </div>
      
      <div class="story-actions">
        <a href="/" class="btn-primary">← Tillbaka till alla berättelser</a>
        <button onclick="window.print()" class="btn-primary">🖨️ Skriv ut</button>
        <button onclick="shareStory()" class="btn-primary">📤 Dela</button>
      </div>
    </article>
  </div>
  
  <script>
    function shareStory() {
      if (navigator.share) {
        navigator.share({
          title: '${story.title.replace(/'/g, "\\'")}',
          text: 'Läs denna magiska berättelse: ${story.title.replace(
            /'/g,
            "\\'"
          )}',
          url: window.location.href
        }).catch(err => console.log('Share failed:', err));
      } else {
        navigator.clipboard.writeText(window.location.href);
        alert('Länken har kopierats!');
      }
    }
  </script>
</body>
</html>`;
}

// Example usage - You would fetch stories from Firebase in production
function generateExampleStories() {
  const exampleStories = [
    {
      title: "Skogsmulles Magiska Dag",
      slug: "skogsmulles-magiska-dag",
      content:
        "<p>En dag när solen sken genom träden, vaknade Skogsmulle till fåglarnas sång...</p>",
      category: "äventyr",
      age: "3-5 år",
      date: "9 Okt, 2025",
      timestamp: Date.now(),
    },
  ];

  exampleStories.forEach((story) => {
    const html = generateStoryPage(story);
    const filename = path.join(STORIES_DIR, `${story.slug}.html`);
    fs.writeFileSync(filename, html, "utf8");
    console.log(`✓ Generated: ${filename}`);
  });

  console.log(`\n✓ Generated ${exampleStories.length} story page(s)`);
  console.log(
    "\nNote: In production, fetch stories from Firebase and generate pages accordingly."
  );
}

// Main execution
if (require.main === module) {
  console.log("🌲 Skogsmulle Story Page Generator\n");
  generateExampleStories();
}

module.exports = { generateStoryPage, generateSlug };
