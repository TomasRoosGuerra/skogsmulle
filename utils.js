/**
 * Shared Utility Functions for Skogsmulle
 * These functions are used across multiple files to maintain DRY principles
 */

// Firebase Configuration (shared constant)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAl4FKCAqrt_Vkw0jRddSnR1gn4BGby-rA",
  authDomain: "skogsmulle-c601d.firebaseapp.com",
  projectId: "skogsmulle-c601d",
  storageBucket: "skogsmulle-c601d.firebasestorage.app",
  messagingSenderId: "878822846379",
  appId: "1:878822846379:web:b545d30bab52d19a5facee",
  measurementId: "G-SV2RJXDS5S",
};

// Site Configuration
export const SITE_CONFIG = {
  baseUrl: "https://skogsmulle.netlify.app",
  title: "Skogsmulle - Svenska Barnböcker",
  description: "Svenska sagor och barnberättelser online för barn 3-12 år",
  author: "Tomas Roos Guerra",
  locale: "sv_SE",
  language: "sv-SE",
};

/**
 * Generate SEO-friendly slug from title
 * Normalizes Swedish characters and creates URL-safe string
 * @param {string} title - The title to convert
 * @returns {string} URL-safe slug
 */
export function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Format date in Swedish format
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatSwedishDate(date) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Maj",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Okt",
    "Nov",
    "Dec",
  ];
  return `${date.getDate()} ${months[date.getMonth()]}, ${date.getFullYear()}`;
}

/**
 * Generate meta tags object for a story
 * @param {Object} story - Story object
 * @param {string} story.title - Story title
 * @param {string} [story.category] - Story category
 * @param {string} [story.age] - Target age group
 * @param {string} [story.content] - Story content
 * @returns {Object} Meta tags object
 */
export function generateStoryMetaTags(story) {
  const slug = generateSlug(story.title);
  const storyUrl = `/stories/${slug}.html`;
  const fullUrl = `${SITE_CONFIG.baseUrl}${storyUrl}`;

  return {
    title: `${story.title} - Skogsmulle Barnberättelse`,
    description: `${story.title} - Läs denna magiska svenska barnberättelse. ${
      story.category ? "Kategori: " + story.category + "." : ""
    } ${story.age ? "Lämplig för barn " + story.age + "." : ""}`,
    keywords: `svenska sagor,barnberättelser,${story.title},${
      story.category || "berättelse"
    },barn,läsa sagor,Skogsmulle`,
    ogTitle: `${story.title} - Skogsmulle Barnberättelse`,
    ogDescription: `Läs berättelsen ${story.title}. ${
      story.category
        ? "En " + story.category + "-berättelse"
        : "En magisk berättelse"
    } för barn.`,
    ogUrl: fullUrl,
    canonical: fullUrl,
  };
}

/**
 * Generate Schema.org Article structured data
 * @param {Object} story - Story object
 * @returns {Object} Schema.org Article JSON-LD
 */
export function generateArticleSchema(story) {
  const slug = generateSlug(story.title);
  const storyUrl = `/stories/${slug}.html`;
  const fullUrl = `${SITE_CONFIG.baseUrl}${storyUrl}`;

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: story.title,
    description: `${story.title} - En svensk barnberättelse`,
    image: `${SITE_CONFIG.baseUrl}/igelkotten.png`,
    author: {
      "@type": "Person",
      name: SITE_CONFIG.author,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_CONFIG.title,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_CONFIG.baseUrl}/igelkotten.png`,
      },
    },
    datePublished: story.timestamp
      ? new Date(story.timestamp).toISOString()
      : "",
    dateModified: story.timestamp
      ? new Date(story.timestamp).toISOString()
      : "",
    inLanguage: SITE_CONFIG.language,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": fullUrl,
    },
  };
}

/**
 * Generate Breadcrumb Schema
 * @param {string} storyTitle - Title of the story
 * @returns {Object} Schema.org BreadcrumbList JSON-LD
 */
export function generateBreadcrumbSchema(storyTitle) {
  const slug = generateSlug(storyTitle);
  const storyUrl = `/stories/${slug}.html`;

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Hem",
        item: SITE_CONFIG.baseUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Berättelser",
        item: `${SITE_CONFIG.baseUrl}/#stories`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: storyTitle,
        item: `${SITE_CONFIG.baseUrl}${storyUrl}`,
      },
    ],
  };
}

/**
 * Sanitize HTML content
 * @param {string} html - HTML to sanitize
 * @returns {string} Sanitized HTML
 */
export function sanitizeHTML(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/g, "")
    .replace(/on\w+='[^']*'/g, "");
}

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Check if user is admin
 * @param {string} email - Email to check
 * @returns {boolean} True if admin
 */
export function isAdminEmail(email) {
  const normalizedEmail = email.toLowerCase().trim();
  return (
    normalizedEmail === "tomas.roosguerra@gmail.com" ||
    normalizedEmail === "tomasroosguerra@gmail.com"
  );
}

/**
 * Story categories
 */
export const STORY_CATEGORIES = [
  { value: "äventyr", label: "Äventyr" },
  { value: "vänskap", label: "Vänskap" },
  { value: "natur", label: "Natur" },
  { value: "magi", label: "Magi" },
  { value: "djur", label: "Djur" },
  { value: "lärdom", label: "Lärdom" },
];

/**
 * Age groups
 */
export const AGE_GROUPS = [
  { value: "3-5 år", label: "3-5 år" },
  { value: "6-8 år", label: "6-8 år" },
  { value: "9-12 år", label: "9-12 år" },
  { value: "alla åldrar", label: "Alla åldrar" },
];
