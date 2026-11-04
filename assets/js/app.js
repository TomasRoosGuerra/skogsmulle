// Flyttad från inline-<script> i index.html (cachebar).
let isAdmin = false;
let currentUser = null;
let allPosts = [];
let selectedCategory = null; // null = "Alla" (no filter)

// Firebase Authentication är nu aktiverat (27 okt 2026)
const FIREBASE_AUTH_ENABLED = true;
// Ledtråd om att en inloggad session finns, så att Auth kan laddas direkt vid omladdning
const AUTH_HINT_KEY = "skogsmulle_authHint";

// Enda platsen för ett reservnamn om site-config.js inte kunde laddas
// (t.ex. vid file:// eller om filen 404:ar). Den riktiga källan är SITE_CONFIG.SITE_NAME.
const DEFAULT_SITE_NAME = "Skogsmulle";

// Initialisera sajtnamn från konfiguration (robust mot att SITE_CONFIG saknas)
document.addEventListener("DOMContentLoaded", function () {
  const cfg = (typeof SITE_CONFIG !== 'undefined' && SITE_CONFIG) ? SITE_CONFIG : {};
  if (typeof SITE_CONFIG === 'undefined') {
    console.warn('SITE_CONFIG kunde inte laddas, använder standardvärden.');
  }
  const siteName = cfg.SITE_NAME || DEFAULT_SITE_NAME;
  const targetAge = cfg.TARGET_AGE || '3–12 år';
  const copyrightYear = cfg.COPYRIGHT_YEAR || new Date().getFullYear();

  try {
    // Uppdatera alla element med sajtnamn
    document.getElementById('navBrand').textContent = siteName;
    document.getElementById('heroTitle').textContent = siteName;
    document.getElementById('footerSiteName').textContent = siteName;

    // Målgrupp (åldersmärke i hero och sidfot)
    document.querySelectorAll('.js-target-age').forEach(el => { el.textContent = targetAge; });

    // Uppdatera copyright-år
    document.getElementById('copyrightYear').textContent = copyrightYear;

    // Uppdatera meta-taggar
    document.getElementById('pageTitle').textContent = `${siteName} - Magiska barnberättelser för barn ${targetAge}`;
    document.getElementById('ogSiteName').content = `${siteName} - Svenska Barnböcker`;
    document.getElementById('ogTitle').content = `${siteName} - Magiska barnberättelser för barn ${targetAge}`;
    document.getElementById('twitterTitle').content = `${siteName} - Magiska barnberättelser för barn ${targetAge}`;

    // Uppdatera Schema.org
    const schema = document.getElementById('schemaWebSite');
    if (schema) {
      const schemaData = JSON.parse(schema.textContent);
      schemaData.name = `${siteName} - Svenska Barnböcker`;
      schemaData.description = `Svenska sagor och barnberättelser online för barn ${targetAge}`;
      schema.textContent = JSON.stringify(schemaData, null, 2);
    }
  } catch (e) {
    console.warn('Kunde inte uppdatera sajtnamn/metadata:', e);
  }
});


