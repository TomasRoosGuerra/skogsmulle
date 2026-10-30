/* Author editor: title/språk/ämne/ålder/bild fields, rich toolbar, live preview,
   drafts (autosave/export/import) and publish/update. Plain script (no modules).
   Exposes window.Author = { open(post) }. Wired by index.html's inline script,
   which defines C/showToast/sanitizeStoryHtml/escapeHtml/getCategoryIcon/getIconDir/
   openStoryModalByIdentifier/findPostIndexByIdentifier before this code ever runs
   (all callbacks here fire after DOMContentLoaded, once every earlier script ran). */
(function () {
  "use strict";

  var DRAFT_KEY = "skogsmulle_draft";
  var LANG_LABELS = { sv: "Svenska", en: "English", es: "Español" };
  var LANG_ATTR_MAP = { sv: "sv-SE", en: "en-US", es: "es-ES" };
  var AGE_OPTIONS = ["3–5 år", "6–8 år", "9–12 år", "3–12 år (alla)"];
  var IMAGE_DIR = "assets/images/story/";

  var state = {
    editingId: null,
    editingOriginal: null,
    imageSource: "none", // 'none' | 'manifest' | 'url'
    imageManifestName: "",
    unsaved: false, // text that exists only in the editor (not in localStorage, not published)
    savedRange: null // caret position remembered while the inline image panel is open
  };

  var WORDS_PER_MINUTE = 120; // aloud-reading pace for a children's story

  var els = {};
  var categoryKeys = [];
  var built = false;
  var autosaveTimer = null;
  var previewTimer = null;

  function safeGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function safeRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) {}
  }

  function isSafeImageUrl(url) {
    if (!url) return false;
    return /^https:\/\//.test(url) || !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function formatTimeHHMM(d) { return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
  function formatDateSv(d) {
    var months = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
    return d.getDate() + " " + months[d.getMonth()] + ", " + d.getFullYear();
  }

  function stripLeadingImage(html) {
    var div = document.createElement("div");
    div.innerHTML = html || "";
    var first = div.firstElementChild;
    if (first && first.tagName === "IMG") div.removeChild(first);
    return div.innerHTML;
  }

  // ---- HTML -> Markdown ----
  function inlineToMd(node) {
    return Array.prototype.map.call(node.childNodes, function (child) {
      if (child.nodeType === Node.TEXT_NODE) return child.textContent;
      if (child.nodeType !== Node.ELEMENT_NODE) return "";
      var tag = child.tagName;
      if (tag === "STRONG" || tag === "B") return "**" + inlineToMd(child) + "**";
      if (tag === "EM" || tag === "I") return "*" + inlineToMd(child) + "*";
      if (tag === "BR") return "\n";
      if (tag === "IMG") return "![" + (child.getAttribute("alt") || "") + "](" + (child.getAttribute("src") || "") + ")";
      return inlineToMd(child);
    }).join("");
  }

  function blockToMd(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      var t = node.textContent.trim();
      return t ? t + "\n\n" : "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    switch (node.tagName) {
      case "H1": return "# " + inlineToMd(node) + "\n\n";
      case "H2": return "## " + inlineToMd(node) + "\n\n";
      case "H3": return "### " + inlineToMd(node) + "\n\n";
      case "BLOCKQUOTE":
        return inlineToMd(node).split("\n").filter(Boolean).map(function (l) { return "> " + l; }).join("\n") + "\n\n";
      case "UL":
        return Array.prototype.map.call(node.children, function (li) { return "- " + inlineToMd(li) + "\n"; }).join("") + "\n";
      case "OL":
        return Array.prototype.map.call(node.children, function (li, i) { return (i + 1) + ". " + inlineToMd(li) + "\n"; }).join("") + "\n";
      case "IMG":
        return "![" + (node.getAttribute("alt") || "") + "](" + (node.getAttribute("src") || "") + ")\n\n";
      case "BR":
        return "\n";
      default:
        return inlineToMd(node) + "\n\n";
    }
  }

  function htmlToMarkdown(html) {
    var container = document.createElement("div");
    container.innerHTML = html || "";
    return Array.prototype.map.call(container.childNodes, blockToMd).join("").replace(/\n{3,}/g, "\n\n").trim();
  }

  // ---- Markdown -> HTML (input is escaped first, then trusted tags are added) ----
  function applyInlineMd(text) {
    return text
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (m, alt, src) { return '<img src="' + src + '" alt="' + alt + '">'; })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }

  function markdownToHtml(md) {
    var escaped = escapeHtml(md);
    return escaped.split(/\n\s*\n/).map(function (block) {
      var lines = block.split("\n").filter(function (l) { return l.length; });
      if (!lines.length) return "";
      if (/^##\s+/.test(lines[0])) return "<h2>" + applyInlineMd(lines.join(" ").replace(/^##\s+/, "")) + "</h2>";
      if (/^#\s+/.test(lines[0])) return "<h1>" + applyInlineMd(lines.join(" ").replace(/^#\s+/, "")) + "</h1>";
      if (lines.every(function (l) { return /^(&gt;|>)\s?/.test(l); })) {
        var quote = lines.map(function (l) { return l.replace(/^(&gt;|>)\s?/, ""); }).join("<br>");
        return "<blockquote>" + applyInlineMd(quote) + "</blockquote>";
      }
      if (lines.every(function (l) { return /^[-*]\s+/.test(l); })) {
        return "<ul>" + lines.map(function (l) { return "<li>" + applyInlineMd(l.replace(/^[-*]\s+/, "")) + "</li>"; }).join("") + "</ul>";
      }
      return "<p>" + applyInlineMd(lines.join("<br>")) + "</p>";
    }).join("");
  }

  function downloadBlob(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function render() {
    var cfg = (typeof SITE_CONFIG !== "undefined" && SITE_CONFIG) ? SITE_CONFIG : {};
    categoryKeys = Object.keys(cfg.CATEGORY_ICONS || {});

    var categoryOptions = '<option value="">Välj ämne</option>' + categoryKeys.map(function (key) {
      var label = key.charAt(0).toUpperCase() + key.slice(1);
      return '<option value="' + key + '">' + label + "</option>";
    }).join("");

    var ageOptions = '<option value="">Välj ålder</option>' + AGE_OPTIONS.map(function (a) {
      return '<option value="' + a + '">' + a + "</option>";
    }).join("");

    var section = document.getElementById("authorSection");
    if (!section) return;

    section.innerHTML =
      '<h2 id="authorSectionHeading" tabindex="-1">Skriv berättelse</h2>' +
      '<div class="author-edit-banner" id="authorEditBanner" hidden>' +
        '<span>Du redigerar: <strong id="authorEditingTitle"></strong></span>' +
        '<button type="button" class="btn btn-secondary" id="authorCancelEditBtn">Skriv ny istället</button>' +
      "</div>" +
      '<div class="author-tabs" role="tablist" aria-label="Redigeringsläge">' +
        '<button type="button" role="tab" id="authorTabWrite" aria-selected="true" aria-controls="authorPanelWrite">Skriv</button>' +
        '<button type="button" role="tab" id="authorTabPreview" aria-selected="false" aria-controls="authorPanelPreview">Förhandsgranska</button>' +
      "</div>" +
      '<div class="author-editor-layout">' +
        '<div class="author-editor-pane">' +
          '<div id="authorPanelWrite" class="is-active" role="tabpanel" aria-labelledby="authorTabWrite">' +
            '<div class="form-group">' +
              '<label for="authorTitle">Titel</label>' +
              '<input type="text" id="authorTitle" required autocomplete="off" placeholder="T.ex. Skogsmulles stora äventyr" />' +
            "</div>" +
            '<div class="form-group">' +
              '<label id="authorContentLabel" for="postContent">Berättelse</label>' +
              '<div class="editor-toolbar" role="toolbar" aria-label="Textformat" aria-controls="postContent">' +
                '<button type="button" data-cmd="bold" aria-label="Fet text" title="Fet (Ctrl+B)" aria-pressed="false"><strong>Fet</strong></button>' +
                '<button type="button" data-cmd="italic" aria-label="Kursiv text" title="Kursiv (Ctrl+I)" aria-pressed="false"><em>Kursiv</em></button>' +
                '<button type="button" data-cmd="h2" aria-label="Rubrik" title="Rubrik">Rubrik</button>' +
                '<button type="button" data-cmd="quote" aria-label="Citat" title="Citat">Citat</button>' +
                '<button type="button" data-cmd="list" aria-label="Lista (punktlista)" title="Lista">Lista</button>' +
                '<button type="button" data-cmd="image" aria-label="Infoga bild" title="Infoga bild från en adress" aria-expanded="false" aria-controls="authorInlineImagePanel">Bild</button>' +
                '<button type="button" data-cmd="undo" aria-label="Ångra" title="Ångra (Ctrl+Z)">Ångra</button>' +
                '<button type="button" data-cmd="redo" aria-label="Gör om" title="Gör om (Ctrl+Y)">Gör om</button>' +
              "</div>" +
              '<div class="author-inline-image" id="authorInlineImagePanel" role="group" aria-label="Infoga bild i texten" hidden>' +
                '<label for="authorInlineImageUrl">Bildadress (https://…)</label>' +
                '<input type="text" id="authorInlineImageUrl" inputmode="url" autocomplete="off" placeholder="https://exempel.se/bild.jpg" />' +
                '<label for="authorInlineImageAlt">Bildbeskrivning (alt-text, krävs)</label>' +
                '<input type="text" id="authorInlineImageAlt" autocomplete="off" placeholder="Beskriv bilden med ord…" />' +
                '<p class="author-field-error" id="authorInlineImageError" role="alert" hidden></p>' +
                '<div class="author-inline-image-actions">' +
                  '<button type="button" class="btn btn-primary" id="authorInlineImageInsert">Infoga bilden</button>' +
                  '<button type="button" class="btn btn-secondary" id="authorInlineImageCancel">Avbryt</button>' +
                "</div>" +
                '<p class="author-help-text">Bilder kan inte laddas upp här – klistra in en https-adress till en bild som redan finns på nätet.</p>' +
              "</div>" +
              '<div id="postContent" class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="authorContentLabel" aria-describedby="authorEditorHint" data-placeholder="Skriv din berättelse här…"></div>' +
              '<div class="author-editor-meta">' +
                '<p class="author-word-count" id="authorWordCount">0 ord</p>' +
                '<p class="author-draft-status" id="authorDraftStatus" data-state="idle" role="status">Inget utkast sparat</p>' +
              "</div>" +
              '<p class="author-help-text" id="authorEditorHint">Utkastet sparas automatiskt i den här webbläsaren och är inte publicerat förrän du väljer Publicera. Genvägar: <kbd>Ctrl</kbd>+<kbd>S</kbd> sparar utkast, <kbd>Ctrl</kbd>+<kbd>Enter</kbd> öppnar publicera-frågan, <kbd>Ctrl</kbd>+<kbd>B</kbd> fet, <kbd>Ctrl</kbd>+<kbd>I</kbd> kursiv (Cmd på Mac).</p>' +
            "</div>" +
            '<fieldset class="form-group author-meta-field">' +
              "<legend>Om berättelsen</legend>" +
              '<div class="author-meta-grid">' +
                '<div class="form-group">' +
                  '<label for="authorLanguage">Språk</label>' +
                  '<select id="authorLanguage">' +
                    '<option value="sv">Svenska</option>' +
                    '<option value="en">English</option>' +
                    '<option value="es">Español</option>' +
                    '<option value="other">Annat…</option>' +
                  "</select>" +
                "</div>" +
                '<div class="form-group" id="authorLanguageOtherField" hidden>' +
                  '<label for="authorLanguageOther">Språkkod (2 bokstäver)</label>' +
                  '<input type="text" id="authorLanguageOther" maxlength="2" pattern="[a-zA-Z]{2}" placeholder="t.ex. de" />' +
                "</div>" +
                '<div class="form-group">' +
                  '<label for="authorCategory">Ämne</label>' +
                  '<select id="authorCategory">' + categoryOptions + "</select>" +
                "</div>" +
                '<div class="form-group">' +
                  '<label for="authorAge">Ålder</label>' +
                  '<select id="authorAge">' + ageOptions + "</select>" +
                "</div>" +
              "</div>" +
            "</fieldset>" +
            '<fieldset class="form-group author-image-field">' +
              "<legend>Omslagsbild (valfritt)</legend>" +
              '<div class="author-image-options" id="authorImageOptions">' +
                '<button type="button" class="author-image-opt" data-image-source="none" aria-pressed="true">Ingen bild</button>' +
              "</div>" +
              '<p class="author-help-text" id="authorManifestHint" hidden>Bildlistan kan inte läsas härifrån – ange en https-adress istället.</p>' +
              '<label for="authorImageUrl">Eller bildadress (https://…)</label>' +
              '<input type="text" id="authorImageUrl" inputmode="url" autocomplete="off" placeholder="https://exempel.se/bild.jpg" />' +
              '<p class="author-field-error" id="authorImageUrlError" hidden></p>' +
              '<p class="author-help-text">Bilder inne i själva texten lägger du in med knappen <strong>Bild</strong> i verktygsraden. Lägg bildfiler i mappen <code>assets/images/story/</code> och lägg till filnamnet i <code>manifest.json</code>.</p>' +
              '<div class="form-group" id="authorImageAltField" hidden>' +
                '<label for="authorImageAlt">Bildbeskrivning (alt-text)</label>' +
                '<input type="text" id="authorImageAlt" placeholder="Beskriv bilden med ord…" />' +
              "</div>" +
            "</fieldset>" +
            '<div class="author-toolbar-row">' +
              '<button type="button" class="btn btn-secondary" id="authorSaveDraftBtn">Spara utkast nu</button>' +
              '<button type="button" class="btn btn-secondary" id="authorExportJsonBtn">Exportera som JSON</button>' +
              '<button type="button" class="btn btn-secondary" id="authorExportMdBtn">Exportera som Markdown</button>' +
              '<label class="btn btn-secondary author-file-label" for="authorImportInput">Importera' +
                '<input type="file" id="authorImportInput" accept=".json,.md,.txt" hidden />' +
              "</label>" +
              '<button type="button" class="btn btn-secondary" id="authorClearDraftBtn">Rensa utkast</button>' +
            "</div>" +
            '<p class="author-import-error" id="authorImportError" role="alert" hidden></p>' +
            '<div class="author-confirm-panel" id="authorClearConfirm" hidden role="group" aria-label="Bekräfta rensning">' +
              "<p>Vill du rensa utkastet? Det går inte att ångra.</p>" +
              '<button type="button" class="btn btn-primary" id="authorClearConfirmYes">Rensa</button>' +
              '<button type="button" class="btn btn-secondary" id="authorClearConfirmNo">Avbryt</button>' +
            "</div>" +
            '<p class="author-publish-error" id="authorPublishError" role="alert" hidden></p>' +
            '<div class="author-confirm-panel" id="authorPublishConfirm" hidden role="group" aria-labelledby="authorPublishConfirmText">' +
              '<p id="authorPublishConfirmText" tabindex="-1">Är du säker? Berättelsen publiceras direkt på sajten.</p>' +
              '<button type="button" class="btn btn-primary" id="authorPublishYes">Publicera</button>' +
              '<button type="button" class="btn btn-secondary" id="authorPublishPreview">Förhandsgranska först</button>' +
              '<button type="button" class="btn btn-secondary" id="authorPublishNo">Avbryt</button>' +
            "</div>" +
            '<div class="author-publish-row">' +
              '<button type="button" class="btn btn-secondary author-preview-btn" id="authorPreviewBtn">Förhandsgranska</button>' +
              '<button type="button" class="btn btn-primary author-publish-btn" id="authorPublishBtn">Publicera</button>' +
            "</div>" +
            '<div class="author-success-banner" id="authorSuccessBanner" role="status" hidden>' +
              '<p id="authorSuccessText"></p>' +
              '<button type="button" class="btn btn-secondary" id="authorViewStoryBtn">Visa berättelsen</button>' +
            "</div>" +
          "</div>" +
        "</div>" +
        '<div class="author-preview-pane" id="authorPanelPreview" role="tabpanel" aria-labelledby="authorTabPreview">' +
          '<button type="button" class="btn btn-secondary author-preview-back" id="authorPreviewBack">← Tillbaka till texten</button>' +
          '<div class="story-modal-meta" id="authorPreviewMeta"></div>' +
          '<h3 class="story-modal-title" id="authorPreviewTitle"></h3>' +
          '<div class="story-modal-body author-preview-body" id="authorPreviewBody"></div>' +
        "</div>" +
      "</div>";

    [
      "authorSectionHeading", "authorEditBanner", "authorEditingTitle", "authorCancelEditBtn",
      "authorTabWrite", "authorTabPreview", "authorPanelWrite", "authorPanelPreview",
      "authorTitle", "authorLanguage", "authorLanguageOtherField", "authorLanguageOther",
      "authorCategory", "authorAge", "authorImageOptions", "authorManifestHint",
      "authorImageUrl", "authorImageUrlError", "authorImageAltField", "authorImageAlt",
      "authorDraftStatus", "authorSaveDraftBtn", "authorExportJsonBtn", "authorExportMdBtn",
      "authorImportInput", "authorImportError", "authorClearDraftBtn", "authorClearConfirm",
      "authorClearConfirmYes", "authorClearConfirmNo", "authorPublishBtn", "authorPublishConfirm",
      "authorPublishYes", "authorPublishNo", "authorPublishPreview", "authorPublishError", "authorPublishConfirmText", "authorPreviewBtn", "authorPreviewBack", "authorWordCount",
      "authorInlineImagePanel", "authorInlineImageUrl", "authorInlineImageAlt", "authorInlineImageError", "authorInlineImageInsert", "authorInlineImageCancel", "authorSuccessBanner", "authorSuccessText",
      "authorViewStoryBtn", "authorPreviewMeta", "authorPreviewTitle", "authorPreviewBody"
    ].forEach(function (id) { els[id] = document.getElementById(id); });
    els.section = section;
    els.postContent = document.getElementById("postContent");
    els.toolbar = section.querySelector(".editor-toolbar");
  }

  // state: 'idle' | 'dirty' | 'saved' | 'error' – shown as an icon + text (never colour alone)
  function setDraftStatus(text, status) {
    var el = els.authorDraftStatus;
    if (!el) return;
    if (el.textContent !== text) el.textContent = text;
    el.setAttribute("data-state", status || "idle");
  }

  function countWords(text) {
    var t = (text || "").replace(/\u00a0/g, " ").trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function updateWordCount() {
    if (!els.authorWordCount) return;
    var words = countWords(els.postContent.innerText || els.postContent.textContent);
    var label = words + " ord";
    if (words > 0) {
      var minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
      label += " · ca " + minutes + " min högläsning";
    }
    if (els.authorWordCount.textContent !== label) els.authorWordCount.textContent = label;
  }

  function updateImageAltVisibility() {
    var hasImage = state.imageSource !== "none";
    els.authorImageAltField.hidden = !hasImage;
    els.authorImageAlt.required = hasImage;
  }

  function highlightImageButtons() {
    els.authorImageOptions.querySelectorAll(".author-image-opt").forEach(function (btn) {
      var isNone = btn.dataset.imageSource === "none";
      var isThisManifest = btn.dataset.imageSource === "manifest" && btn.dataset.filename === state.imageManifestName;
      var pressed = state.imageSource === "none" ? isNone : (state.imageSource === "manifest" && isThisManifest);
      btn.setAttribute("aria-pressed", String(pressed));
    });
  }

  function selectNoImage() {
    state.imageSource = "none";
    state.imageManifestName = "";
    els.authorImageUrl.value = "";
    els.authorImageUrlError.hidden = true;
    highlightImageButtons();
    updateImageAltVisibility();
  }

  function selectManifestImage(filename) {
    state.imageSource = "manifest";
    state.imageManifestName = filename;
    els.authorImageUrl.value = "";
    els.authorImageUrlError.hidden = true;
    highlightImageButtons();
    updateImageAltVisibility();
  }

  function selectImageFromUrl(url) {
    if (!url) { selectNoImage(); return; }
    if (url.indexOf(IMAGE_DIR) === 0) {
      var filename = url.slice(IMAGE_DIR.length);
      var manifestBtns = els.authorImageOptions.querySelectorAll('[data-image-source="manifest"]');
      var found = Array.prototype.some.call(manifestBtns, function (b) { return b.dataset.filename === filename; });
      if (found) { selectManifestImage(filename); return; }
    }
    state.imageSource = "url";
    state.imageManifestName = "";
    els.authorImageUrl.value = url;
    highlightImageButtons();
    updateImageAltVisibility();
  }

  function getSelectedImageUrl() {
    if (state.imageSource === "manifest" && state.imageManifestName) return IMAGE_DIR + state.imageManifestName;
    if (state.imageSource === "url") {
      var val = els.authorImageUrl.value.trim();
      return val && isSafeImageUrl(val) ? val : null;
    }
    return null;
  }

  function loadImageManifest() {
    // Browsers block fetch() on file:// pages; the URL field still works there.
    if (location.protocol === "file:") { els.authorManifestHint.hidden = false; return; }
    fetch("assets/images/story/manifest.json")
      .then(function (r) { if (!r.ok) throw new Error("not ok"); return r.json(); })
      .then(function (data) {
        var images = (data && Array.isArray(data.images)) ? data.images : [];
        var thumbs = images.map(function (filename) {
          return '<button type="button" class="author-image-opt" data-image-source="manifest" data-filename="' +
            escapeHtml(filename) + '" aria-pressed="false"><img loading="lazy" decoding="async" src="' + escapeHtml(IMAGE_DIR + filename) +
            '" alt="" loading="lazy" /><span>' + escapeHtml(filename) + "</span></button>";
        }).join("");
        els.authorImageOptions.insertAdjacentHTML("beforeend", thumbs);
      })
      .catch(function () { els.authorManifestHint.hidden = false; });
  }

  function setLanguageValue(code) {
    if (code === "sv" || code === "en" || code === "es") {
      els.authorLanguage.value = code;
      els.authorLanguageOtherField.hidden = true;
      els.authorLanguageOther.value = "";
    } else if (code) {
      els.authorLanguage.value = "other";
      els.authorLanguageOtherField.hidden = false;
      els.authorLanguageOther.value = code;
    } else {
      els.authorLanguage.value = "sv";
      els.authorLanguageOtherField.hidden = true;
      els.authorLanguageOther.value = "";
    }
  }

  function getLanguageValue() {
    var sel = els.authorLanguage.value;
    if (sel === "other") {
      var v = (els.authorLanguageOther.value || "").trim().toLowerCase();
      return /^[a-z]{2}$/.test(v) ? v : "";
    }
    return sel;
  }

  function buildContentHtml() {
    var body = els.postContent.innerHTML.trim();
    var imgUrl = getSelectedImageUrl();
    if (imgUrl) {
      var alt = escapeHtml(els.authorImageAlt.value.trim());
      return '<img loading="lazy" decoding="async" src="' + escapeHtml(imgUrl) + '" alt="' + alt + '">' + body;
    }
    return body;
  }

  function updatePreview() {
    var title = els.authorTitle.value.trim() || "Namnlös berättelse";
    var category = els.authorCategory.value;
    var age = els.authorAge.value;
    var lang = getLanguageValue() || "sv";
    var clean = sanitizeStoryHtml(buildContentHtml() || "<p>Inget innehåll ännu.</p>");
    var iconDir = getIconDir();
    var catChip = category
      ? '<span class="post-category"><img loading="lazy" decoding="async" src="' + escapeHtml(iconDir + getCategoryIcon(category) + ".webp") +
        '" alt="" width="20" height="20" loading="lazy" style="vertical-align:middle;border-radius:4px" /> ' + escapeHtml(category) + "</span>"
      : "";
    var ageChip = age ? '<span class="post-age">' + escapeHtml(age) + "</span>" : "";
    els.authorPreviewTitle.textContent = title;
    els.authorPreviewMeta.innerHTML = catChip + ageChip;
    els.authorPreviewBody.innerHTML = clean;
    els.authorPreviewBody.setAttribute("lang", LANG_ATTR_MAP[lang] || lang);
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 150);
  }

  function currentDraft() {
    return {
      title: els.authorTitle.value,
      category: els.authorCategory.value,
      age: els.authorAge.value,
      content: els.postContent.innerHTML,
      language: getLanguageValue() || els.authorLanguage.value,
      image: getSelectedImageUrl() || "",
      imageAlt: els.authorImageAlt.value || "",
      timestamp: Date.now()
    };
  }

  function saveDraftNow(opts) {
    opts = opts || {};
    var draft = currentDraft();
    if (!draft.title && !draft.content) {
      if (opts.explicit) showToast("Inget att spara som utkast.", "error");
      return;
    }
    if (state.editingId) {
      // Editing a published story must never overwrite the separate new-story draft.
      if (opts.explicit) showToast("Du redigerar en publicerad berättelse. Välj Uppdatera för att spara ändringarna.", "info");
      return;
    }
    if (safeSet(DRAFT_KEY, JSON.stringify(draft))) {
      state.unsaved = false;
      setDraftStatus("Utkast sparat " + formatTimeHHMM(new Date()), "saved");
      if (opts.explicit) showToast("Utkastet är sparat i den här webbläsaren.", "success");
    } else {
      setDraftStatus("Kunde inte spara utkast – kopiera din text eller exportera den", "error");
    }
  }

  function scheduleAutosave() {
    els.authorSuccessBanner.hidden = true;
    els.authorPublishError.hidden = true;
    state.unsaved = true;
    updateWordCount();
    clearTimeout(autosaveTimer);
    if (state.editingId) {
      setDraftStatus("Ändringar ej uppdaterade – välj Uppdatera för att spara", "dirty");
      return;
    }
    setDraftStatus("Sparar…", "dirty");
    autosaveTimer = setTimeout(saveDraftNow, 800);
  }

  function fillFromDraftLike(d, opts) {
    opts = opts || {};
    els.authorTitle.value = d.title || "";
    if (categoryKeys.indexOf(d.category) !== -1) els.authorCategory.value = d.category;
    if (AGE_OPTIONS.indexOf(d.age) !== -1) els.authorAge.value = d.age;
    setLanguageValue(d.language || "sv");
    els.postContent.innerHTML = opts.stripImage ? stripLeadingImage(d.content || "") : (d.content || "");
    updateWordCount();
    if (d.image) {
      selectImageFromUrl(d.image);
      els.authorImageAlt.value = d.imageAlt || "";
    } else {
      selectNoImage();
    }
  }

  function restoreDraftIfAny() {
    var raw = safeGet(DRAFT_KEY);
    if (!raw) return;
    try {
      var d = JSON.parse(raw);
      fillFromDraftLike(d);
      setDraftStatus("Utkast återställt", "saved");
      state.unsaved = false;
      updatePreview();
    } catch (e) { /* corrupt draft, ignore */ }
  }

  function resetEditor() {
    state.editingId = null;
    state.editingOriginal = null;
    els.authorTitle.value = "";
    els.authorCategory.value = "";
    els.authorAge.value = "";
    setLanguageValue("sv");
    els.postContent.innerHTML = "";
    selectNoImage();
    els.authorPublishBtn.textContent = "Publicera";
    els.authorPublishConfirm.hidden = true;
    els.authorClearConfirm.hidden = true;
    els.authorSuccessBanner.hidden = true;
    els.authorEditBanner.hidden = true;
    els.authorPublishError.hidden = true;
    closeInlineImagePanel();
    clearTimeout(autosaveTimer);
    state.unsaved = false;
    setDraftStatus("Inget utkast sparat", "idle");
    updateWordCount();
    updatePreview();
  }

  function validateForPublish() {
    var errors = [];
    if (!els.authorTitle.value.trim()) errors.push("Titel saknas.");
    var content = els.postContent.innerHTML.trim();
    if (!content || content === "<br>") errors.push("Berättelsen är tom.");
    if (els.authorLanguage.value === "other" && !getLanguageValue()) errors.push("Ange en giltig tvåbokstavs språkkod.");
    var hasImage = state.imageSource !== "none";
    if (hasImage) {
      var url = getSelectedImageUrl();
      if (!url) errors.push("Bildadressen måste vara https:// eller en relativ sökväg.");
      else if (!els.authorImageAlt.value.trim()) errors.push("Bildbeskrivning (alt-text) krävs när en bild är vald.");
    }
    return errors;
  }

  // Put the keyboard focus on the field that the first validation message is about.
  function focusFirstProblem(message) {
    var target = els.authorTitle;
    if (/Berättelsen är tom/.test(message)) target = els.postContent;
    else if (/språkkod/.test(message)) target = els.authorLanguageOther;
    else if (/alt-text/.test(message)) target = els.authorImageAlt;
    else if (/Bildadressen/.test(message)) target = els.authorImageUrl;
    switchTab("write");
    target.focus();
  }

  function showPublishProblems(errors) {
    els.authorPublishConfirm.hidden = true;
    els.authorPublishError.textContent = "⚠ " + errors.join(" ");
    els.authorPublishError.hidden = false;
    focusFirstProblem(errors[0]);
  }

  function openPublishConfirm() {
    var errors = validateForPublish();
    if (errors.length) { showPublishProblems(errors); return; }
    var isEdit = !!state.editingId;
    var words = countWords(els.postContent.innerText || els.postContent.textContent);
    var title = els.authorTitle.value.trim();
    els.authorPublishConfirmText.textContent =
      (isEdit ? "Uppdatera “" : "Publicera “") + title + "” (" + words + " ord)? " +
      (isEdit ? "Ändringarna syns direkt på sajten." : "Berättelsen syns direkt på sajten.");
    els.authorPublishYes.textContent = isEdit ? "Ja, uppdatera" : "Ja, publicera";
    els.authorPublishError.hidden = true;
    els.authorPublishConfirm.hidden = false;
    els.authorPublishConfirmText.focus();
  }

  function closePublishConfirm(returnFocus) {
    els.authorPublishConfirm.hidden = true;
    if (returnFocus) els.authorPublishBtn.focus();
  }

  function showPreview() {
    updatePreview();
    switchTab("preview");
    var target = window.matchMedia("(min-width: 900px)").matches ? els.authorPanelPreview : els.authorTabPreview;
    if (target.scrollIntoView) target.scrollIntoView({ block: "nearest" });
    if (!window.matchMedia("(min-width: 900px)").matches) els.authorTabPreview.focus();
  }

  function tryOpenStory(id, attempt) {
    attempt = attempt || 0;
    if (findPostIndexByIdentifier(id) !== -1) {
      openStoryModalByIdentifier(id);
      return;
    }
    if (attempt < 5) {
      setTimeout(function () { tryOpenStory(id, attempt + 1); }, 300);
    } else {
      var stories = document.getElementById("stories");
      if (stories) stories.scrollIntoView({ behavior: "smooth" });
    }
  }

  function showSuccessBanner(message, id) {
    els.authorSuccessText.textContent = message;
    els.authorSuccessBanner.hidden = false;
    els.authorViewStoryBtn.onclick = function () { tryOpenStory(id); };
    if (els.authorSuccessBanner.scrollIntoView) els.authorSuccessBanner.scrollIntoView({ block: "nearest" });
    els.authorViewStoryBtn.focus();
  }

  function doPublish() {
    var errors = validateForPublish();
    if (errors.length) {
      showToast(errors[0], "error");
      showPublishProblems(errors);
      return;
    }
    els.authorPublishYes.disabled = true;
    els.authorPublishYes.textContent = "Sparar…";
    els.authorPublishConfirm.setAttribute("aria-busy", "true");
    var isEdit = !!state.editingId;
    var post = {
      title: els.authorTitle.value.trim(),
      content: buildContentHtml(),
      category: els.authorCategory.value || "",
      age: els.authorAge.value || "",
      language: getLanguageValue() || "sv",
      date: isEdit && state.editingOriginal ? state.editingOriginal.date : formatDateSv(new Date()),
      timestamp: isEdit && state.editingOriginal ? state.editingOriginal.timestamp : Date.now()
    };
    var imgUrl = getSelectedImageUrl();
    if (imgUrl) {
      post.image = imgUrl;
      post.imageAlt = els.authorImageAlt.value.trim();
    }

    var task = isEdit ? window.C.update(state.editingId, post) : window.C.save(post);
    Promise.resolve(task)
      .then(function (result) {
        var id = isEdit ? state.editingId : result;
        // Only a published *new* story consumes the draft; editing must leave a pending draft alone.
        if (!isEdit) safeRemove(DRAFT_KEY);
        resetEditor();
        if (isEdit) restoreDraftIfAny();
        showSuccessBanner(isEdit ? "Berättelsen har uppdaterats!" : "Berättelsen har publicerats!", id);
      })
      .catch(function (e) {
        console.error("Publish error:", e);
        // Nothing is cleared: the text stays in the editor and is also kept as a draft.
        saveDraftNow();
        showToast("Ett fel uppstod. Försök igen.", "error");
        els.authorPublishError.textContent = "⚠ Det gick inte att publicera just nu. Din text är kvar" +
          (isEdit ? "" : " och sparad som utkast") + ". Kontrollera uppkopplingen och försök igen.";
        els.authorPublishError.hidden = false;
        if (els.authorPublishError.scrollIntoView) els.authorPublishError.scrollIntoView({ block: "nearest" });
        els.authorPublishBtn.focus();
      })
      .finally(function () {
        els.authorPublishYes.disabled = false;
        els.authorPublishConfirm.removeAttribute("aria-busy");
        els.authorPublishConfirm.hidden = true;
      });
  }

  function importJsonText(text) {
    var data = JSON.parse(text);
    if (!data || typeof data.title !== "string" || typeof data.content !== "string") {
      throw new Error('JSON måste innehålla fälten "title" och "content".');
    }
    fillFromDraftLike({
      title: data.title,
      category: data.category,
      age: data.age,
      content: sanitizeStoryHtml(data.content),
      language: data.language,
      image: data.image && isSafeImageUrl(data.image) ? data.image : "",
      imageAlt: data.imageAlt
    });
    saveDraftNow();
    updatePreview();
  }

  function importMarkdownText(text) {
    var lines = text.split(/\r?\n/);
    var title = "";
    var bodyLines = lines;
    if (lines.length && /^#\s+/.test(lines[0])) {
      title = lines[0].replace(/^#\s+/, "").trim();
      bodyLines = lines.slice(1);
      if (bodyLines.length && bodyLines[0].trim() === "") bodyLines = bodyLines.slice(1);
    }
    var html = sanitizeStoryHtml(markdownToHtml(bodyLines.join("\n")));
    if (title) els.authorTitle.value = title;
    els.postContent.innerHTML = html;
    selectNoImage();
    saveDraftNow();
    updatePreview();
  }

  function handleImportFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        if (/\.json$/i.test(file.name)) importJsonText(reader.result);
        else importMarkdownText(reader.result);
        els.authorImportError.hidden = true;
      } catch (e) {
        els.authorImportError.hidden = false;
        els.authorImportError.textContent = "⚠ Kunde inte läsa filen: " + e.message;
      }
    };
    reader.onerror = function () {
      els.authorImportError.hidden = false;
      els.authorImportError.textContent = "⚠ Kunde inte läsa filen.";
    };
    reader.readAsText(file);
  }

  function switchTab(name) {
    var writeActive = name === "write";
    els.authorTabWrite.setAttribute("aria-selected", String(writeActive));
    els.authorTabPreview.setAttribute("aria-selected", String(!writeActive));
    els.authorPanelWrite.classList.toggle("is-active", writeActive);
    els.authorPanelPreview.classList.toggle("is-active", !writeActive);
    els.authorTabWrite.tabIndex = writeActive ? 0 : -1;
    els.authorTabPreview.tabIndex = writeActive ? -1 : 0;
    if (!writeActive) updatePreview();
  }

  // ---- Inline image (by URL) ----
  function isInlineImagePanelOpen() { return !els.authorInlineImagePanel.hidden; }

  function rememberSelection() {
    var sel = window.getSelection && window.getSelection();
    if (sel && sel.rangeCount && els.postContent.contains(sel.anchorNode)) {
      state.savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  function openInlineImagePanel(prefillUrl) {
    rememberSelection();
    els.authorInlineImagePanel.hidden = false;
    var btn = els.toolbar.querySelector('[data-cmd="image"]');
    if (btn) btn.setAttribute("aria-expanded", "true");
    els.authorInlineImageError.hidden = true;
    if (prefillUrl) els.authorInlineImageUrl.value = prefillUrl;
    (prefillUrl ? els.authorInlineImageAlt : els.authorInlineImageUrl).focus();
  }

  function closeInlineImagePanel(returnFocus) {
    if (!els.authorInlineImagePanel || els.authorInlineImagePanel.hidden) return;
    els.authorInlineImagePanel.hidden = true;
    els.authorInlineImageUrl.value = "";
    els.authorInlineImageAlt.value = "";
    els.authorInlineImageError.hidden = true;
    var btn = els.toolbar.querySelector('[data-cmd="image"]');
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (returnFocus) (btn || els.postContent).focus();
  }

  function insertInlineImage() {
    var url = els.authorInlineImageUrl.value.trim();
    var alt = els.authorInlineImageAlt.value.trim();
    var problem = "";
    if (!url || !isSafeImageUrl(url)) problem = "Ange en bildadress som börjar med https://";
    else if (!alt) problem = "Beskriv bilden med ord (alt-text) så att alla kan ta del av den.";
    if (problem) {
      els.authorInlineImageError.textContent = "⚠ " + problem;
      els.authorInlineImageError.hidden = false;
      (!url || !isSafeImageUrl(url) ? els.authorInlineImageUrl : els.authorInlineImageAlt).focus();
      return;
    }
    els.postContent.focus();
    if (state.savedRange) {
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(state.savedRange);
    }
    document.execCommand("insertHTML", false, '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(alt) + '">');
    state.savedRange = null;
    closeInlineImagePanel(false);
    els.postContent.focus();
    scheduleAutosave();
    schedulePreview();
  }

  var IMAGE_URL_RE = /^https:\/\/\S+\.(?:png|jpe?g|gif|webp|avif|svg)(?:\?\S*)?$/i;

  function refreshToolbarState() {
    if (!els.toolbar) return;
    ["bold", "italic"].forEach(function (cmd) {
      var btn = els.toolbar.querySelector('[data-cmd="' + cmd + '"]');
      var on = false;
      try {
        var sel = window.getSelection();
        on = !!(sel && sel.anchorNode && els.postContent.contains(sel.anchorNode) && document.queryCommandState(cmd));
      } catch (e) { on = false; }
      if (btn) btn.setAttribute("aria-pressed", String(on));
    });
  }

  function bindEvents() {
    [els.authorTitle, els.authorCategory, els.authorAge, els.authorImageAlt].forEach(function (el) {
      el.addEventListener("input", function () { scheduleAutosave(); schedulePreview(); });
    });
    els.authorLanguage.addEventListener("change", function () {
      els.authorLanguageOtherField.hidden = els.authorLanguage.value !== "other";
      scheduleAutosave();
      schedulePreview();
    });
    els.authorLanguageOther.addEventListener("input", function () { scheduleAutosave(); schedulePreview(); });

    els.postContent.addEventListener("input", function () { scheduleAutosave(); schedulePreview(); });
    els.postContent.addEventListener("paste", function (e) {
      e.preventDefault();
      var cd = e.clipboardData || window.clipboardData;
      var files = cd && cd.files ? cd.files : [];
      var text = cd.getData("text/plain");
      if (!text && files.length && /^image\//.test(files[0].type)) {
        // No Storage/upload on purpose: guide the writer to the URL route instead of silently dropping it.
        showToast("Bilder kan inte klistras in som fil. Ange en bildadress i stället.", "info");
        openInlineImagePanel();
        return;
      }
      var trimmed = (text || "").trim();
      if (IMAGE_URL_RE.test(trimmed)) {
        // A pasted image address becomes an image (after the writer adds alt text), not a loose link.
        openInlineImagePanel(trimmed);
        return;
      }
      document.execCommand("insertText", false, text);
    });
    els.postContent.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault();
        showToast("Bilder kan inte släppas in som fil. Ange en bildadress i stället.", "info");
      }
    });
    els.postContent.addEventListener("keyup", refreshToolbarState);
    els.postContent.addEventListener("mouseup", refreshToolbarState);
    els.postContent.addEventListener("focus", refreshToolbarState);
    els.postContent.addEventListener("blur", function () { saveDraftNow(); });
    document.getElementById("authorContentLabel").addEventListener("click", function () { els.postContent.focus(); });

    els.toolbar.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-cmd]");
      if (!btn) return;
      if (btn.dataset.cmd === "image") {
        if (isInlineImagePanelOpen()) closeInlineImagePanel(true);
        else openInlineImagePanel();
        return;
      }
      els.postContent.focus();
      switch (btn.dataset.cmd) {
        case "bold": document.execCommand("bold"); break;
        case "italic": document.execCommand("italic"); break;
        case "h2": document.execCommand("formatBlock", false, "H2"); break;
        case "quote": document.execCommand("formatBlock", false, "BLOCKQUOTE"); break;
        case "list": document.execCommand("insertUnorderedList"); break;
        case "undo": document.execCommand("undo"); break;
        case "redo": document.execCommand("redo"); break;
      }
      refreshToolbarState();
      scheduleAutosave();
      schedulePreview();
    });

    els.authorInlineImageInsert.addEventListener("click", insertInlineImage);
    els.authorInlineImageCancel.addEventListener("click", function () { closeInlineImagePanel(true); });
    [els.authorInlineImageUrl, els.authorInlineImageAlt].forEach(function (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); insertInlineImage(); }
        else if (e.key === "Escape") { e.stopPropagation(); closeInlineImagePanel(true); }
      });
    });

    els.authorImageOptions.addEventListener("click", function (e) {
      var btn = e.target.closest(".author-image-opt");
      if (!btn) return;
      if (btn.dataset.imageSource === "none") selectNoImage();
      else selectManifestImage(btn.dataset.filename);
      scheduleAutosave();
      schedulePreview();
    });

    els.authorImageUrl.addEventListener("input", function () {
      var val = els.authorImageUrl.value.trim();
      if (val) {
        state.imageSource = "url";
        state.imageManifestName = "";
        highlightImageButtons();
        els.authorImageUrlError.hidden = isSafeImageUrl(val);
        if (!els.authorImageUrlError.hidden) els.authorImageUrlError.textContent = "⚠ Ange en https-adress eller en relativ sökväg.";
      } else if (state.imageSource === "url") {
        selectNoImage();
      }
      updateImageAltVisibility();
      scheduleAutosave();
      schedulePreview();
    });

    els.authorSaveDraftBtn.addEventListener("click", function () { saveDraftNow({ explicit: true }); });

    els.authorExportJsonBtn.addEventListener("click", function () {
      var draft = currentDraft();
      var slug = generateStorySlug(draft.title || "utkast") || "utkast";
      downloadBlob(JSON.stringify(draft, null, 2), slug + ".json", "application/json");
    });

    els.authorExportMdBtn.addEventListener("click", function () {
      var title = els.authorTitle.value.trim() || "Namnlös berättelse";
      var imgUrl = getSelectedImageUrl();
      var imgMd = imgUrl ? "![" + (els.authorImageAlt.value.trim() || "") + "](" + imgUrl + ")\n\n" : "";
      var md = "# " + title + "\n\n" + imgMd + htmlToMarkdown(els.postContent.innerHTML);
      var slug = generateStorySlug(title) || "utkast";
      downloadBlob(md, slug + ".md", "text/markdown");
    });

    els.authorImportInput.addEventListener("change", function () {
      var file = els.authorImportInput.files && els.authorImportInput.files[0];
      if (file) handleImportFile(file);
      els.authorImportInput.value = "";
    });

    els.authorClearDraftBtn.addEventListener("click", function () {
      els.authorClearConfirm.hidden = false;
      els.authorClearConfirmNo.focus();
    });
    els.authorClearConfirmNo.addEventListener("click", function () {
      els.authorClearConfirm.hidden = true;
      els.authorClearDraftBtn.focus();
    });
    els.authorClearConfirmYes.addEventListener("click", function () {
      safeRemove(DRAFT_KEY);
      resetEditor();
      els.authorClearConfirm.hidden = true;
      showToast("Utkastet har rensats.", "success");
      els.authorTitle.focus();
    });

    els.authorPublishBtn.addEventListener("click", openPublishConfirm);
    els.authorPublishNo.addEventListener("click", function () { closePublishConfirm(true); });
    els.authorPublishYes.addEventListener("click", doPublish);
    els.authorPublishPreview.addEventListener("click", function () { closePublishConfirm(false); showPreview(); });
    els.authorPreviewBtn.addEventListener("click", showPreview);
    els.authorPreviewBack.addEventListener("click", function () { switchTab("write"); els.postContent.focus(); });

    els.authorCancelEditBtn.addEventListener("click", function () {
      resetEditor();
      restoreDraftIfAny(); // bring back the unpublished draft that was set aside while editing
    });

    els.authorTabWrite.addEventListener("click", function () { switchTab("write"); });
    els.authorTabPreview.addEventListener("click", function () { switchTab("preview"); });
    switchTab("write");
    [els.authorTabWrite, els.authorTabPreview].forEach(function (tab) {
      tab.addEventListener("keydown", function (e) {
        var key = e.key;
        if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") return;
        e.preventDefault();
        var toPreview = key === "End" || (key !== "Home" && document.activeElement === els.authorTabWrite);
        switchTab(toPreview ? "preview" : "write");
        (toPreview ? els.authorTabPreview : els.authorTabWrite).focus();
      });
    });

    // Keyboard shortcuts while the writer is inside the editor section.
    els.section.addEventListener("keydown", function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") {
        if (!els.authorPublishConfirm.hidden) { e.preventDefault(); closePublishConfirm(true); }
        else if (!els.authorClearConfirm.hidden) { e.preventDefault(); els.authorClearConfirm.hidden = true; els.authorClearDraftBtn.focus(); }
        else if (isInlineImagePanelOpen()) { e.preventDefault(); closeInlineImagePanel(true); }
        return;
      }
      if (!mod || e.altKey) return;
      var k = (e.key || "").toLowerCase();
      if (k === "s") { e.preventDefault(); saveDraftNow({ explicit: true }); }
      else if (k === "enter") { e.preventDefault(); openPublishConfirm(); } // only opens the question; never publishes
    });

    // Don't silently lose text that exists nowhere else.
    window.addEventListener("beforeunload", function (e) {
      if (!built || !state.unsaved) return;
      var hasText = els.authorTitle.value.trim() || els.postContent.textContent.trim();
      if (!hasText) return;
      e.preventDefault();
      e.returnValue = "";
    });
    document.addEventListener("selectionchange", function () {
      if (document.activeElement === els.postContent) refreshToolbarState();
    });
  }

  function ensureBuilt() {
    if (built) return;
    built = true;
    render();
    bindEvents();
    loadImageManifest();
    restoreDraftIfAny();
  }

  function open(post) {
    ensureBuilt();
    resetEditor();
    if (post && post.id) {
      state.editingId = post.id;
      state.editingOriginal = post;
      fillFromDraftLike(post, { stripImage: !!post.image });
      els.authorPublishBtn.textContent = "Uppdatera berättelsen";
      els.authorEditBanner.hidden = false;
      els.authorEditingTitle.textContent = post.title || "";
      setDraftStatus("Redigerar publicerad berättelse", "idle");
    }
    updatePreview();
    var section = document.getElementById("authorSection");
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (section) section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    if (els.authorSectionHeading) els.authorSectionHeading.focus({ preventScroll: true });
  }

  /* Keep the sticky toolbar/preview just under the (sticky) site navigation, whatever its height. */
  function syncNavHeight() {
    var nav = document.querySelector(".site-nav");
    if (nav) document.documentElement.style.setProperty("--site-nav-h", Math.ceil(nav.getBoundingClientRect().height) + "px");
  }
  window.addEventListener("resize", syncNavHeight);

  document.addEventListener("DOMContentLoaded", function () {
    ensureBuilt();
    syncNavHeight();
  });

  window.Author = { open: open };
})();
