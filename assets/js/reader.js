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
    paused: false,
    runId: 0,
    chunks: [],
    pos: 0,
    mode: "speech",
    voiceAudio: null,
    nextAudio: null,
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

  var AUDIO_BASE = "/audio/";
  var SPEECH_RATE = 0.9;

  function setSpeechLabel(btn, icon, text) {
    btn.textContent = "";
    var i = document.createElement("span");
    i.className = "reader-speech-icon";
    i.setAttribute("aria-hidden", "true");
    i.textContent = icon;
    btn.appendChild(i);
    btn.appendChild(document.createTextNode(" " + text));
  }

  function renderSpeechUi() {
    if (!els.speechBtn) return;
    var active = state.speaking;
    if (!active) setSpeechLabel(els.speechBtn, "▶", "Läs högt");
    else if (state.paused) setSpeechLabel(els.speechBtn, "▶", "Fortsätt");
    else setSpeechLabel(els.speechBtn, "⏸", "Pausa");
    els.speechBtn.setAttribute("aria-pressed", String(active && !state.paused));
    if (els.speechStopBtn) els.speechStopBtn.hidden = !active;
  }

  function resetSpeechButton() {
    state.paused = false;
    renderSpeechUi();
  }

  function updateVoiceNote() {
    if (!els.voiceNote) return;
    var lang = resolveLang(state.currentStory);
    var voices = window.speechSynthesis ? window.speechSynthesis.getVoices() || [] : [];
    // Om listan är tom har webbläsaren kanske inte laddat rösterna ännu: säg inget då.
    var missing = voices.length > 0 && !pickVoice(lang);
    els.voiceNote.hidden = !missing;
    if (missing) {
      els.voiceNote.textContent = /^sv/.test(lang)
        ? "Den här enheten har ingen svensk röst, så uppläsningen kan låta lite annorlunda."
        : "Den här enheten saknar en röst för berättelsens språk, så uppläsningen kan låta lite annorlunda.";
    }
  }

  // Chrome klipper långa yttranden (~15 s): dela i meningar och längre meningar vid komma/mellanslag.
  var MAX_CHUNK = 160;
  function splitText(text) {
    text = String(text || "").replace(/\s+/g, " ").trim();
    if (!text) return [];
    var sentences = text.match(/[^.!?…]+(?:[.!?…]+["”’»)]*|$)/g) || [text];
    var out = [];
    sentences.forEach(function (sen) {
      sen = sen.trim();
      while (sen.length > MAX_CHUNK) {
        var cut = sen.lastIndexOf(", ", MAX_CHUNK);
        if (cut < MAX_CHUNK / 3) cut = sen.lastIndexOf(" ", MAX_CHUNK);
        if (cut < 1) cut = MAX_CHUNK;
        out.push(sen.slice(0, cut + 1).trim());
        sen = sen.slice(cut + 1).trim();
      }
      if (sen) out.push(sen);
    });
    return out;
  }

  function buildChunks(refs) {
    var chunks = [];
    var titleEl = document.getElementById("storyModalTitle");
    splitText(titleEl && titleEl.textContent).forEach(function (t) {
      chunks.push({ p: null, text: t });
    });
    var paragraphs = Array.prototype.slice.call(refs.body.querySelectorAll("p"))
      .filter(function (p) { return !p.closest(".reader-end") && p.textContent.trim(); });
    state.paragraphs = paragraphs;
    paragraphs.forEach(function (p) {
      splitText(p.textContent).forEach(function (t) {
        chunks.push({ p: p, text: t });
      });
    });
    return chunks;
  }

  // Samma hash som scripts/generate-audio.js skriver i manifest.json (FNV-1a 32 bit över bitarna).
  function hashChunks(texts) {
    var str = texts.join("\n");
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ("0000000" + h.toString(16)).slice(-8);
  }

  function chunkInfo() {
    var refs = getDialogEls();
    if (!refs) return null;
    var texts = buildChunks(refs).map(function (c) { return c.text; });
    var st = state.currentStory || {};
    return { id: st.id || null, slug: st.slug || null, title: st.title || "", chunks: texts, hash: hashChunks(texts) };
  }

  function audioDir(story) {
    var id = story && story.id;
    if (!id || !/^[A-Za-z0-9_-]+$/.test(String(id))) return null;
    return AUDIO_BASE + id + "/";
  }

  function stopVoiceAudio() {
    [state.voiceAudio, state.nextAudio].forEach(function (a) {
      if (!a) return;
      a.onended = a.onerror = null;
      try { a.pause(); a.removeAttribute("src"); a.load && a.load(); } catch (e) {}
    });
    state.voiceAudio = state.nextAudio = null;
  }

  function highlightChunk(chunk) {
    var cur = state.paragraphs.filter(function (p) { return p.classList.contains("reader-reading"); })[0] || null;
    if (chunk.p === cur) return;
    clearHighlight();
    if (chunk.p) {
      chunk.p.classList.add("reader-reading");
      chunk.p.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
    }
  }

  // Inspelad röst: spela bit för bit med HTMLAudioElement. Bara nästa bit laddas i förväg.
  function playAudioFrom() {
    var runId = ++state.runId;
    var dir = state.audioDir;
    function fallback() {
      if (runId !== state.runId) return;
      stopVoiceAudio();
      state.mode = "speech";
      if (window.speechSynthesis) speakFrom();
      else stopSpeech();
    }
    function play() {
      if (runId !== state.runId || !state.speaking || state.paused) return;
      if (state.pos >= state.chunks.length) {
        stopVoiceAudio();
        state.speaking = false;
        clearHighlight();
        resetSpeechButton();
        setStatus("Slut på berättelsen");
        return;
      }
      highlightChunk(state.chunks[state.pos]);
      var a = state.nextAudio && state.nextAudio.dataset.pos === String(state.pos) ? state.nextAudio : null;
      if (!a) { a = new Audio(dir + state.pos + ".mp3"); }
      state.nextAudio = null;
      state.voiceAudio = a;
      a.onended = function () {
        if (runId !== state.runId) return;
        state.pos++;
        play();
      };
      a.onerror = fallback;
      var pr = a.play();
      if (pr && typeof pr.catch === "function") pr.catch(function (e) {
        if (e && e.name === "AbortError") return;
        fallback();
      });
      if (state.pos + 1 < state.chunks.length) {
        var n = new Audio();
        n.preload = "auto";
        n.dataset.pos = String(state.pos + 1);
        n.src = dir + (state.pos + 1) + ".mp3";
        state.nextAudio = n;
      }
    }
    play();
  }

  function stopSpeech() {
    var wasActive = state.speaking;
    state.speaking = false;
    state.paused = false;
    state.runId++;
    state.chunks = [];
    state.pos = 0;
    state.mode = "speech";
    stopVoiceAudio();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (wasActive) setStatus("Uppläsning stoppad");
    clearHighlight();
    resetSpeechButton();
  }

  // Läser från state.pos. Paus = cancel + spara position; Fortsätt = starta om från samma bit.
  // Det fungerar även där speechSynthesis.pause/resume är trasigt (t.ex. Chrome Android).
  function speakFrom() {
    var ss = window.speechSynthesis;
    if (!ss) return;
    var runId = ++state.runId;
    ss.cancel();
    var lang = resolveLang(state.currentStory);
    var voice = pickVoice(lang);
    var lastP = null;

    function next() {
      if (runId !== state.runId || !state.speaking || state.paused) return;
      if (state.pos >= state.chunks.length) {
        state.speaking = false;
        clearHighlight();
        resetSpeechButton();
        setStatus("Slut på berättelsen");
        return;
      }
      var chunk = state.chunks[state.pos];
      if (chunk.p !== lastP) {
        clearHighlight();
        if (chunk.p) {
          chunk.p.classList.add("reader-reading");
          chunk.p.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
        }
        lastP = chunk.p;
      }
      var utter = new SpeechSynthesisUtterance(chunk.text);
      utter.lang = voice && voice.lang ? voice.lang : lang;
      if (voice) utter.voice = voice;
      utter.rate = SPEECH_RATE;
      utter.pitch = 1;
      var done = function () {
        if (runId !== state.runId) return;
        state.pos++;
        next();
      };
      utter.onend = done;
      utter.onerror = function (e) {
        // "interrupted"/"canceled" kommer från vår egen cancel: gå inte vidare.
        if (e && (e.error === "interrupted" || e.error === "canceled")) return;
        done();
      };
      ss.speak(utter);
    }
    next();
  }

  function startSpeech(refs) {
    state.chunks = buildChunks(refs);
    state.pos = 0;
    state.speaking = true;
    state.paused = false;
    state.mode = "speech";
    renderSpeechUi();
    setStatus("Läser högt");
    var dir = audioDir(state.currentStory);
    var runId = ++state.runId;
    var useSpeech = function () {
      if (runId !== state.runId || !state.speaking) return;
      state.mode = "speech";
      if (window.speechSynthesis) speakFrom();
      else stopSpeech();
    };
    if (!dir || typeof window.Audio !== "function" || typeof window.fetch !== "function") return useSpeech();
    var hash = hashChunks(state.chunks.map(function (c) { return c.text; }));
    window.fetch(dir + "manifest.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("no manifest"); return r.json(); })
      .then(function (m) {
        if (runId !== state.runId || !state.speaking) return;
        if (!m || m.hash !== hash || m.count !== state.chunks.length) return useSpeech();
        state.mode = "audio";
        state.audioDir = dir;
        if (!state.paused) playAudioFrom();
      })
      .catch(useSpeech);
  }

  function toggleSpeech(refs) {
    var ss = window.speechSynthesis;
    if (!state.speaking) {
      startSpeech(refs);
    } else if (!state.paused) {
      state.paused = true;
      if (state.mode === "audio") {
        if (state.voiceAudio) state.voiceAudio.pause();
      } else {
        state.runId++;
        if (ss) ss.cancel();
      }
      renderSpeechUi();
      setStatus("Pausad");
    } else {
      state.paused = false;
      renderSpeechUi();
      setStatus("Läser högt");
      if (state.mode === "audio") {
        var a = state.voiceAudio;
        var pr = a && a.play();
        if (!a) playAudioFrom();
        else if (pr && typeof pr.catch === "function") pr.catch(function () { state.mode = "speech"; stopVoiceAudio(); speakFrom(); });
      } else {
        speakFrom();
      }
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
    var btnSmaller = makeButton("A−", "A− mindre text");
    var btnNormal = makeButton("A", "A normal text");
    var btnLarger = makeButton("A+", "A+ större text");
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

    if (window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function") {
      var speechGroup = document.createElement("div");
      speechGroup.className = "reader-speech";
      var speechBtn = makeButton("Läs högt", null, true);
      speechBtn.classList.add("reader-btn-speech");
      speechBtn.addEventListener("click", function () {
        toggleSpeech(refs);
      });
      var stopBtn = makeButton("", null, false);
      stopBtn.classList.add("reader-btn-stop");
      setSpeechLabel(stopBtn, "■", "Stoppa");
      stopBtn.hidden = true;
      stopBtn.addEventListener("click", function () {
        stopSpeech();
        speechBtn.focus();
      });
      speechGroup.appendChild(speechBtn);
      speechGroup.appendChild(stopBtn);
      var note = document.createElement("p");
      note.className = "reader-voice-note";
      note.hidden = true;
      speechGroup.appendChild(note);
      refs.dialog.insertBefore(speechGroup, refs.body);
      els.speechBtn = speechBtn;
      els.speechStopBtn = stopBtn;
      els.voiceNote = note;
      renderSpeechUi();
      if (window.speechSynthesis && typeof window.speechSynthesis.addEventListener === "function") {
        window.speechSynthesis.addEventListener("voiceschanged", updateVoiceNote);
      }
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

    var speechEl = refs.dialog.querySelector(".reader-speech");
    refs.dialog.insertBefore(toolbar, speechEl || refs.body);
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
    updateVoiceNote();
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
  window.addEventListener("hashchange", function () {
    if (state.speaking && !/^#story-/.test(window.location.hash)) stopSpeech();
  });
  window.addEventListener("pagehide", function () {
    stopSpeech();
    pauseMusic();
  });

  window.StoryReader = { onOpen: onOpen, onClose: onClose, chunkInfo: chunkInfo, splitText: splitText, hashChunks: hashChunks };
})();