// Story Page Generation System
function generateStorySlug(title) {
  return title
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// NOTE: generateStoryPage function removed from client-side code
// Use generate-pages.js server-side script to create static story pages
async function generateStoryPage(post) {
  const slug = post.slug || generateStorySlug(post.title);
  const storyUrl = "/stories/" + slug + ".html";
  // Return minimal data for client-side use
  return { slug, url: storyUrl, html: "" };
}

// NOTE: Story page HTML generation has been moved to the generate-pages.js file
// That server-side script creates static HTML files for better SEO

// Updated Story CRUD operations
const C = {
  save: async (p) => {
    if (!window.firebaseDb) throw new Error("Firebase not initialized");
    const r = window.firebaseCollection(window.firebaseDb, "posts");
    const slug = generateStorySlug(p.title);
    const d = await window.firebaseAddDoc(r, {
      ...p,
      slug: slug,
      createdAt: window.firebaseServerTimestamp(),
      updatedAt: window.firebaseServerTimestamp(),
    });
    console.log("Post saved:", d.id);

    // Generate individual story page
    const storyData = { ...p, id: d.id, slug, timestamp: Date.now() };
    await generateAndSaveStoryPage(storyData);

    return d.id;
  },
  load: async () => {
    if (!window.firebaseDb) {
      allPosts = [];
      renderAllPosts();
      return;
    }
    const r = window.firebaseCollection(window.firebaseDb, "posts");
    const q = window.firebaseQuery(
      r,
      window.firebaseOrderBy("createdAt", "desc")
    );
    const s = await window.firebaseGetDocs(q);
    allPosts = [];
    s.forEach((d) => {
      const p = d.data();
      allPosts.push({
        id: d.id,
        title: p.title,
        content: p.content,
        date: p.date,
        category: p.category || "",
        age: p.age || "",
        language: p.language || "",
        image: p.image || "",
        imageAlt: p.imageAlt || "",
        slug: p.slug || generateStorySlug(p.title),
        timestamp: p.createdAt?.toMillis() || Date.now(),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      });
    });
    console.log("Posts loaded:", allPosts.length);
    renderAllPosts();
    updateSitemap();
  },
  update: async (id, p) =>
    window.firebaseUpdateDoc(
      window.firebaseDoc(window.firebaseDb, "posts", id),
      { ...p, updatedAt: window.firebaseServerTimestamp() }
    ),
  delete: async (id) =>
    window.firebaseDeleteDoc(
      window.firebaseDoc(window.firebaseDb, "posts", id)
    ),
};
// Exposed so author.js (loaded earlier in the document) can reach it
// from callbacks that only run after this script has finished setup.
window.C = C;

// Friendly error state shown in place of the story grid when Firestore can't be reached
function showStoriesError() {
  const c = document.getElementById("posts-container");
  if (c) {
    c.removeAttribute('aria-busy');
    c.innerHTML = '<div class="error-state" role="alert"><div class="error-state-icon" aria-hidden="true">⚠️</div><p>Kunde inte ladda berättelserna just nu. Kontrollera uppkopplingen och försök igen.</p><button type="button" class="btn empty-state-reset" id="storiesRetry">Försök igen</button></div>';
    const retry = document.getElementById('storiesRetry');
    if (retry) retry.addEventListener('click', () => window.location.reload());
  }
}

function setupRealtimeListener() {
  try {
    if (!window.firebaseDb) {
      console.warn("Firebase not initialized");
      showStoriesError();
      return;
    }
    const r = window.firebaseCollection(window.firebaseDb, "posts");
    const q = window.firebaseQuery(
      r,
      window.firebaseOrderBy("createdAt", "desc")
    );
    window.firebaseOnSnapshot(
      q,
      (s) => {
        allPosts = [];
        s.forEach((d) => {
          const p = d.data();
          allPosts.push({
            id: d.id,
            title: p.title,
            content: p.content,
            date: p.date,
            category: p.category || "",
            age: p.age || "",
            language: p.language || "",
            image: p.image || "",
            imageAlt: p.imageAlt || "",
            slug: p.slug || generateStorySlug(p.title),
            timestamp: p.createdAt?.toMillis() || Date.now(),
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          });
        });
        console.log("Real-time update:", allPosts.length, "posts");
        renderAllPosts();
      },
      (e) => {
        console.error("Real-time listener error:", e);
        showStoriesError();
      }
    );
  } catch (e) {
    console.error("Setup error:", e);
    showStoriesError();
  }
}

// Generate and save story page (client-side indication)
async function generateAndSaveStoryPage(post) {
  try {
    const storyPage = await generateStoryPage(post);
    console.log(`Story page data prepared for: ${post.title}`);
    console.log(`URL: ${storyPage.url}`);
    // Note: In a static site, actual file generation happens on the server
    // Use generate-pages.js script to create static HTML files
    return storyPage;
  } catch (e) {
    console.error("Error preparing story page data:", e);
  }
}

// Update sitemap with all stories
function updateSitemap() {
  const sitemap = generateSitemap(allPosts);
  localStorage.setItem("sitemap", sitemap);
  console.log("Sitemap updated with", allPosts.length, "stories");
}

function generateSitemap(posts) {
  const baseUrl = "https://skogsmulle.netlify.app";
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  
  <!-- Homepage -->
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  
`;

  // Add each story
  posts.forEach((post) => {
    const slug = post.slug || generateStorySlug(post.title);
    const date = post.timestamp
      ? new Date(post.timestamp).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    xml += `  <!-- ${post.title} -->
  <url>
    <loc>${baseUrl}/stories/${slug}.html</loc>
    <lastmod>${date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  
`;
  });

  xml += `</urlset>`;
  return xml;
}

// Shared sanitize config so the reader modal and the author preview render
// identically (same allowed tags/attrs/URI scheme restrictions).
function sanitizeStoryHtml(html) {
  if (typeof DOMPurify === 'undefined') {
    console.warn('DOMPurify not available, using basic sanitization');
    const tempDiv = document.createElement('div');
    tempDiv.textContent = String(html || '').replace(/<[^>]*>/g, ' ');
    return '<p>' + tempDiv.textContent + '</p>';
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'li', 'ol', 'h1', 'h2', 'h3', 'blockquote', 'img'],
    ALLOWED_ATTR: ['src', 'alt'],
    // Allow only relative paths (no scheme, e.g. "images/x.jpg") or https:// URLs
    ALLOWED_URI_REGEXP: /^(?:https:\/\/|(?!^[a-zA-Z][a-zA-Z0-9+.-]*:))/
  });
}

// Escape dynamic text before interpolating it into an innerHTML template
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Toast notifications (replace alert()). type: 'success' | 'error' | 'info'
function showToast(message, type) {
  let region = document.querySelector(".toast-region");
  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }

  const toast = document.createElement("div");
  toast.className = "toast" + (type === "error" ? " toast-error" : "");
  toast.setAttribute("role", type === "error" ? "alert" : "status");

  const text = document.createElement("span");
  text.textContent = message;
  toast.appendChild(text);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "toast-close";
  closeBtn.setAttribute("aria-label", "Stäng meddelande");
  closeBtn.style.minWidth = "44px";
  closeBtn.style.minHeight = "44px";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => toast.remove());
  toast.appendChild(closeBtn);

  region.appendChild(toast);
  setTimeout(() => toast.remove(), type === "error" ? 8000 : 5000);
}

// Stable identifier for a post, used for card <-> story matching and hash links
function getStoryIdentifier(post, index) {
  return post && post.id != null ? String(post.id) : String(index);
}

// Find a post's current index in allPosts by its stable identifier
function findPostIndexByIdentifier(identifier) {
  if (identifier == null) return -1;
  const idx = allPosts.findIndex(
    (p, i) => getStoryIdentifier(p, i) === String(identifier)
  );
  return idx;
}

// Icon file (without extension) for a story's category, with a safe fallback
function getCategoryIcon(category) {
  const cfg = (typeof SITE_CONFIG !== 'undefined' && SITE_CONFIG) ? SITE_CONFIG : {};
  const icons = cfg.CATEGORY_ICONS || {};
  const key = (category || '').toLowerCase();
  return icons[key] || 'ikon-lov';
}

function getIconDir() {
  const cfg = (typeof SITE_CONFIG !== 'undefined' && SITE_CONFIG) ? SITE_CONFIG : {};
  return cfg.ICON_DIR || 'assets/images/icons/';
}

// Berättelserna som listan visar just nu (respekterar aktivt ämnesfilter).
function getVisiblePosts() {
  return selectedCategory
    ? allPosts.filter((p) => (p.category || '').toLowerCase() === selectedCategory)
    : allPosts;
}

function renderAllPosts() {
  const c = document.getElementById("posts-container");
  c.removeAttribute("aria-busy");

  if (allPosts.length === 0) {
    c.innerHTML = '<div class="empty-state" role="status"><img class="empty-state-icon" src="' + getIconDir() + 'ikon-svamp.webp" alt="" width="96" height="96" loading="lazy" decoding="async" /><p>Här kommer det snart berättelser.</p></div>';
    return;
  }

  // Sort allPosts itself (not a copy) so card index always matches allPosts index
  allPosts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const visiblePosts = getVisiblePosts();

  if (visiblePosts.length === 0) {
    c.innerHTML = '<div class="empty-state" role="status"><img class="empty-state-icon" src="' + getIconDir() + 'ikon-svamp.webp" alt="" width="96" height="96" loading="lazy" decoding="async" /><p>Inga berättelser i det här ämnet ännu.</p><button type="button" class="btn empty-state-reset" id="emptyStateReset">Visa alla berättelser</button></div>';
    const resetBtn = document.getElementById('emptyStateReset');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      const all = document.querySelector('.topic-chip[data-category=""]');
      if (all) all.click();
      if (all) all.focus();
    });
    return;
  }

  const iconDir = getIconDir();

  c.innerHTML = visiblePosts
    .map((p) => {
      const i = allPosts.indexOf(p);
      const excerpt = getExcerpt(p.content, 120);
      const title = p.title || 'Utan titel';
      const storyId = getStoryIdentifier(p, i);
      const iconSrc = iconDir + getCategoryIcon(p.category) + '.webp';

      return `<article
        class="story-card"
        data-id="${escapeHtml(storyId)}"
        id="story-${escapeHtml(storyId)}"
        tabindex="0"
        role="button">
        <div class="story-card-accent"></div>
        <div class="story-card-body">
          <img class="story-card-icon" alt="" width="64" height="64" loading="lazy" decoding="async" src="${escapeHtml(iconSrc)}" />
          <div class="story-card-badges">
            ${p.category ? `<span class="badge badge-category">${escapeHtml(p.category)}</span>` : ''}
            ${p.age ? `<span class="badge badge-age">${escapeHtml(p.age)}</span>` : ''}
          </div>
          <h3 class="story-card-title">${escapeHtml(title)}</h3>
          <p class="story-card-excerpt">${escapeHtml(excerpt)}</p>
          <div class="story-card-footer">
            <span class="story-card-date">${escapeHtml(p.date || '')}</span>
            <span class="story-card-cta">Läs mer <span aria-hidden="true">&rarr;</span></span>
          </div>
        </div>
      </article>`;
    })
    .join("");

  // Handle hash navigation after rendering posts
  handleHashNavigation();
}

// Build the "Välj ämne" chips from SITE_CONFIG.CATEGORY_ICONS and wire up filtering
function setupTopicChips() {
  const container = document.getElementById("topicChips");
  if (!container || container.hasAttribute("data-chips-added")) return;
  container.setAttribute("data-chips-added", "true");

  const cfg = (typeof SITE_CONFIG !== 'undefined' && SITE_CONFIG) ? SITE_CONFIG : {};
  const categoryIcons = cfg.CATEGORY_ICONS || {};
  const iconDir = getIconDir();
  const categories = Object.keys(categoryIcons);

  const allChip = `<button type="button" class="topic-chip" aria-pressed="true" data-category="">
    <span>Alla</span>
  </button>`;

  const categoryChips = categories
    .map((category) => {
      const icon = categoryIcons[category];
      const label = category.charAt(0).toUpperCase() + category.slice(1);
      return `<button type="button" class="topic-chip" aria-pressed="false" data-category="${escapeHtml(category)}">
        <img src="${escapeHtml(iconDir + icon + '.webp')}" alt="" width="56" height="56" loading="lazy" decoding="async" />
        <span>${escapeHtml(label)}</span>
      </button>`;
    })
    .join("");

  container.innerHTML = allChip + categoryChips;

  container.addEventListener("click", function (e) {
    const chip = e.target.closest(".topic-chip");
    if (!chip) return;
    const category = chip.dataset.category || null; // "" (Alla) becomes null

    selectedCategory = selectedCategory === category ? null : category;

    container.querySelectorAll(".topic-chip").forEach((el) => {
      const isActive = selectedCategory
        ? el.dataset.category === selectedCategory
        : el.dataset.category === "";
      el.setAttribute("aria-pressed", String(isActive));
    });

    renderAllPosts();
  });
}

function getExcerpt(html, maxLen) {
  if (!html) return '';
  // Parse via DOMParser (not a live document) so images never load and
  // inline event handlers never execute, unlike assigning to .innerHTML.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
}

// Event delegation: card clicks/keydowns are handled on the container,
// so re-rendering #posts-container never needs to re-attach per-card handlers.
function setupStoryCardDelegation() {
  const container = document.getElementById('posts-container');
  if (!container || container.hasAttribute('data-delegation-added')) return;
  container.setAttribute('data-delegation-added', 'true');

  container.addEventListener('click', function (e) {
    const card = e.target.closest('.story-card');
    if (!card) return;
    openStoryModalByIdentifier(card.dataset.id, card);
  });

  container.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.story-card');
    if (!card) return;
    e.preventDefault();
    openStoryModalByIdentifier(card.dataset.id, card);
  });
}

function openStoryModalByIdentifier(identifier, triggerEl) {
  const idx = findPostIndexByIdentifier(identifier);
  if (idx === -1) {
    console.warn("Story not found:", identifier);
    return;
  }
  openStoryModal(idx, triggerEl);
}

// Handle hash-based direct links to stories (#story-<id>)
function handleHashNavigation() {
  const hash = window.location.hash;
  if (hash.startsWith('#story-')) {
    const identifier = decodeURIComponent(hash.substring(7));
    const idx = findPostIndexByIdentifier(identifier);
    if (idx !== -1) openStoryModal(idx);
  } else if (hash === '#login') {
    // Login deep link: open the login modal (also when the hash changes after load).
    const lm = document.getElementById("loginModal");
    if (lm && !lm.classList.contains("show-modal")) openLoginModal();
  } else {
    closeStoryModal({ fromHistory: true });
  }
}



// Improved Delete with Undo functionality
let deletedStory = null;
let deleteTimeout = null;

async function deletePost(i) {
  const p = allPosts[i];
  try {
    // Store for undo
    deletedStory = { ...p };

    // Remove from Firebase
    await C.delete(p.id);

    // Show undo notification
    showUndoNotification(p.title);

    // Set timeout to remove story page file
    deleteTimeout = setTimeout(() => {
      deletedStory = null;
      console.log("Delete confirmed, story permanently removed");
    }, 10000);
  } catch (e) {
    console.error("Delete error:", e);
    showToast(
      "Ett fel uppstod när berättelsen skulle tas bort. Försök igen.",
      "error"
    );
  }
}

function showUndoNotification(title) {
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    background: var(--a);
    color: var(--w);
    padding: 20px 30px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(58,51,6,0.25);
    z-index: 3000;
    display: flex;
    gap: 15px;
    align-items: center;
    animation: slideIn 0.3s ease;
    font-family: var(--f);
    font-weight: 600;
  `;

  notification.setAttribute("role", "status");
  notification.innerHTML = `
    <span>Berättelsen "${escapeHtml(title)}" har tagits bort</span>
    <button onclick="undoDelete()" style="
      background: var(--w);
      color: var(--a);
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      font-family: var(--f);
    ">↩️ Ångra</button>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 10000);
}

async function undoDelete() {
  if (deletedStory && deleteTimeout) {
    clearTimeout(deleteTimeout);
    try {
      // Restore to Firebase
      await C.save(deletedStory);
      showToast(`Berättelsen "${deletedStory.title}" har återställts!`, "success");
      deletedStory = null;
      deleteTimeout = null;
    } catch (e) {
      console.error("Undo error:", e);
      showToast("Kunde inte återställa berättelsen. Försök igen.", "error");
    }
  }
}


// Text size controls
function changeTextSize(delta) {
  const currentSize = parseFloat(
    getComputedStyle(document.body).fontSize
  );
  let newSize;

  if (delta === 0) {
    newSize = 16; // Reset to default
  } else {
    newSize = Math.max(12, Math.min(24, currentSize + delta));
  }

  document.body.style.fontSize = newSize + "px";
  localStorage.setItem("skogsmulle_textSize", newSize);
}

// Reading progress
function markAsRead(index) {
  const post = allPosts[index];
  const readPosts = JSON.parse(
    localStorage.getItem("skogsmulle_read") || "[]"
  );

  if (!readPosts.includes(post.id)) {
    readPosts.push(post.id);
    localStorage.setItem("skogsmulle_read", JSON.stringify(readPosts));
  }

  showToast(`Bra jobbat! Du har läst "${post.title}"`, "success");
}

// Reading stats functionality removed

// Manual load stories function for troubleshooting
async function manualLoadStories() {
  console.log("Manual load stories triggered");
  try {
    if (window.firebaseDb) {
      console.log("Attempting to load stories from Firebase...");
      await C.load();
      showToast(
        `Berättelser laddade! Hittade ${allPosts.length} berättelser.`,
        "success"
      );
    } else {
      showToast(
        "Firebase är inte tillgängligt. Kontrollera din internetanslutning.",
        "error"
      );
    }
  } catch (error) {
    console.error("Manual load failed:", error);
    showToast(
      "Kunde inte ladda berättelser. Kontrollera konsolen för detaljer.",
      "error"
    );
  }
}

// Set right before calling signInWithEmailAndPassword so the onAuthStateChanged
// handler below can tell "just signed in" apart from "session restored on load".
let justSignedIn = false;

let authInitialized = false;
// Laddar Firebase Auth vid behov och kopplar lyssnaren en gång.
function ensureAuth() {
  return loadFirebaseAuth().then(() => { initAuth(); }).catch((e) => {
    console.warn("Firebase Authentication kunde inte laddas:", e);
    showLoginSection();
    throw e;
  });
}

function initAuth() {
  if (authInitialized && window.firebaseAuth) return;
  console.log("Initializing Firebase Authentication...");

  if (!FIREBASE_AUTH_ENABLED || !window.firebaseAuth) {
    console.warn("Firebase Authentication not available");
    showLoginSection();
    return;
  }

  // Lyssna på autentiseringsstatusändringar
  authInitialized = true;
  window.firebaseOnAuthStateChanged(window.firebaseAuth, (user) => {
    try { user ? localStorage.setItem(AUTH_HINT_KEY, "1") : localStorage.removeItem(AUTH_HINT_KEY); } catch (e) {}
    if (user) {
      console.log("User authenticated:", user.email);
      isAdmin = true;
      currentUser = {
        uid: user.uid,
        email: user.email,
        name: user.email.split("@")[0]
      };
      showAuthorTools();
      if (justSignedIn) {
        justSignedIn = false;
        showToast("Du är inloggad", "success");
        const heading = document.getElementById("authorSectionHeading");
        const section = document.getElementById("authorSection");
        if (section) section.scrollIntoView({ behavior: "smooth" });
        if (heading) heading.focus();
      }
    } else {
      console.log("No user authenticated");
      isAdmin = false;
      currentUser = null;
      hideAuthorTools();
    }
  });
}

function handleNavLogin() {
  if (isAdmin && currentUser) {
    signOut();
  } else {
    openLoginModal(document.getElementById("navLoginBtn"));
  }
}

function updateNavLoginBtn() {
  const btn = document.getElementById("navLoginBtn");
  const writeItem = document.getElementById("navWriteItem");
  if (!btn) return;
  if (isAdmin && currentUser) {
    btn.textContent = `Inloggad: ${currentUser.name} · Logga ut`;
    btn.classList.add("logged-in");
    if (writeItem) writeItem.style.display = '';
  } else {
    btn.textContent = "Författarlogin";
    btn.classList.remove("logged-in");
    if (writeItem) writeItem.style.display = 'none';
  }
}

function toggleLoginModal() {
  openLoginModal(document.getElementById("navLoginBtn"));
}

let loginModalTriggerEl = null;

function openLoginModal(triggerEl) {
  // Förladda Auth när författaren öppnar inloggningen
  ensureAuth().catch(() => {});
  const modal = document.getElementById("loginModal");
  if (!modal) return;
  loginModalTriggerEl = triggerEl || null;
  modal.classList.add("show-modal");
  const emailInput = document.getElementById("emailInput");
  if (emailInput) emailInput.focus();
}

function closeLoginModal() {
  const modal = document.getElementById("loginModal");
  if (!modal || !modal.classList.contains("show-modal")) return;
  modal.classList.remove("show-modal");
  hideLoginError();
  // Clear password field and reset the show/hide toggle
  const passwordInput = document.getElementById("passwordInput");
  if (passwordInput) {
    passwordInput.value = "";
    passwordInput.type = "password";
  }
  const toggleBtn = document.getElementById("passwordToggleBtn");
  if (toggleBtn) {
    toggleBtn.setAttribute("aria-pressed", "false");
    toggleBtn.setAttribute("aria-label", "Visa lösenord");
  }

  if (window.location.hash === "#login") {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  const restoreTo = (loginModalTriggerEl && document.contains(loginModalTriggerEl))
    ? loginModalTriggerEl
    : document.body;
  restoreTo.focus();
  loginModalTriggerEl = null;
}

// Story Modal Functions
let storyModalTriggerEl = null;
// True when the currently-open story added its own entry to browser history
// (so closing it via the UI should consume that entry with history.back()).
let storyModalPushedState = false;

function openStoryModal(index, triggerEl) {
  if (!allPosts || index < 0 || index >= allPosts.length) {
    console.warn("Invalid story index:", index);
    return;
  }

  const story = allPosts[index];
  const modal = document.getElementById("storyModal");
  const dialogEl = modal ? modal.querySelector(".story-modal-content") : null;
  const titleEl = document.getElementById("storyModalTitle");
  const metaEl = document.getElementById("storyModalMeta");
  const bodyEl = document.getElementById("storyModalBody");

  if (!modal || !dialogEl || !titleEl || !metaEl || !bodyEl) {
    console.warn("Story modal elements not found");
    return;
  }

  // Update URL hash for direct linking, and make sure Back closes the modal.
  const storyId = getStoryIdentifier(story, index);
  const targetHash = `#story-${storyId}`;
  if (window.location.hash !== targetHash) {
    history.pushState({ skogsmulleStory: storyId }, '', targetHash);
    storyModalPushedState = true;
  } else {
    history.replaceState({ skogsmulleStory: storyId }, '', targetHash);
    storyModalPushedState = false;
  }

  // Använd textContent för titel (ingen HTML)
  titleEl.textContent = story.title || "Namnlös berättelse";

  // Använd textContent för metadata (ingen HTML)
  const dateSpan = document.createElement('span');
  dateSpan.className = 'post-date';
  dateSpan.textContent = `📅 ${story.date || "Inget datum"}`;

  const categorySpan = story.category ? (() => {
    const span = document.createElement('span');
    span.className = 'post-category';
    span.textContent = `📂 ${story.category}`;
    return span;
  })() : null;

  const ageSpan = story.age ? (() => {
    const span = document.createElement('span');
    span.className = 'post-age';
    span.textContent = `👶 ${story.age}`;
    return span;
  })() : null;

  metaEl.innerHTML = '';
  metaEl.appendChild(dateSpan);
  if (categorySpan) metaEl.appendChild(categorySpan);
  if (ageSpan) metaEl.appendChild(ageSpan);

  bodyEl.innerHTML = sanitizeStoryHtml(story.content || "<p>Inget innehåll tillgängligt.</p>");

  // Harden images regardless of which sanitization path produced them above.
  bodyEl.querySelectorAll('img').forEach((img) => {
    img.loading = 'lazy';
    img.decoding = 'async';
    if (!img.hasAttribute('alt')) {
      img.alt = '';
      img.setAttribute('role', 'presentation');
    }
    img.addEventListener('error', function () {
      this.style.display = 'none';
    }, { once: true });
  });

  const adminActions = document.getElementById("storyModalAdminActions");
  if (adminActions) {
    adminActions.hidden = !isAdmin;
    const editBtn = document.getElementById("storyModalEditBtn");
    const deleteBtn = document.getElementById("storyModalDeleteBtn");
    if (editBtn) editBtn.onclick = () => {
      closeStoryModal();
      if (window.Author) window.Author.open(story);
    };
    // Two-step delete: the first click only asks; deletePost() itself is unchanged.
    const delPanel = document.getElementById("storyModalDeleteConfirm");
    const delText = document.getElementById("storyModalDeleteConfirmText");
    const delYes = document.getElementById("storyModalDeleteYes");
    const delNo = document.getElementById("storyModalDeleteNo");
    if (delPanel) delPanel.hidden = true;
    if (deleteBtn && delPanel) deleteBtn.onclick = () => {
      if (delText) delText.textContent = "Ta bort “" + (story.title || "Utan titel") + "”? Du kan ångra i 10 sekunder efteråt.";
      delPanel.hidden = false;
      if (delText) delText.focus();
    };
    if (delYes) delYes.onclick = () => {
      closeStoryModal();
      deletePost(index);
    };
    if (delNo) delNo.onclick = () => {
      delPanel.hidden = true;
      if (deleteBtn) deleteBtn.focus();
    };
  }

  const wasOpen = modal.classList.contains("show");
  modal.classList.add("show");
  document.body.style.overflow = "hidden"; // Prevent background scrolling
  modal.scrollTop = 0;

  if (!wasOpen) {
    storyModalTriggerEl = triggerEl || null;
    const closeBtn = modal.querySelector(".story-modal-close");
    (closeBtn || dialogEl).focus();
  }

  setupStoryNav(index);
  if (window.StoryReader) window.StoryReader.onOpen(story);
}

// Föregående / Nästa / Tillbaka längst ned i läsvyn (samma ordning som listan).
function setupStoryNav(index) {
  const prev = document.getElementById("storyNavPrev");
  const next = document.getElementById("storyNavNext");
  const back = document.getElementById("storyNavBack");
  if (!prev || !next || !back) return;
  const wire = (btn, titleId, i) => {
    const s = i >= 0 ? allPosts[i] : null;
    btn.hidden = !s;
    const t = document.getElementById(titleId);
    if (t) t.textContent = s ? (s.title || "Namnlös berättelse") : "";
    btn.onclick = s ? () => {
      if (window.StoryReader) window.StoryReader.onClose();
      // Byt berättelse utan att stapla historikposter: Tillbaka stänger fortfarande läsvyn.
      const pushed = storyModalPushedState;
      const id = getStoryIdentifier(s, i);
      history.replaceState({ skogsmulleStory: id }, '', `#story-${id}`);
      openStoryModal(i);
      storyModalPushedState = pushed;
      const m = document.querySelector("#storyModal .story-modal-content");
      if (m) m.scrollTop = 0;
      const modalEl = document.getElementById("storyModal");
      if (modalEl) modalEl.scrollTop = 0;
      const title = document.getElementById("storyModalTitle");
      if (title) { title.setAttribute("tabindex", "-1"); title.focus({ preventScroll: true }); }
    } : null;
  };
  // Följ det aktiva filtret; om berättelsen inte ingår i det (t.ex. direktlänk) används hela listan.
  const visible = getVisiblePosts();
  const pos = visible.indexOf(allPosts[index]);
  const list = pos === -1 ? allPosts : visible;
  const at = pos === -1 ? index : pos;
  const idxOf = (k) => (k >= 0 && k < list.length ? allPosts.indexOf(list[k]) : -1);
  wire(prev, "storyNavPrevTitle", idxOf(at - 1));
  wire(next, "storyNavNextTitle", idxOf(at + 1));
  back.onclick = () => {
    closeStoryModal();
    const list = document.getElementById("stories") || document.querySelector(".stories-section, main");
    if (list && list.scrollIntoView) list.scrollIntoView({ block: "start" });
  };
}

function closeStoryModal(opts) {
  opts = opts || {};
  const modal = document.getElementById("storyModal");
  if (!modal || !modal.classList.contains("show")) return;

  if (window.StoryReader) window.StoryReader.onClose();

  modal.classList.remove("show");
  document.body.style.overflow = ""; // Restore scrolling

  if (!opts.fromHistory) {
    if (storyModalPushedState) {
      // Consume the history entry we added when opening, so Back works cleanly.
      history.back();
    } else if (window.location.hash.startsWith('#story-')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }
  storyModalPushedState = false;

  const restoreTo = (storyModalTriggerEl && document.contains(storyModalTriggerEl))
    ? storyModalTriggerEl
    : document.body;
  restoreTo.focus();
  storyModalTriggerEl = null;
}

// Browser Back/Forward: open or close the story modal to match the URL hash.
window.addEventListener('popstate', function () {
  handleHashNavigation();
});

function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => el.offsetParent !== null);
}

function trapFocus(e, container) {
  const focusables = getFocusableElements(container);
  if (focusables.length === 0) {
    e.preventDefault();
    container.focus();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// Escape closes whichever dialog is open; Tab is trapped inside it.
document.addEventListener("DOMContentLoaded", function () {
  const storyModal = document.getElementById("storyModal");
  const loginModal = document.getElementById("loginModal");

  if (storyModal) {
    storyModal.addEventListener("click", function (e) {
      if (e.target === storyModal) closeStoryModal();
    });
  }
  if (loginModal) {
    loginModal.addEventListener("click", function (e) {
      if (e.target === loginModal) closeLoginModal();
    });
  }

  document.addEventListener("keydown", function (e) {
    const storyOpen = storyModal && storyModal.classList.contains("show");
    const loginOpen = loginModal && loginModal.classList.contains("show-modal");
    if (!storyOpen && !loginOpen) return;

    if (e.key === "Escape") {
      if (storyOpen) closeStoryModal();
      else closeLoginModal();
      return;
    }

    if (e.key === "Tab") {
      const dialogEl = storyOpen
        ? storyModal.querySelector(".story-modal-content")
        : loginModal.querySelector(".modal-content");
      if (dialogEl) trapFocus(e, dialogEl);
    }
  });
});

function showAuthorTools() {
  const authorSection = document.getElementById("authorSection");
  if (authorSection) authorSection.style.display = '';
  updateNavLoginBtn();
}

function showLoginSection() {
  updateNavLoginBtn();
}

function hideAuthorTools() {
  const authorSection = document.getElementById("authorSection");
  if (authorSection) authorSection.style.display = 'none';
  updateNavLoginBtn();
}

// toggleAuthorTools function removed - sidebar functionality consolidated into navigation

function signInWithGoogle(e) {
  // Denna funktion heter fortfarande "signInWithGoogle" men använder nu email/password
  // Namnet behålls för bakåtkompatibilitet med befintlig kod
  console.log("signInWithGoogle called (legacy name, now uses email/password)");
}

async function signInWithEmailPassword(email, password) {
  try { await ensureAuth(); } catch (e) {}
  if (!FIREBASE_AUTH_ENABLED || !window.firebaseAuth) {
    showLoginError("Firebase Authentication är inte aktiverat");
    return;
  }
  
  try {
    justSignedIn = true;
    const userCredential = await window.firebaseSignInWithEmailAndPassword(
      window.firebaseAuth,
      email,
      password
    );
    console.log("Sign in successful:", userCredential.user.email);
    closeLoginModal();
    // onAuthStateChanged kommer att hantera resten
  } catch (error) {
    justSignedIn = false;
    console.error("Sign in error:", error);
    let errorMessage = "Inloggningen misslyckades";
    
    switch (error.code) {
      case 'auth/invalid-email':
        errorMessage = "Ogiltig e-postadress";
        break;
      case 'auth/user-disabled':
        errorMessage = "Kontot är inaktiverat";
        break;
      case 'auth/user-not-found':
        errorMessage = "Ingen användare med denna e-postadress";
        break;
      case 'auth/wrong-password':
        errorMessage = "Felaktigt lösenord";
        break;
      case 'auth/invalid-credential':
        errorMessage = "Felaktig e-postadress eller lösenord";
        break;
      case 'auth/too-many-requests':
        errorMessage = "För många misslyckade försök. Försök igen senare.";
        break;
      default:
        errorMessage = `Fel: ${error.message}`;
    }
    
    showLoginError(errorMessage);
  }
}

function showLoginError(message) {
  const errorEl = document.getElementById("loginError");
  if (errorEl) {
    errorEl.textContent = `⚠ ${message}`;
    errorEl.style.display = "block";
  }
}

function hideLoginError() {
  const errorEl = document.getElementById("loginError");
  if (errorEl) {
    errorEl.style.display = "none";
  }
}

function signOut() {
  if (!FIREBASE_AUTH_ENABLED || !window.firebaseAuth) {
    console.warn("Firebase Authentication not available");
    return;
  }
  
  window.firebaseSignOut(window.firebaseAuth)
    .then(() => {
      console.log("Sign out successful");
      isAdmin = false;
      currentUser = null;
      hideAuthorTools();
      showToast("Du har loggats ut.", "success");
    })
    .catch((error) => {
      console.error("Sign out error:", error);
      showToast("Kunde inte logga ut. Försök igen.", "error");
    });
}


function setupLoginListener() {
  console.log("Setting up login listener...");
  const loginForm = document.getElementById("loginForm");
  console.log("Login form element:", loginForm);

  if (loginForm && !loginForm.hasAttribute("data-listener-added")) {
    console.log("Adding login form event listener");
    loginForm.setAttribute("data-listener-added", "true");
    loginForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      console.log("Login form submitted");
      hideLoginError();
      
      const email = document.getElementById("emailInput").value.trim();
      const password = document.getElementById("passwordInput").value;
      const submitBtn = document.getElementById("loginSubmitBtn");
      
      console.log("Email from form:", email);
      
      // Disable submit button during login
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Loggar in...";
      }
      
      await signInWithEmailPassword(email, password);
      
      // Re-enable submit button
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Logga in";
      }
    });
    console.log("Login form listener added successfully");
  } else {
    console.warn("Login form not found or listener already added");
  }
}

