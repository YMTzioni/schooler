import type { PlayerHandle, YoutubeEmbedApi } from './types';

export type { YoutubeEmbedApi };

export interface NativeCaptionResult {
  ok: boolean;
  translated: boolean;
  track: Record<string, unknown> | null;
  mode: string;
  needsPlayback: boolean;
  sameLanguageOnly?: boolean;
}

export const normalizeYoutubeLang = (lang: string): string => {
  if (!lang || lang === 'none' || lang === 'auto') return '';
  if (lang === 'he') return 'iw';
  return lang;
};

export const youtubeLangsMatch = (a: string, b: string): boolean => {
  const left = normalizeYoutubeLang(a);
  const right = normalizeYoutubeLang(b);
  if (!left || !right) return false;
  if ((left === 'iw' || left === 'he') && (right === 'iw' || right === 'he')) return true;
  return left === right;
};

const getEmbed = (player: PlayerHandle | null | undefined): YoutubeEmbedApi | null =>
  player?.embed || null;

export const hasYouTubePlaybackStarted = (embed: YoutubeEmbedApi | null | undefined): boolean => {
  try {
    const state = embed?.getPlayerState?.();
    return state !== undefined && state !== -1;
  } catch {
    return false;
  }
};

export const isEmbedApiReady = (embed: YoutubeEmbedApi | null | undefined): boolean => {
  if (!embed?.setOption || !embed.getPlayerState) return false;
  try {
    const state = embed.getPlayerState();
    return state !== undefined && state !== -1;
  } catch {
    return false;
  }
};

const isTranslateableTrack = (track: Record<string, unknown> | null | undefined): boolean =>
  Boolean(
    track &&
      (track.is_translateable === true ||
        track.is_translatable === 1 ||
        track.is_translatable === true),
  );

const isServedSourceTrack = (track: Record<string, unknown> | null | undefined): boolean =>
  Boolean(track) && (track!.is_servable !== false || track!.kind === 'asr');

const getAvailableModules = (embed: YoutubeEmbedApi): string[] => {
  try {
    const options = embed.getOptions?.();
    if (!Array.isArray(options)) return [];
    return options.filter((name) => name === 'captions' || name === 'cc');
  } catch {
    return [];
  }
};

