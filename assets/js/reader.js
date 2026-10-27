/* Story reader: text size, extra air, read-aloud, music, progress, gentle animations.
   Plain script (no modules, no dependencies). Exposes window.StoryReader. */
(function () {
  "use strict";

  var SIZE_KEY = "reader.size";
  var SPACING_KEY = "reader.spacing";
  var SIZES = ["1.125rem", "1.375rem", "1.625rem", "1.875rem", "2.25rem"];
  var DEFAULT_SIZE_INDEX = 1;
  var LANG_MAP = { sv: "sv-SE", en: "en-US" };

  var state = {
    sizeIndex: DEFAULT_SIZE_INDEX,
    spacing: false,
    speaking: false,
    music: false,
    audio: null,
    paragraphs: [],
    currentStory: null
  };

  var els = {};
  var reduceMotionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  function reduceMotion() {
    return !!(reduceMotionQuery && reduceMotionQuery.matches);
  }

  function safeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {}
  }

  function getDialogEls() {
    var modal = document.getElementById("storyModal");
    if (!modal) return null;
    var dialog = modal.querySelector(".story-modal-content");
    var meta = document.getElementById("storyModalMeta");
    var body = document.getElementById("storyModalBody");
    if (!dialog || !meta || !body) return null;
    return { modal: modal, dialog: dialog, meta: meta, body: body };
  }

  function makeButton(label, ariaLabel, withPressed) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reader-btn";
    btn.textContent = label;
    if (ariaLabel) btn.setAttribute("aria-label", ariaLabel);
    if (withPressed) btn.setAttribute("aria-pressed", "false");
    return btn;
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text;
  }

  function applySize(body, index) {
    body.style.setProperty("--reader-size", SIZES[index]);
  }

  function setSize(index, body) {
    index = Math.max(0, Math.min(SIZES.length - 1, index));
    state.sizeIndex = index;
    applySize(body, index);
    safeSet(SIZE_KEY, String(index));
  }

  function applySpacing(body, on) {
    body.classList.toggle("reader-airy", !!on);
  }

  function clearHighlight() {
    state.paragraphs.forEach(function (p) {
      p.classList.remove("reader-reading");
    });
  }

  function resolveLang(story) {
    var code = story && story.language;
    if (code && LANG_MAP[code]) return LANG_MAP[code];
    if (code) return code;
    return document.documentElement.lang || "sv-SE";
  }

  function pickVoice(lang) {
    if (!window.speechSynthesis) return null;
    var voices = window.speechSynthesis.getVoices() || [];
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].lang && voices[i].lang.indexOf(lang) === 0) return voices[i];
    }
    return null;
  }

  function resetSpeechButton() {
    if (!els.speechBtn) return;
    els.speechBtn.setAttribute("aria-pressed", "false");
    els.speechBtn.textContent = "Läs högt";
  }

  function stopSpeech() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (state.speaking) setStatus("Uppläsning stoppad");
    state.speaking = false;
    clearHighlight();
    resetSpeechButton();
  }

  function startSpeech(refs) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    var paragraphs = Array.prototype.slice.call(refs.body.querySelectorAll("p"));
    state.paragraphs = paragraphs;
    var lang = resolveLang(state.currentStory);
    var voice = pickVoice(lang);
    var queue = paragraphs.slice();

    state.speaking = true;
    els.speechBtn.setAttribute("aria-pressed", "true");
    els.speechBtn.textContent = "Stoppa";
    setStatus("Läser högt");

    function speakOne(text, onDone) {
      var utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      if (voice) utter.voice = voice;
      utter.onend = onDone;
      utter.onerror = onDone;
      window.speechSynthesis.speak(utter);
    }

    function speakNext() {
      clearHighlight();
      if (!state.speaking) return;
      if (queue.length === 0) {
        state.speaking = false;
        resetSpeechButton();
        setStatus("Uppläsning stoppad");
        return;
      }
      var p = queue.shift();
      p.classList.add("reader-reading");
      p.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
      speakOne(p.textContent, speakNext);
    }

    var titleEl = document.getElementById("storyModalTitle");
    if (titleEl && titleEl.textContent) {
      speakOne(titleEl.textContent, speakNext);
    } else {
      speakNext();
    }
  }

  function toggleSpeech(refs) {
    if (state.speaking) {
      stopSpeech();
      setStatus("Uppläsning stoppad");
    } else {
      startSpeech(refs);
    }
  }

  function pauseMusic() {
    if (state.audio && state.music) state.audio.pause();
    state.music = false;
    if (els.musicBtn) els.musicBtn.setAttribute("aria-pressed", "false");
  }

  function toggleMusic() {
    if (!state.audio) {
      state.audio = new Audio("Skogsmulle.mp3");
      state.audio.loop = true;
      state.audio.volume = 0.35;
    }
    if (state.music) {
      pauseMusic();
      setStatus("Musiken stoppad");
      return;
    }
    var playPromise = state.audio.play();
    state.music = true;
    els.musicBtn.setAttribute("aria-pressed", "true");
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise
        .then(function () {
          setStatus("Musik spelas");
        })
        .catch(function () {
          state.music = false;
          els.musicBtn.setAttribute("aria-pressed", "false");
          setStatus("Kunde inte spela musiken");
        });
    }
  }

  function buildToolbar(refs) {
    var existing = refs.dialog.querySelector(".reader-toolbar");
    if (existing) return existing;

    var toolbar = document.createElement("div");
    toolbar.className = "reader-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Läsinställningar");

    var sizeGroup = document.createElement("div");
    sizeGroup.className = "reader-toolbar-group";
    var btnSmaller = makeButton("A−", "Mindre text");
    var btnNormal = makeButton("A", "Normal text");
    var btnLarger = makeButton("A+", "Större text");
    btnSmaller.addEventListener("click", function () {
      setSize(state.sizeIndex - 1, refs.body);
    });
    btnNormal.addEventListener("click", function () {
      setSize(DEFAULT_SIZE_INDEX, refs.body);
    });
    btnLarger.addEventListener("click", function () {
      setSize(state.sizeIndex + 1, refs.body);
    });
    sizeGroup.appendChild(btnSmaller);
    sizeGroup.appendChild(btnNormal);
    sizeGroup.appendChild(btnLarger);
    toolbar.appendChild(sizeGroup);

    var spacingBtn = makeButton("Extra luft", null, true);
    spacingBtn.addEventListener("click", function () {
      state.spacing = !state.spacing;
      applySpacing(refs.body, state.spacing);
      spacingBtn.setAttribute("aria-pressed", String(state.spacing));
      safeSet(SPACING_KEY, state.spacing ? "1" : "0");
    });
    toolbar.appendChild(spacingBtn);
    els.spacingBtn = spacingBtn;

    if (window.speechSynthesis) {
      var speechBtn = makeButton("Läs högt", null, true);
      speechBtn.addEventListener("click", function () {
        toggleSpeech(refs);
      });
      toolbar.appendChild(speechBtn);
      els.speechBtn = speechBtn;
    }

    var musicBtn = makeButton("Spela mysig musik", null, true);
    musicBtn.addEventListener("click", toggleMusic);
    toolbar.appendChild(musicBtn);
    els.musicBtn = musicBtn;

    var status = document.createElement("p");
    status.className = "reader-status";
    status.setAttribute("aria-live", "polite");
    toolbar.appendChild(status);
    els.status = status;

    refs.dialog.insertBefore(toolbar, refs.body);
    return toolbar;
  }

  function ensureProgressBar(dialog) {
    var bar = dialog.querySelector(".reader-progress");
    if (bar) return bar;
    bar = document.createElement("div");
    bar.className = "reader-progress";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", "0");
    bar.setAttribute("aria-label", "Lässtatus");
    var fill = document.createElement("div");
    fill.className = "reader-progress-fill";
    bar.appendChild(fill);
    dialog.insertBefore(bar, dialog.firstChild);
    return bar;
  }

  function updateProgress(dialog) {
    var bar = dialog.querySelector(".reader-progress");
    var fill = bar && bar.querySelector(".reader-progress-fill");
    if (!bar || !fill) return;
    var scrollable = dialog.scrollHeight - dialog.clientHeight;
    var pct = scrollable > 0
      ? Math.min(100, Math.max(0, Math.round((dialog.scrollTop / scrollable) * 100)))
      : 0;
    bar.setAttribute("aria-valuenow", String(pct));
    fill.style.width = pct + "%";
  }

  function attachScrollListener(dialog) {
    if (dialog.dataset.readerScrollBound) return;
    dialog.dataset.readerScrollBound = "1";
    dialog.addEventListener("scroll", function () {
      updateProgress(dialog);
    });
  }

  function appendEndOrnament(body) {
    var ornament = document.createElement("div");
    ornament.className = "reader-end";
    var img = document.createElement("img");
    img.src = "assets/images/illustrations/igelkotten-600.webp";
    img.alt = "";
    img.loading = "lazy";
    img.width = 96;
    img.height = 96;
    img.addEventListener(
      "error",
      function () {
        this.style.display = "none";
      },
      { once: true }
    );
    var text = document.createElement("p");
    text.className = "reader-end-text";
    text.textContent = "Slut";
    ornament.appendChild(img);
    ornament.appendChild(text);
    body.appendChild(ornament);
  }

  function animateParagraphsIn(body) {
    body.classList.remove("reader-anim-in");
    void body.offsetWidth;
    body.classList.add("reader-anim-in");
  }

  function restorePrefs(refs) {
    var sizeRaw = safeGet(SIZE_KEY);
    var index = DEFAULT_SIZE_INDEX;
    if (sizeRaw !== null) {
      var parsed = parseInt(sizeRaw, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed < SIZES.length) index = parsed;
    }
    setSize(index, refs.body);

    state.spacing = safeGet(SPACING_KEY) === "1";
    applySpacing(refs.body, state.spacing);
    if (els.spacingBtn) els.spacingBtn.setAttribute("aria-pressed", String(state.spacing));
  }

  function applyLang(story) {
    var language = story && story.language;
    if (language) {
      document.body.setAttribute("lang", language);
    } else {
      document.body.removeAttribute("lang");
    }
  }

  function onOpen(story) {
    var refs = getDialogEls();
    if (!refs) return;

    stopSpeech();
    state.currentStory = story || null;
    applyLang(story);

    buildToolbar(refs);
    setStatus("");
    ensureProgressBar(refs.dialog);
    attachScrollListener(refs.dialog);
    restorePrefs(refs);
    updateProgress(refs.dialog);

    appendEndOrnament(refs.body);
    animateParagraphsIn(refs.body);
  }

  function onClose() {
    stopSpeech();
    pauseMusic();
    document.body.removeAttribute("lang");
    state.currentStory = null;
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopSpeech();
      pauseMusic();
    }
  });
  window.addEventListener("pagehide", function () {
    stopSpeech();
    pauseMusic();
  });

  window.StoryReader = { onOpen: onOpen, onClose: onClose };
})();