function setupPasswordToggle() {
  const toggleBtn = document.getElementById("passwordToggleBtn");
  const passwordInput = document.getElementById("passwordInput");
  if (!toggleBtn || !passwordInput || toggleBtn.hasAttribute("data-listener-added")) return;
  toggleBtn.setAttribute("data-listener-added", "true");
  toggleBtn.addEventListener("click", function () {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    toggleBtn.setAttribute("aria-pressed", String(isHidden));
    toggleBtn.setAttribute("aria-label", isHidden ? "Dölj lösenord" : "Visa lösenord");
  });
}

document.addEventListener("DOMContentLoaded", function () {
  // Auth laddas direkt bara om en session troligen finns; annars när sidan är klar
  // (eller när inloggningen öppnas). Påverkar inte första renderingen.
  let hasHint = false;
  try { hasHint = localStorage.getItem(AUTH_HINT_KEY) === "1"; } catch (e) {}
  if (hasHint) {
    ensureAuth().catch(() => {});
  } else {
    const later = () => setTimeout(() => ensureAuth().catch(() => {}), 2000);
    if (document.readyState === "complete") later(); else window.addEventListener("load", later, { once: true });
  }
  setupLoginListener();
  setupPasswordToggle();
  setupStoryCardDelegation();
  setupTopicChips();

  const savedSize = localStorage.getItem("skogsmulle_textSize");
  if (savedSize) document.body.style.fontSize = savedSize + "px";

  // Deep link: index.html#login opens the author login modal directly
  if (window.location.hash === "#login") openLoginModal();

  // Handle hash navigation for direct story links
  window.addEventListener('hashchange', handleHashNavigation);
  
  // Show loading state
  const postsContainer = document.getElementById("posts-container");
  if (postsContainer) {
    if (!postsContainer.querySelector('.loading-state')) postsContainer.innerHTML = '<div class="loading-state" role="status" aria-live="polite"><span class="sr-only-text">Laddar berättelser…</span><div class="skeleton-card" aria-hidden="true"><span class="sk sk-icon"></span><span class="sk sk-title"></span><span class="sk sk-line"></span><span class="sk sk-line sk-short"></span></div><div class="skeleton-card" aria-hidden="true"><span class="sk sk-icon"></span><span class="sk sk-title"></span><span class="sk sk-line"></span><span class="sk sk-line sk-short"></span></div><div class="skeleton-card" aria-hidden="true"><span class="sk sk-icon"></span><span class="sk sk-title"></span><span class="sk sk-line"></span><span class="sk sk-line sk-short"></span></div></div>';
    postsContainer.setAttribute('aria-busy', 'true');
  }

  // Använd endast realtime listener (ta bort dubbelhämtning).
  // Firestore laddas efter första renderingen (dynamisk import, blockerar inte parsning).
  loadFirebaseCore().catch((e) => { console.warn("Firebase kunde inte laddas:", e); }).then(async () => {
    if (window.firebaseDb) {
      try {
        setupRealtimeListener();
        // C.load() borttagen - använd bara onSnapshot för att undvika dubbelhämtning
      } catch (error) {
        console.error("Firebase setup failed:", error);
        allPosts = [];
        showStoriesError();
      }
    } else {
      allPosts = [];
      renderAllPosts();
    }
  });
});