const readTracklist = (embed: YoutubeEmbedApi, moduleName: string): Record<string, unknown>[] => {
  try {
    const list = embed.getOption?.(moduleName, 'tracklist');
    return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
};

const readTranslationLanguages = (embed: YoutubeEmbedApi): Record<string, unknown>[] => {
  try {
    const languages = embed.getOption?.('captions', 'translationLanguages');
    return Array.isArray(languages) ? (languages as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
};

const readBestTracklist = (
  embed: YoutubeEmbedApi,
  modules: string[],
): { moduleName: string; tracklist: Record<string, unknown>[] } => {
  const order = modules.length ? modules : ['captions', 'cc'];
  let best = { moduleName: order[0], tracklist: [] as Record<string, unknown>[] };

  for (const moduleName of order) {
    const tracklist = readTracklist(embed, moduleName);
    if (tracklist.length > best.tracklist.length) {
      best = { moduleName, tracklist };
    }
  }

  return best;
};

const waitForCaptionModules = (
  embed: YoutubeEmbedApi,
  timeoutMs = 12000,
): Promise<string[]> =>
  new Promise((resolve) => {
    const pick = () => getAvailableModules(embed);
    const existing = pick();
    if (existing.length) {
      resolve(existing);
      return;
    }

    const onApiChange = () => {
      const modules = pick();
      if (modules.length) {
        embed.removeEventListener?.('onApiChange', onApiChange);
        window.clearTimeout(timer);
        resolve(modules);
      }
    };

    embed.addEventListener?.('onApiChange', onApiChange);
    const timer = window.setTimeout(() => {
      embed.removeEventListener?.('onApiChange', onApiChange);
      resolve(pick());
    }, timeoutMs);
  });

export const waitForCaptionsCatalog = async (
  embed: YoutubeEmbedApi,
  timeoutMs = 6000,
): Promise<{ tracks: Record<string, unknown>[]; translations: Record<string, unknown>[] }> => {
  const modules = await waitForCaptionModules(embed, Math.min(timeoutMs, 8000));
  const started = Date.now();
  let tracks: Record<string, unknown>[] = [];
  let translations: Record<string, unknown>[] = [];
  let sawTracksAt = 0;

  while (Date.now() - started < timeoutMs) {
    try {
      embed.loadModule?.('captions');
      embed.loadModule?.('cc');
    } catch {
      /* optional */
    }

    tracks = readBestTracklist(embed, modules).tracklist;
    translations = readTranslationLanguages(embed);

    if (tracks.length && !sawTracksAt) sawTracksAt = Date.now();

    const langCodes = new Set(
      tracks.map((t) => normalizeYoutubeLang(String(t.languageCode || ''))).filter(Boolean),
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
    translations: readTranslationLanguages(embed),
  };
};

const pickSourceCaptionTrack = (
  tracks: Record<string, unknown>[],
  { sourceLang = 'auto' }: { sourceLang?: string } = {},
): Record<string, unknown> | null => {
  if (!tracks.length) return null;

  if (sourceLang && sourceLang !== 'auto') {
    const source = tracks.find(
      (track) => isServedSourceTrack(track) && youtubeLangsMatch(String(track.languageCode), sourceLang),
    );
    if (source) return source;
  }

  const hebrew = tracks.find(
    (track) => isServedSourceTrack(track) && youtubeLangsMatch(String(track.languageCode), 'iw'),
  );
  if (hebrew) return hebrew;

  const english = tracks.find(
    (track) => isServedSourceTrack(track) && youtubeLangsMatch(String(track.languageCode), 'en'),
  );
  if (english) return english;

  return tracks.find(isServedSourceTrack) || tracks[0] || null;
};

/** Clone full YouTube track objects — stripped payloads break auto-translate. */
const buildTrackForLanguage = (
  languageCode: string,
  tracklist: Record<string, unknown>[],
  translationLanguages: Record<string, unknown>[],
): Record<string, unknown> | null => {
  const normalized = normalizeYoutubeLang(languageCode);
  if (!normalized) return null;

  const matches = tracklist.filter((track) =>
    youtubeLangsMatch(String(track.languageCode || ''), languageCode),
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

  const fromTranslations = translationLanguages.find((track) =>
    youtubeLangsMatch(String(track.languageCode || track.lang || ''), languageCode),
  );
  if (fromTranslations) {
    const code =
      normalizeYoutubeLang(String(fromTranslations.languageCode || fromTranslations.lang || '')) ||
      normalized;
    return {
      languageCode: code,
      languageName: fromTranslations.languageName || fromTranslations.displayName || code,
      displayName: fromTranslations.displayName || fromTranslations.languageName || code,
      is_translateable: true,
      is_servable: false,
      vss_id: String(fromTranslations.vss_id || fromTranslations.vssId || `.${code}`),
      vssId: String(fromTranslations.vss_id || fromTranslations.vssId || `.${code}`),
    };
  }

  return {
    languageCode: normalized,
    vss_id: `.${normalized}`,
    vssId: `.${normalized}`,
    is_translateable: true,
    is_servable: false,
  };
};

const pickYouTubeCaptionTrack = (
  tracks: Record<string, unknown>[],
  {
    targetLang = 'none',
    sourceLang = 'auto',
    translationLanguages = [],
  }: {
    targetLang?: string;
    sourceLang?: string;
    translationLanguages?: Record<string, unknown>[];
  } = {},
): { track: Record<string, unknown>; mode: string; sourceTrack: Record<string, unknown> | null } | null => {
  const wantsTranslation = Boolean(targetLang && targetLang !== 'none');
  const normalizedTarget = normalizeYoutubeLang(targetLang);
  const sourceTrack = pickSourceCaptionTrack(tracks, { sourceLang });

  if (wantsTranslation && normalizedTarget) {
    const built = buildTrackForLanguage(targetLang, tracks, translationLanguages);
    if (!built) return null;

    if (
      sourceTrack &&
      youtubeLangsMatch(String(built.languageCode), targetLang) &&
      youtubeLangsMatch(String(built.languageCode), String(sourceTrack.languageCode)) &&
      !isTranslateableTrack(built)
    ) {
      return { track: built, mode: 'source-same-language', sourceTrack };
    }

    const translatingFromDifferentSource =
      sourceTrack && !youtubeLangsMatch(String(sourceTrack.languageCode), targetLang);

    const mode = translatingFromDifferentSource
      ? isTranslateableTrack(built) || built.is_servable === false
        ? 'translated'
        : 'youtube-translate'
      : 'translated';

    return { track: built, mode, sourceTrack };
  }

  if (sourceTrack) return { track: { ...sourceTrack }, mode: 'source', sourceTrack };

  if (normalizedTarget) {
    const built = buildTrackForLanguage(targetLang, tracks, translationLanguages);
    if (built) return { track: built, mode: 'fallback', sourceTrack: null };
  }

  return null;
};

const applyCaptionSelection = (
  embed: YoutubeEmbedApi,
  moduleName: string,
  track: Record<string, unknown>,
): void => {
  embed.loadModule?.(moduleName);
  embed.setOption?.(moduleName, 'track', track);
  try {
    embed.setOption?.(moduleName, 'reload', true);
  } catch {
    /* optional */
  }
};

const applyCaptionSelectionAcrossModules = (
  embed: YoutubeEmbedApi,
  modules: string[],
  track: Record<string, unknown>,
): string | null => {
  const order = [...new Set([...modules, 'captions', 'cc'])];
  for (const moduleName of order) {
    try {
      applyCaptionSelection(embed, moduleName, track);
      return moduleName;
    } catch {
      /* try next */
    }
  }
  return null;
};

/** For auto-translate: prime source track, then apply translated track. */
const applyTranslatedSelection = (
  embed: YoutubeEmbedApi,
  modules: string[],
  selection: {
    track: Record<string, unknown>;
    mode: string;
    sourceTrack: Record<string, unknown> | null;
  },
): string | null => {
  if (
    selection.sourceTrack &&
    (selection.mode === 'translated' || selection.mode === 'youtube-translate') &&
    !youtubeLangsMatch(String(selection.sourceTrack.languageCode), String(selection.track.languageCode))
  ) {
    try {
      applyCaptionSelectionAcrossModules(embed, modules, { ...selection.sourceTrack });
    } catch {
      /* continue to target */
    }
  }

  const withTranslationMeta: Record<string, unknown> = { ...selection.track };
  if (selection.sourceTrack && !withTranslationMeta.translationLanguage) {
    const code = normalizeYoutubeLang(String(selection.track.languageCode || ''));
    if (code) {
      withTranslationMeta.translationLanguage = {
        languageCode: code,
        languageName: selection.track.languageName || selection.track.displayName || code,
      };
    }
  }

  return (
    applyCaptionSelectionAcrossModules(embed, modules, withTranslationMeta) ||
    applyCaptionSelectionAcrossModules(embed, modules, selection.track)
  );
};

export async function disableYouTubeNativeCaptions(
  player: PlayerHandle | null | undefined,
): Promise<void> {
  const embed = getEmbed(player);
  if (!embed?.setOption || !isEmbedApiReady(embed)) return;
  for (const moduleName of ['captions', 'cc']) {
    try {
      embed.loadModule?.(moduleName);
      embed.setOption(moduleName, 'track', {});
    } catch {
      /* optional */
    }
  }
}

export async function enableNativeYouTubeCaptions(
  player: PlayerHandle | null | undefined,
  { targetLang = 'none', sourceLang = 'auto' }: { targetLang?: string; sourceLang?: string } = {},
): Promise<NativeCaptionResult> {
  const wantsTranslation = Boolean(targetLang && targetLang !== 'none');
  const embed = getEmbed(player);

  if (!embed?.setOption) {
    return { ok: false, translated: false, track: null, mode: 'failed', needsPlayback: true };
  }

  if (!hasYouTubePlaybackStarted(embed)) {
    return {
      ok: false,
      translated: false,
      track: null,
      mode: 'needs-playback',
      needsPlayback: true,
    };
  }

  const modules = await waitForCaptionModules(embed, 12000);
  if (!modules.length) {
    return { ok: false, translated: false, track: null, mode: 'failed', needsPlayback: false };
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
        translationLanguages,
      });

      if (!selection?.track) {
        if (wantsTranslation && attempt < maxAttempts - 1) {
          await new Promise((r) => window.setTimeout(r, delayMs));
          continue;
        }

        const languageCode =
          normalizeYoutubeLang(targetLang !== 'none' ? targetLang : sourceLang) || 'iw';
        applyCaptionSelectionAcrossModules(embed, modules, {
          languageCode,
          vss_id: `.${languageCode}`,
        });
        return {
          ok: true,
          translated: wantsTranslation,
          track: { languageCode },
          mode: 'fallback',
          needsPlayback: false,
        };
      }

      const appliedModule = applyTranslatedSelection(embed, modules, selection);
      if (!appliedModule && attempt < maxAttempts - 1) {
        await new Promise((r) => window.setTimeout(r, delayMs));
        continue;
      }

      const translated =
        wantsTranslation &&
        (selection.mode === 'translated' || selection.mode === 'youtube-translate') &&
        selection.mode !== 'source-same-language';

      return {
        ok: Boolean(appliedModule),
        translated,
        track: selection.track,
        mode: selection.mode,
        sameLanguageOnly: selection.mode === 'source-same-language',
        needsPlayback: false,
      };
    } catch {
      /* iframe warming up */
    }

    await new Promise((r) => window.setTimeout(r, delayMs));
  }

  return { ok: false, translated: false, track: null, mode: 'failed', needsPlayback: false };
}

export async function prefetchCaptionLanguages(
  player: PlayerHandle | null | undefined,
  languages: readonly { value: string; label: string }[],
  onProgress?: (label: string, index: number, total: number) => void,
): Promise<{ ok: boolean; imported: string[] }> {
  const embed = getEmbed(player);
  if (!embed?.setOption) return { ok: false, imported: [] };
  if (!hasYouTubePlaybackStarted(embed)) return { ok: false, imported: [] };

  onProgress?.('קטלוג YouTube', 0, languages.length);
  await waitForCaptionsCatalog(embed, 6000);
  const imported: string[] = [];

  for (let i = 0; i < languages.length; i += 1) {
    const lang = languages[i];
    if (lang.value === 'none') continue;
    onProgress?.(lang.label, i + 1, languages.length);
    const result = await enableNativeYouTubeCaptions(player, {
      targetLang: lang.value,
      sourceLang: 'auto',
    });
    if (result.ok) imported.push(lang.value);
    await new Promise((r) => window.setTimeout(r, 350));
  }

  return { ok: imported.length > 0, imported };
}

export async function waitForEmbedApi(
  player: PlayerHandle | null | undefined,
  timeoutMs = 8000,
): Promise<boolean> {
  const embed = getEmbed(player);
  if (!embed?.setOption) return false;
  if (isEmbedApiReady(embed)) return true;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (isEmbedApiReady(embed)) return true;
    await new Promise((r) => window.setTimeout(r, 200));
  }
  return isEmbedApiReady(embed);
}
