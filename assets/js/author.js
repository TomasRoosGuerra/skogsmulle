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
    imageManifestName: ""
  };

  var els = {};
  var categoryKeys = [];
  var built = false;
  var autosaveTimer = null;
  var previewTimer = null;

  function safeGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) {}
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
              '<input type="text" id="authorTitle" required placeholder="T.ex. Skogsmulles stora äventyr" />' +
            "</div>" +
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
            '<fieldset class="form-group author-image-field">' +
              "<legend>Bild (valfritt)</legend>" +
              '<div class="author-image-options" id="authorImageOptions">' +
                '<button type="button" class="author-image-opt" data-image-source="none" aria-pressed="true">Ingen bild</button>' +
              "</div>" +
              '<p class="author-help-text" id="authorManifestHint" hidden>Bildlistan kan inte läsas härifrån – ange en https-adress istället.</p>' +
              '<label for="authorImageUrl">Eller bildadress (https://…)</label>' +
              '<input type="text" id="authorImageUrl" placeholder="https://exempel.se/bild.jpg" />' +
              '<p class="author-field-error" id="authorImageUrlError" hidden></p>' +
              '<p class="author-help-text">Lägg bildfiler i mappen <code>assets/images/story/</code> och lägg till filnamnet i <code>manifest.json</code>.</p>' +
              '<div class="form-group" id="authorImageAltField" hidden>' +
                '<label for="authorImageAlt">Bildbeskrivning (alt-text)</label>' +
                '<input type="text" id="authorImageAlt" placeholder="Beskriv bilden med ord…" />' +
              "</div>" +
            "</fieldset>" +
            '<div class="form-group">' +
              '<label id="authorContentLabel" for="postContent">Berättelse</label>' +
              '<div class="editor-toolbar" role="toolbar" aria-label="Textformat">' +
                '<button type="button" data-cmd="bold" aria-label="Fet text" title="Fet"><strong>Fet</strong></button>' +
                '<button type="button" data-cmd="italic" aria-label="Kursiv text" title="Kursiv"><em>Kursiv</em></button>' +
                '<button type="button" data-cmd="h2" aria-label="Rubrik" title="Rubrik">Rubrik</button>' +
                '<button type="button" data-cmd="quote" aria-label="Citat" title="Citat">Citat</button>' +
                '<button type="button" data-cmd="list" aria-label="Punktlista" title="Lista">Lista</button>' +
                '<button type="button" data-cmd="undo" aria-label="Ångra" title="Ångra">Ångra</button>' +
                '<button type="button" data-cmd="redo" aria-label="Gör om" title="Gör om">Gör om</button>' +
              "</div>" +
              '<div id="postContent" class="rich-editor" contenteditable="true" aria-labelledby="authorContentLabel" data-placeholder="Skriv din berättelse här…"></div>' +
            "</div>" +
            '<p class="author-draft-status" id="authorDraftStatus" aria-live="polite">Ej sparat</p>' +
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
            '<div class="author-publish-row">' +
              '<button type="button" class="btn btn-primary author-publish-btn" id="authorPublishBtn">Publicera</button>' +
            "</div>" +
            '<div class="author-confirm-panel" id="authorPublishConfirm" hidden role="group" aria-label="Bekräfta publicering">' +
              "<p>Är du säker? Berättelsen publiceras direkt på sajten.</p>" +
              '<button type="button" class="btn btn-primary" id="authorPublishYes">Publicera</button>' +
              '<button type="button" class="btn btn-secondary" id="authorPublishNo">Avbryt</button>' +
            "</div>" +
            '<div class="author-success-banner" id="authorSuccessBanner" role="status" hidden>' +
              '<p id="authorSuccessText"></p>' +
              '<button type="button" class="btn btn-secondary" id="authorViewStoryBtn">Visa berättelsen</button>' +
            "</div>" +
          "</div>" +
        "</div>" +
        '<div class="author-preview-pane" id="authorPanelPreview" role="tabpanel" aria-labelledby="authorTabPreview">' +
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
      "authorPublishYes", "authorPublishNo", "authorSuccessBanner", "authorSuccessText",
      "authorViewStoryBtn", "authorPreviewMeta", "authorPreviewTitle", "authorPreviewBody"
    ].forEach(function (id) { els[id] = document.getElementById(id); });
    els.postContent = document.getElementById("postContent");
    els.toolbar = section.querySelector(".editor-toolbar");
  }

  function setDraftStatus(text) { if (els.authorDraftStatus) els.authorDraftStatus.textContent = text; }

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
            escapeHtml(filename) + '" aria-pressed="false"><img src="' + escapeHtml(IMAGE_DIR + filename) +
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
      return '<img src="' + escapeHtml(imgUrl) + '" alt="' + alt + '">' + body;
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
      ? '<span class="post-category"><img src="' + escapeHtml(iconDir + getCategoryIcon(category) + ".webp") +
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
    safeSet(DRAFT_KEY, JSON.stringify(draft));
    setDraftStatus("Utkast sparat " + formatTimeHHMM(new Date()));
  }

  function scheduleAutosave() {
    els.authorSuccessBanner.hidden = true;
    clearTimeout(autosaveTimer);
    setDraftStatus("Ej sparat");
    autosaveTimer = setTimeout(saveDraftNow, 800);
  }

  function fillFromDraftLike(d, opts) {
    opts = opts || {};
    els.authorTitle.value = d.title || "";
    if (categoryKeys.indexOf(d.category) !== -1) els.authorCategory.value = d.category;
    if (AGE_OPTIONS.indexOf(d.age) !== -1) els.authorAge.value = d.age;
    setLanguageValue(d.language || "sv");
    els.postContent.innerHTML = opts.stripImage ? stripLeadingImage(d.content || "") : (d.content || "");
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
      setDraftStatus("Utkast återställt");
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
  }

  function doPublish() {
    var errors = validateForPublish();
    if (errors.length) {
      showToast(errors[0], "error");
      els.authorPublishConfirm.hidden = true;
      return;
    }
    els.authorPublishYes.disabled = true;
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
        safeRemove(DRAFT_KEY);
        showSuccessBanner(isEdit ? "Berättelsen har uppdaterats!" : "Berättelsen har publicerats!", id);
        resetEditor();
      })
      .catch(function (e) {
        console.error("Publish error:", e);
        showToast("Ett fel uppstod. Försök igen.", "error");
      })
      .finally(function () {
        els.authorPublishYes.disabled = false;
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
      var text = (e.clipboardData || window.clipboardData).getData("text/plain");
      document.execCommand("insertText", false, text);
    });

    els.toolbar.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-cmd]");
      if (!btn) return;
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
      scheduleAutosave();
      schedulePreview();
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

    els.authorClearDraftBtn.addEventListener("click", function () { els.authorClearConfirm.hidden = false; });
    els.authorClearConfirmNo.addEventListener("click", function () { els.authorClearConfirm.hidden = true; });
    els.authorClearConfirmYes.addEventListener("click", function () {
      safeRemove(DRAFT_KEY);
      resetEditor();
      setDraftStatus("Ej sparat");
      els.authorClearConfirm.hidden = true;
      showToast("Utkastet har rensats.", "success");
    });

    els.authorPublishBtn.addEventListener("click", function () { els.authorPublishConfirm.hidden = false; });
    els.authorPublishNo.addEventListener("click", function () { els.authorPublishConfirm.hidden = true; });
    els.authorPublishYes.addEventListener("click", doPublish);

    els.authorCancelEditBtn.addEventListener("click", resetEditor);

    els.authorTabWrite.addEventListener("click", function () { switchTab("write"); });
    els.authorTabPreview.addEventListener("click", function () { switchTab("preview"); });
    [els.authorTabWrite, els.authorTabPreview].forEach(function (tab) {
      tab.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        var toPreview = document.activeElement === els.authorTabWrite;
        switchTab(toPreview ? "preview" : "write");
        (toPreview ? els.authorTabPreview : els.authorTabWrite).focus();
      });
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
    }
    updatePreview();
    var section = document.getElementById("authorSection");
    if (section) section.scrollIntoView({ behavior: "smooth" });
    if (els.authorSectionHeading) els.authorSectionHeading.focus();
  }

  document.addEventListener("DOMContentLoaded", ensureBuilt);

  window.Author = { open: open };
})();
