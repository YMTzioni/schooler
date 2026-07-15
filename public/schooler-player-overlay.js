"use strict";
(() => {
  // src/schooler-embed/styles.css
  var styles_default = '.scp-shell {\n  position: absolute;\n  inset: 0;\n  z-index: 50;\n  background: #000;\n  overflow: hidden;\n  isolation: isolate;\n  border-radius: inherit;\n  direction: ltr;\n  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\n  color: #e8f7fb;\n  --scp-main: #00b4d8;\n  --scp-deep: #03045e;\n  --scp-light: #caf0f8;\n  --scp-muted: rgba(202, 240, 248, 0.55);\n}\n\n.scp-shell * {\n  box-sizing: border-box;\n}\n\n.scp-surface {\n  position: absolute;\n  inset: 0;\n  background: #000;\n}\n\n.scp-surface iframe {\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  border: 0;\n  pointer-events: none;\n}\n\n.scp-click-layer {\n  position: absolute;\n  inset: 0;\n  z-index: 4;\n  cursor: pointer;\n}\n\n.scp-shell.scp-booting .scp-click-layer {\n  pointer-events: none;\n  cursor: default;\n}\n\n.scp-shell.scp-ui-visible .scp-click-layer {\n  bottom: 52px;\n}\n\n.scp-wait {\n  position: absolute;\n  inset: 0;\n  z-index: 30;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 14px;\n  padding: 24px;\n  background: rgba(3, 4, 94, 0.88);\n  backdrop-filter: blur(10px);\n  -webkit-backdrop-filter: blur(10px);\n  text-align: center;\n  transition: opacity 0.35s ease, visibility 0.35s;\n}\n\n.scp-wait.scp-wait--done {\n  opacity: 0;\n  visibility: hidden;\n  pointer-events: none;\n}\n\n.scp-wait-spinner {\n  width: 42px;\n  height: 42px;\n  border: 3px solid rgba(202, 240, 248, 0.25);\n  border-top-color: #00b4d8;\n  border-radius: 50%;\n  animation: scp-spin 0.85s linear infinite;\n}\n\n.scp-wait-text {\n  font-size: 16px;\n  font-weight: 600;\n  color: #caf0f8;\n}\n\n.scp-wait-hint {\n  font-size: 13px;\n  color: rgba(202, 240, 248, 0.7);\n  max-width: 280px;\n  line-height: 1.4;\n}\n\n.scp-shell.scp-booting .scp-play-large,\n.scp-shell.scp-booting .scp-controls {\n  opacity: 0 !important;\n  visibility: hidden !important;\n  pointer-events: none !important;\n}\n\n.scp-shell .scp-btn:disabled,\n.scp-shell .scp-play-large:disabled {\n  opacity: 0.45 !important;\n  cursor: not-allowed !important;\n}\n\n@keyframes scp-spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n\n.scp-shields {\n  position: absolute;\n  inset: 0;\n  z-index: 3;\n  pointer-events: none;\n}\n\n.scp-shield {\n  position: absolute;\n  pointer-events: auto;\n  background: transparent;\n}\n\n.scp-shield--top {\n  top: 0;\n  left: 0;\n  right: 0;\n  height: 64px;\n}\n\n.scp-shield--top-right {\n  top: 0;\n  right: 0;\n  width: 100px;\n  height: 48px;\n}\n\n.scp-shield--br-watch {\n  bottom: 52px;\n  right: 0;\n  width: 130px;\n  height: 36px;\n}\n\n.scp-shield--br-logo,\n.scp-shield--bl-logo {\n  bottom: 0;\n  height: 48px;\n}\n\n.scp-shield--br-logo {\n  right: 0;\n  width: 92px;\n}\n\n.scp-shield--bl-logo {\n  left: 0;\n  width: 120px;\n}\n\n.scp-shield--logo-cover {\n  opacity: 0;\n  background: rgba(0, 0, 0, 0.72);\n  transition: opacity 0.3s ease;\n  pointer-events: none;\n}\n\n.scp-shell.scp-paused .scp-shield--logo-cover {\n  opacity: 1;\n  pointer-events: auto;\n}\n\n.scp-shields::after {\n  content: "";\n  position: absolute;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  height: 48px;\n  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.55));\n  opacity: 0;\n  transition: opacity 0.3s ease;\n  pointer-events: none;\n}\n\n.scp-shell.scp-paused .scp-shields::after {\n  opacity: 1;\n}\n\n.scp-play-large {\n  position: absolute;\n  left: 50%;\n  top: 50%;\n  z-index: 6;\n  width: 68px !important;\n  height: 68px !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  border: 0 !important;\n  border-radius: 50% !important;\n  background: #00b4d8 !important;\n  color: #03045e !important;\n  box-shadow: 0 8px 28px rgba(0, 180, 216, 0.35) !important;\n  transform: translate(-50%, -50%);\n  cursor: pointer;\n  display: none;\n  align-items: center;\n  justify-content: center;\n}\n\n.scp-shell.scp-paused .scp-play-large {\n  display: flex !important;\n}\n\n.scp-play-large:hover {\n  filter: brightness(1.08);\n}\n\n.scp-play-large svg {\n  width: 26px;\n  height: 26px;\n  margin-inline-start: 3px;\n  fill: currentColor;\n}\n\n.scp-controls {\n  position: absolute;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  z-index: 8;\n  display: grid;\n  grid-template-columns: auto 1fr auto auto auto auto;\n  align-items: center;\n  column-gap: 6px;\n  padding: 22px 14px 10px;\n  background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.55) 45%, rgba(3, 4, 94, 0.92) 100%);\n  opacity: 0;\n  visibility: hidden;\n  pointer-events: none;\n  transition: opacity 0.28s ease, visibility 0.28s;\n}\n\n.scp-shell.scp-ui-visible .scp-controls,\n.scp-shell.scp-paused .scp-controls,\n.scp-shell.scp-menu-open .scp-controls {\n  opacity: 1;\n  visibility: visible;\n  pointer-events: auto;\n}\n\n.scp-shell .scp-btn {\n  width: 34px !important;\n  height: 34px !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  border: 0 !important;\n  border-radius: 8px !important;\n  background: transparent !important;\n  color: #caf0f8 !important;\n  box-shadow: none !important;\n  cursor: pointer;\n  display: inline-flex !important;\n  align-items: center;\n  justify-content: center;\n  opacity: 0.92;\n}\n\n.scp-shell .scp-btn:hover {\n  color: #fff !important;\n  background: rgba(0, 180, 216, 0.14) !important;\n  opacity: 1;\n}\n\n.scp-shell .scp-btn svg {\n  width: 18px;\n  height: 18px;\n  fill: currentColor;\n}\n\n.scp-progress {\n  position: relative;\n  height: 34px;\n  display: flex;\n  align-items: center;\n  min-width: 64px;\n}\n\n.scp-progress-track {\n  position: absolute;\n  left: 0;\n  right: 0;\n  height: 3px;\n  border-radius: 99px;\n  background: rgba(255, 255, 255, 0.22);\n  overflow: hidden;\n  pointer-events: none;\n}\n\n.scp-progress-fill {\n  height: 100%;\n  width: 0%;\n  background: var(--scp-main);\n  border-radius: 99px;\n}\n\n.scp-progress input[type="range"] {\n  position: relative;\n  z-index: 1;\n  width: 100%;\n  height: 34px;\n  margin: 0;\n  appearance: none;\n  background: transparent;\n  cursor: pointer;\n}\n\n.scp-progress input[type="range"]::-webkit-slider-runnable-track {\n  height: 3px;\n  background: transparent;\n}\n\n.scp-progress input[type="range"]::-webkit-slider-thumb {\n  appearance: none;\n  width: 11px;\n  height: 11px;\n  margin-top: -4px;\n  border-radius: 50%;\n  background: #fff;\n  border: 0;\n  box-shadow: 0 0 0 3px rgba(0, 180, 216, 0.28);\n}\n\n.scp-progress input[type="range"]::-moz-range-track {\n  height: 3px;\n  background: transparent;\n  border: 0;\n}\n\n.scp-progress input[type="range"]::-moz-range-thumb {\n  width: 11px;\n  height: 11px;\n  border-radius: 50%;\n  background: #fff;\n  border: 0;\n}\n\n.scp-time {\n  font-size: 12px;\n  font-weight: 500;\n  font-variant-numeric: tabular-nums;\n  color: var(--scp-light);\n  opacity: 0.9;\n  min-width: 38px;\n  text-align: center;\n  padding: 0 2px;\n}\n\n.scp-volume {\n  display: flex;\n  align-items: center;\n  gap: 0;\n  width: 96px;\n}\n\n.scp-volume input[type="range"] {\n  width: 52px;\n  height: 28px;\n  margin: 0;\n  appearance: none;\n  background: transparent;\n  cursor: pointer;\n}\n\n.scp-volume input[type="range"]::-webkit-slider-runnable-track {\n  height: 3px;\n  border-radius: 99px;\n  background: rgba(255, 255, 255, 0.22);\n}\n\n.scp-volume input[type="range"]::-webkit-slider-thumb {\n  appearance: none;\n  width: 10px;\n  height: 10px;\n  margin-top: -3.5px;\n  border-radius: 50%;\n  background: #fff;\n  border: 0;\n}\n\n.scp-volume input[type="range"]::-moz-range-track {\n  height: 3px;\n  border-radius: 99px;\n  background: rgba(255, 255, 255, 0.22);\n  border: 0;\n}\n\n.scp-volume input[type="range"]::-moz-range-thumb {\n  width: 10px;\n  height: 10px;\n  border-radius: 50%;\n  background: #fff;\n  border: 0;\n}\n\n.scp-menu-wrap {\n  position: relative;\n}\n\n.scp-menu {\n  position: absolute;\n  right: 0;\n  bottom: calc(100% + 8px);\n  width: 220px;\n  max-height: min(280px, 50vh);\n  overflow: auto;\n  border: 1px solid rgba(0, 180, 216, 0.22);\n  border-radius: 12px;\n  background: rgba(8, 16, 48, 0.96);\n  backdrop-filter: blur(16px);\n  -webkit-backdrop-filter: blur(16px);\n  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);\n  display: none;\n  z-index: 20;\n}\n\n.scp-shell.scp-menu-open .scp-menu {\n  display: block;\n}\n\n.scp-menu-header {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 10px 12px 8px;\n  border-bottom: 1px solid rgba(255, 255, 255, 0.08);\n  font-size: 12px;\n  font-weight: 600;\n  letter-spacing: 0.02em;\n  color: var(--scp-light);\n}\n\n.scp-menu-back {\n  width: 26px;\n  height: 26px;\n  border: 0;\n  border-radius: 6px;\n  background: transparent;\n  color: var(--scp-light);\n  cursor: pointer;\n  display: none;\n  align-items: center;\n  justify-content: center;\n  padding: 0;\n}\n\n.scp-menu-back.is-visible {\n  display: inline-flex;\n}\n\n.scp-menu-back:hover {\n  background: rgba(0, 180, 216, 0.14);\n}\n\n.scp-menu-list {\n  display: flex;\n  flex-direction: column;\n  padding: 6px 0;\n}\n\n.scp-menu-item {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  width: 100%;\n  margin: 0;\n  padding: 9px 14px;\n  border: 0;\n  background: transparent;\n  color: #eaf8fb;\n  font-size: 13px;\n  line-height: 1.3;\n  text-align: right;\n  cursor: pointer;\n  direction: rtl;\n}\n\n.scp-menu-item:hover {\n  background: rgba(0, 180, 216, 0.14);\n}\n\n.scp-menu-item[aria-checked="true"] {\n  background: rgba(0, 180, 216, 0.2);\n}\n\n.scp-menu-item .scp-menu-value {\n  opacity: 0.7;\n  font-size: 12px;\n  direction: ltr;\n  color: var(--scp-light);\n}\n\n.scp-menu-item .scp-dot {\n  width: 7px;\n  height: 7px;\n  border-radius: 50%;\n  background: transparent;\n  border: 1.5px solid rgba(202, 240, 248, 0.4);\n  flex: 0 0 auto;\n}\n\n.scp-menu-item[aria-checked="true"] .scp-dot {\n  background: var(--scp-main);\n  border-color: var(--scp-main);\n}\n\n.scp-shell.scp-ui-hidden {\n  cursor: none;\n}\n\n.scp-shell.scp-ui-hidden .scp-controls {\n  opacity: 0;\n  visibility: hidden;\n  pointer-events: none;\n}\n\n.scp-shell:fullscreen,\n.scp-shell:-webkit-full-screen {\n  width: 100%;\n  height: 100%;\n  border-radius: 0;\n}\n\n.video-responsive[data-scp-player],\n.lesson--content_object[data-scp-player],\ndiv[lessonid][data-scp-player] {\n  position: relative !important;\n}\n\n@media (max-width: 720px) {\n  .scp-volume input[type="range"] {\n    display: none;\n  }\n\n  .scp-volume {\n    width: auto;\n  }\n\n  .scp-controls {\n    grid-template-columns: auto 1fr auto auto auto;\n    padding: 18px 10px 8px;\n  }\n}\n';

  // src/schooler-embed/youtubeNativeCaptions.ts
  var normalizeYoutubeLang = (lang) => {
    if (!lang || lang === "none" || lang === "auto") return "";
    if (lang === "he") return "iw";
    return lang;
  };
  var youtubeLangsMatch = (a, b) => {
    const left = normalizeYoutubeLang(a);
    const right = normalizeYoutubeLang(b);
    if (!left || !right) return false;
    if ((left === "iw" || left === "he") && (right === "iw" || right === "he")) return true;
    return left === right;
  };
  var getEmbed = (player) => (player == null ? void 0 : player.embed) || null;
  var hasYouTubePlaybackStarted = (embed) => {
    var _a;
    try {
      const state = (_a = embed == null ? void 0 : embed.getPlayerState) == null ? void 0 : _a.call(embed);
      return state !== void 0 && state !== -1;
    } catch (e) {
      return false;
    }
  };
  var isEmbedApiReady = (embed) => {
    if (!(embed == null ? void 0 : embed.setOption) || !embed.getPlayerState) return false;
    try {
      const state = embed.getPlayerState();
      return state !== void 0 && state !== -1;
    } catch (e) {
      return false;
    }
  };
  var isTranslateableTrack = (track) => Boolean(
    track && (track.is_translateable === true || track.is_translatable === 1 || track.is_translatable === true)
  );
  var isServedSourceTrack = (track) => Boolean(track) && (track.is_servable !== false || track.kind === "asr");
  var getAvailableModules = (embed) => {
    var _a;
    try {
      const options = (_a = embed.getOptions) == null ? void 0 : _a.call(embed);
      if (!Array.isArray(options)) return [];
      return options.filter((name) => name === "captions" || name === "cc");
    } catch (e) {
      return [];
    }
  };
  var readTracklist = (embed, moduleName) => {
    var _a;
    try {
      const list = (_a = embed.getOption) == null ? void 0 : _a.call(embed, moduleName, "tracklist");
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  };
  var readTranslationLanguages = (embed) => {
    var _a;
    try {
      const languages = (_a = embed.getOption) == null ? void 0 : _a.call(embed, "captions", "translationLanguages");
      return Array.isArray(languages) ? languages : [];
    } catch (e) {
      return [];
    }
  };
  var readBestTracklist = (embed, modules) => {
    const order = modules.length ? modules : ["captions", "cc"];
    let best = { moduleName: order[0], tracklist: [] };
    for (const moduleName of order) {
      const tracklist = readTracklist(embed, moduleName);
      if (tracklist.length > best.tracklist.length) {
        best = { moduleName, tracklist };
      }
    }
    return best;
  };
  var waitForCaptionModules = (embed, timeoutMs = 12e3) => new Promise((resolve) => {
    var _a;
    const pick = () => getAvailableModules(embed);
    const existing = pick();
    if (existing.length) {
      resolve(existing);
      return;
    }
    const onApiChange = () => {
      var _a2;
      const modules = pick();
      if (modules.length) {
        (_a2 = embed.removeEventListener) == null ? void 0 : _a2.call(embed, "onApiChange", onApiChange);
        window.clearTimeout(timer);
        resolve(modules);
      }
    };
    (_a = embed.addEventListener) == null ? void 0 : _a.call(embed, "onApiChange", onApiChange);
    const timer = window.setTimeout(() => {
      var _a2;
      (_a2 = embed.removeEventListener) == null ? void 0 : _a2.call(embed, "onApiChange", onApiChange);
      resolve(pick());
    }, timeoutMs);
  });
  var waitForCaptionsCatalog = async (embed, timeoutMs = 6e3) => {
    var _a, _b;
    const modules = await waitForCaptionModules(embed, Math.min(timeoutMs, 8e3));
    const started = Date.now();
    let tracks = [];
    let translations = [];
    let sawTracksAt = 0;
    while (Date.now() - started < timeoutMs) {
      try {
        (_a = embed.loadModule) == null ? void 0 : _a.call(embed, "captions");
        (_b = embed.loadModule) == null ? void 0 : _b.call(embed, "cc");
      } catch (e) {
      }
      tracks = readBestTracklist(embed, modules).tracklist;
      translations = readTranslationLanguages(embed);
      if (tracks.length && !sawTracksAt) sawTracksAt = Date.now();
      const langCodes = new Set(
        tracks.map((t) => normalizeYoutubeLang(String(t.languageCode || ""))).filter(Boolean)
      );
      const hasMultipleTracks = langCodes.size > 1;
      const hasTranslations = translations.length > 0;
      if (tracks.length && (hasMultipleTracks || hasTranslations)) {
        return { tracks, translations };
      }
      if (tracks.length && sawTracksAt && Date.now() - sawTracksAt > 1800) {
        return { tracks, translations };
      }
      await new Promise((r) => window.setTimeout(r, 200));
    }
    return {
      tracks: readBestTracklist(embed, modules).tracklist,
      translations: readTranslationLanguages(embed)
    };
  };
  var pickSourceCaptionTrack = (tracks, { sourceLang = "auto" } = {}) => {
    if (!tracks.length) return null;
    if (sourceLang && sourceLang !== "auto") {
      const source = tracks.find(
        (track) => isServedSourceTrack(track) && youtubeLangsMatch(String(track.languageCode), sourceLang)
      );
      if (source) return source;
    }
    const hebrew = tracks.find(
      (track) => isServedSourceTrack(track) && youtubeLangsMatch(String(track.languageCode), "iw")
    );
    if (hebrew) return hebrew;
    const english = tracks.find(
      (track) => isServedSourceTrack(track) && youtubeLangsMatch(String(track.languageCode), "en")
    );
    if (english) return english;
    return tracks.find(isServedSourceTrack) || tracks[0] || null;
  };
  var buildTrackForLanguage = (languageCode, tracklist, translationLanguages) => {
    const normalized = normalizeYoutubeLang(languageCode);
    if (!normalized) return null;
    const matches = tracklist.filter(
      (track) => youtubeLangsMatch(String(track.languageCode || ""), languageCode)
    );
    if (matches.length) {
      const translateable = matches.find(isTranslateableTrack);
      if (translateable) return { ...translateable };
      const virtual = matches.find((track) => track.is_servable === false);
      if (virtual) return { ...virtual };
      const served = matches.find((track) => isServedSourceTrack(track));
      if (served) return { ...served };
      return { ...matches[0] };
    }
    const fromTranslations = translationLanguages.find(
      (track) => youtubeLangsMatch(String(track.languageCode || track.lang || ""), languageCode)
    );
    if (fromTranslations) {
      const code = normalizeYoutubeLang(String(fromTranslations.languageCode || fromTranslations.lang || "")) || normalized;
      return {
        languageCode: code,
        languageName: fromTranslations.languageName || fromTranslations.displayName || code,
        displayName: fromTranslations.displayName || fromTranslations.languageName || code,
        is_translateable: true,
        is_servable: false,
        vss_id: String(fromTranslations.vss_id || fromTranslations.vssId || `.${code}`),
        vssId: String(fromTranslations.vss_id || fromTranslations.vssId || `.${code}`)
      };
    }
    return {
      languageCode: normalized,
      vss_id: `.${normalized}`,
      vssId: `.${normalized}`,
      is_translateable: true,
      is_servable: false
    };
  };
  var pickYouTubeCaptionTrack = (tracks, {
    targetLang = "none",
    sourceLang = "auto",
    translationLanguages = []
  } = {}) => {
    const wantsTranslation = Boolean(targetLang && targetLang !== "none");
    const normalizedTarget = normalizeYoutubeLang(targetLang);
    const sourceTrack = pickSourceCaptionTrack(tracks, { sourceLang });
    if (wantsTranslation && normalizedTarget) {
      const built = buildTrackForLanguage(targetLang, tracks, translationLanguages);
      if (!built) return null;
      if (sourceTrack && youtubeLangsMatch(String(built.languageCode), targetLang) && youtubeLangsMatch(String(built.languageCode), String(sourceTrack.languageCode)) && !isTranslateableTrack(built)) {
        return { track: built, mode: "source-same-language", sourceTrack };
      }
      const translatingFromDifferentSource = sourceTrack && !youtubeLangsMatch(String(sourceTrack.languageCode), targetLang);
      const mode = translatingFromDifferentSource ? isTranslateableTrack(built) || built.is_servable === false ? "translated" : "youtube-translate" : "translated";
      return { track: built, mode, sourceTrack };
    }
    if (sourceTrack) return { track: { ...sourceTrack }, mode: "source", sourceTrack };
    if (normalizedTarget) {
      const built = buildTrackForLanguage(targetLang, tracks, translationLanguages);
      if (built) return { track: built, mode: "fallback", sourceTrack: null };
    }
    return null;
  };
  var applyCaptionSelection = (embed, moduleName, track) => {
    var _a, _b, _c;
    (_a = embed.loadModule) == null ? void 0 : _a.call(embed, moduleName);
    (_b = embed.setOption) == null ? void 0 : _b.call(embed, moduleName, "track", track);
    try {
      (_c = embed.setOption) == null ? void 0 : _c.call(embed, moduleName, "reload", true);
    } catch (e) {
    }
  };
  var applyCaptionSelectionAcrossModules = (embed, modules, track) => {
    const order = [.../* @__PURE__ */ new Set([...modules, "captions", "cc"])];
    for (const moduleName of order) {
      try {
        applyCaptionSelection(embed, moduleName, track);
        return moduleName;
      } catch (e) {
      }
    }
    return null;
  };
  var applyTranslatedSelection = (embed, modules, selection) => {
    if (selection.sourceTrack && (selection.mode === "translated" || selection.mode === "youtube-translate") && !youtubeLangsMatch(String(selection.sourceTrack.languageCode), String(selection.track.languageCode))) {
      try {
        applyCaptionSelectionAcrossModules(embed, modules, { ...selection.sourceTrack });
      } catch (e) {
      }
    }
    const withTranslationMeta = { ...selection.track };
    if (selection.sourceTrack && !withTranslationMeta.translationLanguage) {
      const code = normalizeYoutubeLang(String(selection.track.languageCode || ""));
      if (code) {
        withTranslationMeta.translationLanguage = {
          languageCode: code,
          languageName: selection.track.languageName || selection.track.displayName || code
        };
      }
    }
    return applyCaptionSelectionAcrossModules(embed, modules, withTranslationMeta) || applyCaptionSelectionAcrossModules(embed, modules, selection.track);
  };
  async function disableYouTubeNativeCaptions(player) {
    var _a;
    const embed = getEmbed(player);
    if (!(embed == null ? void 0 : embed.setOption) || !isEmbedApiReady(embed)) return;
    for (const moduleName of ["captions", "cc"]) {
      try {
        (_a = embed.loadModule) == null ? void 0 : _a.call(embed, moduleName);
        embed.setOption(moduleName, "track", {});
      } catch (e) {
      }
    }
  }
  async function enableNativeYouTubeCaptions(player, { targetLang = "none", sourceLang = "auto" } = {}) {
    const wantsTranslation = Boolean(targetLang && targetLang !== "none");
    const embed = getEmbed(player);
    if (!(embed == null ? void 0 : embed.setOption)) {
      return { ok: false, translated: false, track: null, mode: "failed", needsPlayback: true };
    }
    if (!hasYouTubePlaybackStarted(embed)) {
      return {
        ok: false,
        translated: false,
        track: null,
        mode: "needs-playback",
        needsPlayback: true
      };
    }
    const modules = await waitForCaptionModules(embed, 12e3);
    if (!modules.length) {
      return { ok: false, translated: false, track: null, mode: "failed", needsPlayback: false };
    }
    const maxAttempts = 24;
    const delayMs = 250;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const { tracklist } = readBestTracklist(embed, modules);
        const translationLanguages = readTranslationLanguages(embed);
        const selection = pickYouTubeCaptionTrack(tracklist, {
          targetLang,
          sourceLang,
          translationLanguages
        });
        if (!(selection == null ? void 0 : selection.track)) {
          if (wantsTranslation && attempt < maxAttempts - 1) {
            await new Promise((r) => window.setTimeout(r, delayMs));
            continue;
          }
          const languageCode = normalizeYoutubeLang(targetLang !== "none" ? targetLang : sourceLang) || "iw";
          applyCaptionSelectionAcrossModules(embed, modules, {
            languageCode,
            vss_id: `.${languageCode}`
          });
          return {
            ok: true,
            translated: wantsTranslation,
            track: { languageCode },
            mode: "fallback",
            needsPlayback: false
          };
        }
        const appliedModule = applyTranslatedSelection(embed, modules, selection);
        if (!appliedModule && attempt < maxAttempts - 1) {
          await new Promise((r) => window.setTimeout(r, delayMs));
          continue;
        }
        const translated = wantsTranslation && (selection.mode === "translated" || selection.mode === "youtube-translate") && selection.mode !== "source-same-language";
        return {
          ok: Boolean(appliedModule),
          translated,
          track: selection.track,
          mode: selection.mode,
          sameLanguageOnly: selection.mode === "source-same-language",
          needsPlayback: false
        };
      } catch (e) {
      }
      await new Promise((r) => window.setTimeout(r, delayMs));
    }
    return { ok: false, translated: false, track: null, mode: "failed", needsPlayback: false };
  }
  async function prefetchCaptionLanguages(player, languages, onProgress) {
    const embed = getEmbed(player);
    if (!(embed == null ? void 0 : embed.setOption)) return { ok: false, imported: [] };
    if (!hasYouTubePlaybackStarted(embed)) return { ok: false, imported: [] };
    onProgress == null ? void 0 : onProgress("\u05E7\u05D8\u05DC\u05D5\u05D2 YouTube", 0, languages.length);
    await waitForCaptionsCatalog(embed, 6e3);
    const imported = [];
    for (let i = 0; i < languages.length; i += 1) {
      const lang = languages[i];
      if (lang.value === "none") continue;
      onProgress == null ? void 0 : onProgress(lang.label, i + 1, languages.length);
      const result = await enableNativeYouTubeCaptions(player, {
        targetLang: lang.value,
        sourceLang: "auto"
      });
      if (result.ok) imported.push(lang.value);
      await new Promise((r) => window.setTimeout(r, 350));
    }
    return { ok: imported.length > 0, imported };
  }

  // src/schooler-embed/player.ts
  var CFG = {
    captionLang: "he",
    coverHideMs: 5e3,
    ...typeof window !== "undefined" && window.SchoolerPlayerConfig || {}
  };
  var MARK = "data-scp-player";
  var CAPTION_LANGS = [
    { value: "he", label: "\u05E2\u05D1\u05E8\u05D9\u05EA" },
    { value: "en", label: "\u05D0\u05E0\u05D2\u05DC\u05D9\u05EA" },
    { value: "ar", label: "\u05E2\u05E8\u05D1\u05D9\u05EA" },
    { value: "ru", label: "\u05E8\u05D5\u05E1\u05D9\u05EA" },
    { value: "fr", label: "\u05E6\u05E8\u05E4\u05EA\u05D9\u05EA" },
    { value: "none", label: "\u05E9\u05E4\u05EA \u05DE\u05E7\u05D5\u05E8" }
  ];
  var SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  var ICONS = {
    play: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 2.5v13l12-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 2.5h4v13H3zm8 0h4v13h-4z"/></svg>',
    mute: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6.5h3.2L9.5 3v12L5.2 11.5H2zm10.1.4 1.4 1.4-1.4 1.4 1.1 1.1 1.4-1.4 1.4 1.4 1.1-1.1-1.4-1.4 1.4-1.4-1.1-1.1-1.4 1.4-1.4-1.4z"/></svg>',
    volume: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6.5h3.2L9.5 3v12L5.2 11.5H2zm8.3-2.2a5.5 5.5 0 0 1 0 9.4l1.1 1.2a7.1 7.1 0 0 0 0-11.8zm1.8 2.2a3.1 3.1 0 0 1 0 5l1.2 1.1a4.6 4.6 0 0 0 0-7.2z"/></svg>',
    settings: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M7.2 1.6h3.6l.4 2.1 1.7.9 2-1.1 1.8 1.8-1.1 2 .9 1.7 2.1.4v3.6l-2.1.4-.9 1.7 1.1 2-1.8 1.8-2-1.1-1.7.9-.4 2.1H7.2l-.4-2.1-1.7-.9-2 1.1L1.3 14l1.1-2-.9-1.7L-.6 9.9V6.3l2.1-.4.9-1.7L1.3 2.2 3.1.4l2 1.1 1.7-.9zM9 6.4A2.6 2.6 0 1 0 9 11.6 2.6 2.6 0 0 0 9 6.4z"/></svg>',
    fullscreen: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6V2h4v2H4v2zm10-4h4v4h-2V4h-2zM2 12h2v2h2v2H2zm10 2h2v-2h2v4h-4z"/></svg>',
    exitFs: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6 2H4v2H2v2h4zm8 2V2h-2v4h4V4zm-8 8H2v2h2v2h2zm6 0h4v2h-2v2h-2z"/></svg>',
    back: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M11.5 3.5 6 9l5.5 5.5 1.2-1.2L8.4 9l4.3-4.3z"/></svg>'
  };
  function extractVideoId(value) {
    if (!value) return "";
    const s = String(value);
    if (/^[\w-]{11}$/.test(s.trim())) return s.trim();
    const m = s.match(/[?&]v=([\w-]{11})/) || s.match(/youtu\.be\/([\w-]{11})/) || s.match(/\/embed\/([\w-]{11})/) || s.match(/i\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//);
    return m ? m[1] : "";
  }
  function readLesson() {
    const out = { videoId: "", seekStart: 0, lessonId: "", title: "" };
    const nodes = document.querySelectorAll("script.js-react-on-rails-component");
    for (let i = 0; i < nodes.length; i++) {
      const text = nodes[i].textContent || "";
      if (!text.includes('"lesson"')) continue;
      try {
        const data = JSON.parse(text);
        const lesson = data.lesson || {};
        const video = lesson.video || {};
        out.videoId = String(video.videoId || "");
        out.seekStart = parseFloat(String(lesson.seekStart || 0)) || 0;
        out.lessonId = String(lesson.id || "");
        out.title = String(lesson.name || "");
        if (out.videoId) return out;
      } catch (e) {
      }
    }
    const el = document.querySelector("div[lessonid]");
    if (el) {
      out.lessonId = el.getAttribute("lessonid") || "";
      out.seekStart = parseFloat(el.getAttribute("seekstart") || "0") || 0;
    }
    return out;
  }
  function findTarget(lesson) {
    const iframe = document.querySelector('.video-responsive iframe[src*="youtube"]') || document.querySelector('.lesson--content_object iframe[src*="youtube"]') || document.querySelector('div[lessonid] iframe[src*="youtube"]') || document.querySelector('iframe[src*="youtube.com/embed"]') || document.querySelector('iframe[src*="youtube-nocookie.com/embed"]');
    const videoId = iframe && extractVideoId(iframe.getAttribute("src")) || lesson.videoId;
    if (!videoId) return null;
    const host = iframe ? iframe.closest(".video-responsive") || iframe.closest(".lesson--content_object") || iframe.closest("div[lessonid]") || iframe.parentElement : document.querySelector(".video-responsive") || document.querySelector("div[lessonid]");
    if (!host) return null;
    return { host, iframe, videoId, lesson };
  }
  function progressKey(videoId, lessonId) {
    return `scp-watch:${lessonId || videoId}`;
  }
  function loadProgress(videoId, lessonId) {
    try {
      return parseFloat(localStorage.getItem(progressKey(videoId, lessonId)) || "0") || 0;
    } catch (e) {
      return 0;
    }
  }
  function saveProgress(videoId, lessonId, seconds) {
    if (!seconds || seconds < 3) return;
    try {
      localStorage.setItem(progressKey(videoId, lessonId), String(Math.floor(seconds)));
    } catch (e) {
    }
  }
  function clearProgress(videoId, lessonId) {
    try {
      localStorage.removeItem(progressKey(videoId, lessonId));
    } catch (e) {
    }
  }
  function resolveResume(videoId, lessonId, schoolerSeek, duration) {
    const start = Math.max(loadProgress(videoId, lessonId), schoolerSeek || 0);
    if (duration > 0 && start > duration - 12) return 0;
    return start >= 3 ? start : 0;
  }
  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }
  function speedLabel(rate) {
    return rate === 1 ? "\u05E8\u05D2\u05D9\u05DC" : `${rate}\xD7`;
  }
  function captionLabel(value) {
    const found = CAPTION_LANGS.find((lang) => lang.value === value);
    return found ? found.label : value;
  }
  function ensureStyles() {
    if (document.getElementById("scp-player-style")) return;
    const style = document.createElement("style");
    style.id = "scp-player-style";
    style.textContent = styles_default;
    (document.head || document.documentElement).appendChild(style);
  }
  function blockEvent(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  function loadYouTubeApi() {
    var _a;
    if ((_a = window.YT) == null ? void 0 : _a.Player) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try {
          prev == null ? void 0 : prev();
        } catch (e) {
        }
        resolve();
      };
      if (document.querySelector("script[data-scp-yt-api]")) {
        const started = Date.now();
        const tick = () => {
          var _a2;
          if ((_a2 = window.YT) == null ? void 0 : _a2.Player) {
            resolve();
            return;
          }
          if (Date.now() - started > 15e3) {
            reject(new Error("yt-api"));
            return;
          }
          window.setTimeout(tick, 100);
        };
        tick();
        return;
      }
      const el = document.createElement("script");
      el.src = "https://www.youtube.com/iframe_api";
      el.async = true;
      el.setAttribute("data-scp-yt-api", "1");
      el.onerror = () => reject(new Error("yt-api"));
      (document.head || document.documentElement).appendChild(el);
    });
  }
  function createButton(className, label, html) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = html;
    return btn;
  }
  function attachShields(container) {
    if (container.querySelector(".scp-shields")) return;
    const wrap = document.createElement("div");
    wrap.className = "scp-shields";
    wrap.setAttribute("aria-hidden", "true");
    const zones = [
      "scp-shield--top",
      "scp-shield--top-right",
      "scp-shield--br-watch",
      "scp-shield--br-logo scp-shield--logo-cover",
      "scp-shield--bl-logo scp-shield--logo-cover"
    ];
    for (const zoneClass of zones) {
      const zone = document.createElement("div");
      zone.className = `scp-shield ${zoneClass}`;
      for (const type of ["click", "mousedown", "mouseup", "dblclick", "contextmenu"]) {
        zone.addEventListener(type, blockEvent, true);
      }
      wrap.appendChild(zone);
    }
    container.appendChild(wrap);
  }
  function buildShell() {
    const shell = document.createElement("div");
    shell.className = "scp-shell scp-paused scp-ui-visible scp-booting";
    const surface = document.createElement("div");
    surface.className = "scp-surface";
    const mountEl = document.createElement("div");
    mountEl.id = `scp-yt-${Math.random().toString(36).slice(2, 9)}`;
    surface.appendChild(mountEl);
    const clickLayer = document.createElement("div");
    clickLayer.className = "scp-click-layer";
    const playLarge = createButton("scp-play-large", "\u05E0\u05D2\u05DF", ICONS.play);
    playLarge.disabled = true;
    const waitOverlay = document.createElement("div");
    waitOverlay.className = "scp-wait";
    waitOverlay.setAttribute("aria-live", "polite");
    const waitSpinner = document.createElement("div");
    waitSpinner.className = "scp-wait-spinner";
    const waitText = document.createElement("div");
    waitText.className = "scp-wait-text";
    waitText.textContent = "\u05D8\u05D5\u05E2\u05DF \u05DB\u05EA\u05D5\u05D1\u05D9\u05D5\u05EA\u2026";
    const waitHint = document.createElement("div");
    waitHint.className = "scp-wait-hint";
    waitHint.textContent = "\u05DE\u05D9\u05D9\u05D1\u05D0\u05D9\u05DD \u05D0\u05EA \u05DB\u05DC \u05E9\u05E4\u05D5\u05EA \u05D4\u05DB\u05EA\u05D5\u05D1\u05D9\u05D5\u05EA \u05DC\u05E4\u05E0\u05D9 \u05D4\u05E6\u05E4\u05D9\u05D9\u05D4";
    waitOverlay.appendChild(waitSpinner);
    waitOverlay.appendChild(waitText);
    waitOverlay.appendChild(waitHint);
    const controls = document.createElement("div");
    controls.className = "scp-controls";
    const playBtn = createButton("scp-btn scp-play", "\u05E0\u05D2\u05DF", ICONS.play);
    playBtn.disabled = true;
    const progress = document.createElement("div");
    progress.className = "scp-progress";
    const track = document.createElement("div");
    track.className = "scp-progress-track";
    const fill = document.createElement("div");
    fill.className = "scp-progress-fill";
    track.appendChild(fill);
    const seek = document.createElement("input");
    seek.type = "range";
    seek.min = "0";
    seek.max = "1000";
    seek.value = "0";
    seek.step = "1";
    seek.setAttribute("aria-label", "Seek");
    seek.disabled = true;
    progress.appendChild(track);
    progress.appendChild(seek);
    const timeEl = document.createElement("div");
    timeEl.className = "scp-time";
    timeEl.textContent = "0:00";
    const volumeWrap = document.createElement("div");
    volumeWrap.className = "scp-volume";
    const muteBtn = createButton("scp-btn", "\u05D4\u05E9\u05EA\u05E7", ICONS.volume);
    muteBtn.disabled = true;
    const volume = document.createElement("input");
    volume.type = "range";
    volume.min = "0";
    volume.max = "100";
    volume.value = "100";
    volume.setAttribute("aria-label", "Volume");
    volume.disabled = true;
    volumeWrap.appendChild(muteBtn);
    volumeWrap.appendChild(volume);
    const menuWrap = document.createElement("div");
    menuWrap.className = "scp-menu-wrap";
    const settingsBtn = createButton("scp-btn", "\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA", ICONS.settings);
    settingsBtn.disabled = true;
    const menu = document.createElement("div");
    menu.className = "scp-menu";
    menu.setAttribute("role", "menu");
    const menuHeader = document.createElement("div");
    menuHeader.className = "scp-menu-header";
    const menuBack = createButton("scp-menu-back", "\u05D7\u05D6\u05E8\u05D4", ICONS.back);
    const menuTitle = document.createElement("span");
    menuTitle.textContent = "\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA";
    menuHeader.appendChild(menuBack);
    menuHeader.appendChild(menuTitle);
    const menuList = document.createElement("div");
    menuList.className = "scp-menu-list";
    menu.appendChild(menuHeader);
    menu.appendChild(menuList);
    menuWrap.appendChild(settingsBtn);
    menuWrap.appendChild(menu);
    const fsBtn = createButton("scp-btn", "\u05DE\u05E1\u05DA \u05DE\u05DC\u05D0", ICONS.fullscreen);
    fsBtn.disabled = true;
    controls.appendChild(playBtn);
    controls.appendChild(progress);
    controls.appendChild(timeEl);
    controls.appendChild(volumeWrap);
    controls.appendChild(menuWrap);
    controls.appendChild(fsBtn);
    shell.appendChild(surface);
    shell.appendChild(clickLayer);
    shell.appendChild(playLarge);
    shell.appendChild(controls);
    shell.appendChild(waitOverlay);
    attachShields(shell);
    return {
      shell,
      surface,
      mountEl,
      clickLayer,
      playLarge,
      controls,
      playBtn,
      seek,
      fill,
      timeEl,
      muteBtn,
      volume,
      settingsBtn,
      fsBtn,
      menu,
      menuBack,
      menuTitle,
      menuList,
      waitOverlay,
      waitText
    };
  }
  function mount(target) {
    if (!(target == null ? void 0 : target.host) || !target.videoId) return;
    if (target.host.getAttribute(MARK) === target.videoId && target.host.querySelector(".scp-shell")) {
      return;
    }
    ensureStyles();
    target.host.setAttribute(MARK, target.videoId);
    target.host.setAttribute("oncontextmenu", "return false");
    if (getComputedStyle(target.host).position === "static") target.host.style.position = "relative";
    target.host.querySelectorAll(".scp-shell").forEach((node) => node.remove());
    if (target.iframe) {
      try {
        target.iframe.src = "about:blank";
        target.iframe.remove();
      } catch (e) {
        try {
          target.iframe.style.display = "none";
        } catch (e2) {
        }
      }
    }
    const ui = buildShell();
    target.host.appendChild(ui.shell);
    const lessonId = target.lesson.lessonId || "";
    const schoolerSeek = target.lesson.seekStart || 0;
    const hideMs = Number(CFG.coverHideMs) || 5e3;
    let yt = null;
    let handle = null;
    let duration = 0;
    let seeking = false;
    let uiHideTimer = null;
    let menuPanel = "root";
    let currentSpeed = 1;
    let isPlaying = false;
    let captionsBooted = false;
    let switchingCaptions = false;
    let playerReady = false;
    let playbackUnlocked = false;
    let captionWarmupStarted = false;
    let captionWarmupDone = false;
    let progressTimer = null;
    const captionState = {
      enabled: true,
      lang: CFG.captionLang || "he",
      loadingLang: "",
      nativeMode: false,
      pendingLang: "",
      selectLang() {
      },
      async loadForLang() {
      }
    };
    const setControlsEnabled = (enabled) => {
      ui.playBtn.disabled = !enabled;
      ui.playLarge.disabled = !enabled;
      ui.seek.disabled = !enabled;
      ui.muteBtn.disabled = !enabled;
      ui.volume.disabled = !enabled;
      ui.settingsBtn.disabled = !enabled;
      ui.fsBtn.disabled = !enabled;
    };
    const unlockPlayback = (message = "\u05DE\u05D5\u05DB\u05DF \u05DC\u05E6\u05E4\u05D9\u05D9\u05D4") => {
      if (playbackUnlocked) return;
      playbackUnlocked = true;
      captionWarmupDone = true;
      ui.shell.classList.remove("scp-booting");
      ui.waitText.textContent = message;
      ui.waitOverlay.classList.add("scp-wait--done");
      window.setTimeout(() => {
        ui.waitOverlay.hidden = true;
      }, 350);
      setControlsEnabled(true);
      setPausedUi(true);
      setUiVisible(true);
    };
    const finishCaptionWarmup = async () => {
      var _a, _b, _c, _d;
      if (captionWarmupDone || !handle || !yt) return;
      captionWarmupDone = true;
      ui.waitText.textContent = "\u05DE\u05D7\u05E4\u05E9 \u05DE\u05E1\u05DC\u05D5\u05DC\u05D9 \u05DB\u05EA\u05D5\u05D1\u05D9\u05D5\u05EA\u2026";
      try {
        await prefetchCaptionLanguages(handle, CAPTION_LANGS, (label, index, total) => {
          ui.waitText.textContent = `\u05DE\u05D9\u05D9\u05D1\u05D0 \u05DB\u05EA\u05D5\u05D1\u05D9\u05D5\u05EA (${index}/${total}): ${label}`;
        });
        ui.waitText.textContent = "\u05DE\u05D7\u05D9\u05DC \u05DB\u05EA\u05D5\u05D1\u05D9\u05D5\u05EA \u05D1\u05E8\u05D9\u05E8\u05EA \u05DE\u05D7\u05D3\u05DC\u2026";
        await captionState.loadForLang(captionState.lang);
      } catch (e) {
        try {
          await captionState.loadForLang(captionState.lang);
        } catch (e2) {
        }
      }
      try {
        (_a = yt.pauseVideo) == null ? void 0 : _a.call(yt);
        if (resumeAt > 0) (_b = yt.seekTo) == null ? void 0 : _b.call(yt, resumeAt, true);
        (_c = yt.unMute) == null ? void 0 : _c.call(yt);
        const vol = Number(ui.volume.value);
        if (vol > 0) (_d = yt.setVolume) == null ? void 0 : _d.call(yt, vol);
      } catch (e) {
      }
      captionsBooted = true;
      ui.muteBtn.innerHTML = ICONS.volume;
      ui.muteBtn.setAttribute("aria-label", "\u05D4\u05E9\u05EA\u05E7");
      unlockPlayback("\u05DE\u05D5\u05DB\u05DF \u05DC\u05E6\u05E4\u05D9\u05D9\u05D4");
    };
    const startCaptionWarmup = () => {
      var _a, _b;
      if (captionWarmupStarted || !playerReady || !yt) return;
      captionWarmupStarted = true;
      ui.waitText.textContent = "\u05DE\u05DB\u05D9\u05DF \u05D0\u05EA \u05D4\u05E0\u05D2\u05DF\u2026";
      try {
        (_a = yt.mute) == null ? void 0 : _a.call(yt);
        (_b = yt.playVideo) == null ? void 0 : _b.call(yt);
      } catch (e) {
        unlockPlayback("\u05DE\u05D5\u05DB\u05DF \u05DC\u05E6\u05E4\u05D9\u05D9\u05D4");
      }
      window.setTimeout(() => {
        if (!playbackUnlocked) void finishCaptionWarmup();
      }, 25e3);
    };
    const setPausedUi = (paused) => {
      ui.shell.classList.toggle("scp-paused", paused);
      ui.playBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
      ui.playBtn.setAttribute("aria-label", paused ? "\u05E0\u05D2\u05DF" : "\u05D4\u05E9\u05D4\u05D4");
    };
    const setUiVisible = (visible) => {
      ui.shell.classList.toggle("scp-ui-visible", visible);
      ui.shell.classList.toggle("scp-ui-hidden", !visible && isPlaying && menuPanel === "root");
    };
    const showUiTemporarily = () => {
      setUiVisible(true);
      if (uiHideTimer) clearTimeout(uiHideTimer);
      uiHideTimer = null;
      if (!isPlaying || ui.shell.classList.contains("scp-menu-open")) return;
      uiHideTimer = setTimeout(() => {
        setUiVisible(false);
        uiHideTimer = null;
      }, hideMs);
    };
    const syncProgress = () => {
      var _a, _b;
      if (!playerReady || !yt || seeking) return;
      try {
        const t = ((_a = yt.getCurrentTime) == null ? void 0 : _a.call(yt)) || 0;
        const d = ((_b = yt.getDuration) == null ? void 0 : _b.call(yt)) || duration || 0;
        duration = d;
        const pct = d > 0 ? t / d * 1e3 : 0;
        ui.seek.value = String(Math.round(pct));
        ui.fill.style.width = `${Math.min(100, pct / 10)}%`;
        ui.timeEl.textContent = formatTime(t);
        if (d > 0 && t > d - 8) clearProgress(target.videoId, lessonId);
        else saveProgress(target.videoId, lessonId, t);
      } catch (e) {
      }
    };
    const safePlay = () => {
      var _a;
      if (!playerReady || !yt) return;
      try {
        (_a = yt.playVideo) == null ? void 0 : _a.call(yt);
      } catch (e) {
      }
    };
    const safePause = () => {
      var _a;
      if (!playerReady || !yt) return;
      try {
        (_a = yt.pauseVideo) == null ? void 0 : _a.call(yt);
      } catch (e) {
      }
    };
    const resumeAt = resolveResume(target.videoId, lessonId, schoolerSeek, 0);
    const togglePlay = () => {
      var _a;
      if (!playerReady || !yt || !playbackUnlocked) return;
      try {
        const state = (_a = yt.getPlayerState) == null ? void 0 : _a.call(yt);
        if (state === 1) safePause();
        else safePlay();
      } catch (e) {
        safePlay();
      }
    };
    const toggleMute = () => {
      var _a, _b, _c;
      if (!playerReady || !yt) return;
      try {
        if ((_a = yt.isMuted) == null ? void 0 : _a.call(yt)) {
          (_b = yt.unMute) == null ? void 0 : _b.call(yt);
          ui.muteBtn.innerHTML = ICONS.volume;
          ui.muteBtn.setAttribute("aria-label", "\u05D4\u05E9\u05EA\u05E7");
        } else {
          (_c = yt.mute) == null ? void 0 : _c.call(yt);
          ui.muteBtn.innerHTML = ICONS.mute;
          ui.muteBtn.setAttribute("aria-label", "\u05D1\u05D8\u05DC \u05D4\u05E9\u05EA\u05E7\u05D4");
        }
      } catch (e) {
      }
    };
    const toggleFullscreen = () => {
      var _a, _b, _c;
      const el = ui.shell;
      const doc = document;
      const active = document.fullscreenElement || doc.webkitFullscreenElement;
      if (active === el) {
        if (document.exitFullscreen) void document.exitFullscreen();
        else (_a = doc.webkitExitFullscreen) == null ? void 0 : _a.call(doc);
        ui.fsBtn.innerHTML = ICONS.fullscreen;
        return;
      }
      const req = ((_b = el.requestFullscreen) == null ? void 0 : _b.bind(el)) || ((_c = el.webkitRequestFullscreen) == null ? void 0 : _c.bind(el));
      void (req == null ? void 0 : req());
      ui.fsBtn.innerHTML = ICONS.exitFs;
    };
    const closeMenu = () => {
      menuPanel = "root";
      ui.shell.classList.remove("scp-menu-open");
      ui.menuBack.classList.remove("is-visible");
      ui.menuTitle.textContent = "\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA";
      renderMenu();
    };
    const openMenu = () => {
      if (!playbackUnlocked) return;
      ui.shell.classList.add("scp-menu-open");
      setUiVisible(true);
      if (uiHideTimer) clearTimeout(uiHideTimer);
      renderMenu();
    };
    const makeMenuItem = (title, opts) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scp-menu-item";
      btn.setAttribute("role", "menuitemradio");
      btn.setAttribute("aria-checked", String(Boolean(opts.checked)));
      const label = document.createElement("span");
      label.textContent = title;
      btn.appendChild(label);
      if (opts.value !== void 0) {
        const val = document.createElement("span");
        val.className = "scp-menu-value";
        val.textContent = opts.value;
        btn.appendChild(val);
      } else {
        const dot = document.createElement("span");
        dot.className = "scp-dot";
        btn.appendChild(dot);
      }
      btn.addEventListener("click", (e) => {
        blockEvent(e);
        opts.onClick();
      });
      return btn;
    };
    const renderMenu = () => {
      var _a, _b;
      ui.menuList.innerHTML = "";
      if (menuPanel === "root") {
        ui.menuBack.classList.remove("is-visible");
        ui.menuTitle.textContent = "\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA";
        ui.menuList.appendChild(
          makeMenuItem("\u05DB\u05EA\u05D5\u05D1\u05D9\u05D5\u05EA", {
            value: captionState.enabled ? captionLabel(captionState.lang) : "\u05DB\u05D1\u05D5\u05D9",
            onClick: () => {
              menuPanel = "captions";
              renderMenu();
            }
          })
        );
        ui.menuList.appendChild(
          makeMenuItem("\u05DE\u05D4\u05D9\u05E8\u05D5\u05EA", {
            value: speedLabel(currentSpeed),
            onClick: () => {
              menuPanel = "speed";
              renderMenu();
            }
          })
        );
        ui.menuList.appendChild(
          makeMenuItem("\u05D0\u05D9\u05DB\u05D5\u05EA", {
            value: "\u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9",
            onClick: () => {
              menuPanel = "quality";
              renderMenu();
            }
          })
        );
        return;
      }
      ui.menuBack.classList.add("is-visible");
      if (menuPanel === "captions") {
        ui.menuTitle.textContent = "\u05DB\u05EA\u05D5\u05D1\u05D9\u05D5\u05EA";
        ui.menuList.appendChild(
          makeMenuItem("\u05DB\u05D1\u05D5\u05D9", {
            checked: !captionState.enabled,
            onClick: () => {
              captionState.enabled = false;
              captionState.pendingLang = "";
              captionState.nativeMode = false;
              captionsBooted = true;
              void disableYouTubeNativeCaptions(handle);
              closeMenu();
            }
          })
        );
        CAPTION_LANGS.forEach((lang) => {
          const loading = captionState.loadingLang === lang.value;
          ui.menuList.appendChild(
            makeMenuItem(loading ? `${lang.label}\u2026` : lang.label, {
              checked: captionState.enabled && captionState.lang === lang.value,
              onClick: () => {
                captionState.selectLang(lang.value);
                closeMenu();
              }
            })
          );
        });
        return;
      }
      if (menuPanel === "speed") {
        ui.menuTitle.textContent = "\u05DE\u05D4\u05D9\u05E8\u05D5\u05EA";
        const rates = ((_b = (_a = yt == null ? void 0 : yt.getAvailablePlaybackRates) == null ? void 0 : _a.call(yt)) == null ? void 0 : _b.filter((r) => typeof r === "number")) || SPEED_OPTIONS;
        const list = rates.length ? rates : SPEED_OPTIONS;
        list.forEach((rate) => {
          ui.menuList.appendChild(
            makeMenuItem(speedLabel(rate), {
              checked: Math.abs(currentSpeed - rate) < 1e-3,
              onClick: () => {
                var _a2;
                currentSpeed = rate;
                (_a2 = yt == null ? void 0 : yt.setPlaybackRate) == null ? void 0 : _a2.call(yt, rate);
                closeMenu();
              }
            })
          );
        });
        return;
      }
      ui.menuTitle.textContent = "\u05D0\u05D9\u05DB\u05D5\u05EA";
      ui.menuList.appendChild(
        makeMenuItem("\u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9", {
          checked: true,
          onClick: () => closeMenu()
        })
      );
    };
    captionState.loadForLang = async (lang) => {
      if (switchingCaptions) return;
      switchingCaptions = true;
      captionState.enabled = true;
      captionState.lang = lang;
      captionState.loadingLang = lang;
      captionState.pendingLang = "";
      renderMenu();
      try {
        if (!playerReady || !handle || !hasYouTubePlaybackStarted(handle.embed)) {
          captionState.pendingLang = lang;
          captionState.loadingLang = "";
          renderMenu();
          return;
        }
        const native = await enableNativeYouTubeCaptions(handle, {
          targetLang: lang,
          sourceLang: "auto"
        });
        captionState.nativeMode = native.ok;
        captionState.loadingLang = "";
        captionsBooted = true;
        if (native.needsPlayback) {
          captionState.pendingLang = lang;
        }
        renderMenu();
      } catch (e) {
        captionState.loadingLang = "";
        captionsBooted = true;
        renderMenu();
      } finally {
        switchingCaptions = false;
      }
    };
    captionState.selectLang = (lang) => {
      void captionState.loadForLang(lang);
    };
    ui.playBtn.addEventListener("click", (e) => {
      blockEvent(e);
      togglePlay();
    });
    ui.playLarge.addEventListener("click", (e) => {
      blockEvent(e);
      togglePlay();
    });
    ui.clickLayer.addEventListener("click", () => {
      if (ui.shell.classList.contains("scp-menu-open")) {
        closeMenu();
        return;
      }
      togglePlay();
    });
    ui.muteBtn.addEventListener("click", (e) => {
      blockEvent(e);
      toggleMute();
    });
    ui.fsBtn.addEventListener("click", (e) => {
      blockEvent(e);
      toggleFullscreen();
    });
    ui.settingsBtn.addEventListener("click", (e) => {
      blockEvent(e);
      if (ui.shell.classList.contains("scp-menu-open")) closeMenu();
      else openMenu();
    });
    ui.menuBack.addEventListener("click", (e) => {
      blockEvent(e);
      menuPanel = "root";
      renderMenu();
    });
    ui.menu.addEventListener("click", (e) => e.stopPropagation());
    ui.controls.addEventListener("click", (e) => e.stopPropagation());
    ui.seek.addEventListener("pointerdown", () => {
      seeking = true;
    });
    ui.seek.addEventListener("input", () => {
      var _a;
      const d = duration || ((_a = yt == null ? void 0 : yt.getDuration) == null ? void 0 : _a.call(yt)) || 0;
      const pct = Number(ui.seek.value) / 1e3;
      ui.fill.style.width = `${pct * 100}%`;
      ui.timeEl.textContent = formatTime(d * pct);
    });
    const commitSeek = () => {
      var _a, _b;
      if (!playerReady || !yt) {
        seeking = false;
        return;
      }
      const d = duration || 0;
      try {
        const live = (_a = yt.getDuration) == null ? void 0 : _a.call(yt);
        if (live) duration = live;
      } catch (e) {
      }
      const pct = Number(ui.seek.value) / 1e3;
      const total = duration || 0;
      if (total > 0) {
        try {
          (_b = yt.seekTo) == null ? void 0 : _b.call(yt, total * pct, true);
        } catch (e) {
        }
      }
      seeking = false;
      showUiTemporarily();
    };
    ui.seek.addEventListener("change", commitSeek);
    ui.seek.addEventListener("pointerup", commitSeek);
    ui.volume.addEventListener("input", () => {
      var _a, _b, _c;
      if (!playerReady || !yt) return;
      const v = Number(ui.volume.value);
      try {
        (_a = yt.setVolume) == null ? void 0 : _a.call(yt, v);
        if (v <= 0) {
          (_b = yt.mute) == null ? void 0 : _b.call(yt);
          ui.muteBtn.innerHTML = ICONS.mute;
        } else {
          (_c = yt.unMute) == null ? void 0 : _c.call(yt);
          ui.muteBtn.innerHTML = ICONS.volume;
        }
      } catch (e) {
      }
    });
    let moveRaf = 0;
    ui.shell.addEventListener(
      "mousemove",
      () => {
        if (moveRaf) return;
        moveRaf = requestAnimationFrame(() => {
          moveRaf = 0;
          showUiTemporarily();
        });
      },
      { passive: true }
    );
    ui.shell.addEventListener("touchstart", () => showUiTemporarily(), { passive: true });
    ui.shell.addEventListener("contextmenu", blockEvent);
    document.addEventListener("fullscreenchange", () => {
      const active = document.fullscreenElement === ui.shell;
      ui.fsBtn.innerHTML = active ? ICONS.exitFs : ICONS.fullscreen;
    });
    const onStateChange = (event) => {
      var _a;
      if (!playerReady) return;
      yt = event.target;
      handle = { embed: yt };
      const state = event.data;
      if (!playbackUnlocked) {
        if (captionWarmupDone) return;
        if (state === 1 || state === 3 || state === 2 && captionWarmupStarted) {
          void finishCaptionWarmup();
        }
        return;
      }
      if (state === 1) {
        isPlaying = true;
        setPausedUi(false);
        showUiTemporarily();
        if (captionState.pendingLang) {
          const pending = captionState.pendingLang;
          captionState.pendingLang = "";
          void captionState.loadForLang(pending);
        } else if (captionState.enabled && !captionsBooted && !switchingCaptions) {
          void captionState.loadForLang(captionState.lang);
        }
      } else if (state === 2) {
        isPlaying = false;
        setPausedUi(true);
        setUiVisible(true);
        if (uiHideTimer) clearTimeout(uiHideTimer);
        try {
          saveProgress(target.videoId, lessonId, ((_a = yt.getCurrentTime) == null ? void 0 : _a.call(yt)) || 0);
        } catch (e) {
        }
      } else if (state === 0) {
        isPlaying = false;
        setPausedUi(true);
        setUiVisible(true);
        clearProgress(target.videoId, lessonId);
      }
    };
    void loadYouTubeApi().then(() => {
      var _a;
      if (!((_a = window.YT) == null ? void 0 : _a.Player)) {
        unlockPlayback("\u05DE\u05D5\u05DB\u05DF \u05DC\u05E6\u05E4\u05D9\u05D9\u05D4");
        return;
      }
      const origin = window.location.origin;
      const playerVars = {
        rel: 0,
        modestbranding: 1,
        iv_load_policy: 3,
        playsinline: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        enablejsapi: 1,
        cc_load_policy: 1,
        mute: 1,
        origin
      };
      if (resumeAt > 0) playerVars.start = Math.floor(resumeAt);
      yt = new window.YT.Player(ui.mountEl.id, {
        videoId: target.videoId,
        width: "100%",
        height: "100%",
        host: "https://www.youtube.com",
        playerVars,
        events: {
          onReady: (event) => {
            var _a2, _b;
            yt = event.target;
            handle = { embed: yt };
            playerReady = true;
            try {
              duration = ((_a2 = yt.getDuration) == null ? void 0 : _a2.call(yt)) || 0;
              currentSpeed = ((_b = yt.getPlaybackRate) == null ? void 0 : _b.call(yt)) || 1;
            } catch (e) {
            }
            setPausedUi(true);
            setUiVisible(false);
            renderMenu();
            const iframe = ui.surface.querySelector("iframe");
            if (iframe) {
              iframe.style.pointerEvents = "none";
              iframe.setAttribute("tabindex", "-1");
              iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
            }
            if (!progressTimer) {
              progressTimer = window.setInterval(syncProgress, 400);
            }
            ui.waitText.textContent = "\u05D8\u05D5\u05E2\u05DF \u05DB\u05EA\u05D5\u05D1\u05D9\u05D5\u05EA\u2026";
            startCaptionWarmup();
          },
          onStateChange,
          onApiChange: () => {
            if (!playerReady || !handle) return;
            if (!playbackUnlocked && captionWarmupStarted && !captionWarmupDone) {
              void finishCaptionWarmup();
              return;
            }
            if (playbackUnlocked && captionState.enabled && captionState.pendingLang && !switchingCaptions && isPlaying) {
              const pending = captionState.pendingLang;
              captionState.pendingLang = "";
              void captionState.loadForLang(pending);
            }
          },
          onError: () => {
            playerReady = true;
            unlockPlayback("\u05DE\u05D5\u05DB\u05DF \u05DC\u05E6\u05E4\u05D9\u05D9\u05D4");
          }
        }
      });
      handle = { embed: yt };
    }).catch(() => {
      unlockPlayback("\u05DE\u05D5\u05DB\u05DF \u05DC\u05E6\u05E4\u05D9\u05D9\u05D4");
    });
  }
  function scan() {
    mount(findTarget(readLesson()));
  }
  function boot() {
    if (window.__SchoolerPlayerBooted) return;
    window.__SchoolerPlayerBooted = true;
    ensureStyles();
    scan();
    let n = 0;
    const timer = setInterval(() => {
      scan();
      if (++n > 60) clearInterval(timer);
    }, 500);
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(() => scan()).observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
