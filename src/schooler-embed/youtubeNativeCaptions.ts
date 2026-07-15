import type { PlayerHandle, YoutubeEmbedApi } from './types';

export type { YoutubeEmbedApi };

export interface NativeCaptionResult {
  ok: boolean;
  translated: boolean;
  track: Record<string, unknown> | null;
  mode: string;
  needsPlayback: boolean;
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

const readTracklist = (embed: YoutubeEmbedApi): Record<string, unknown>[] => {
  for (const moduleName of ['captions', 'cc'] as const) {
    try {
      const list = embed.getOption?.(moduleName, 'tracklist');
      if (Array.isArray(list) && list.length) return list as Record<string, unknown>[];
    } catch {
      /* optional */
    }
  }
  return [];
};

const readTranslationLanguages = (embed: YoutubeEmbedApi): Record<string, unknown>[] => {
  try {
    const languages = embed.getOption?.('captions', 'translationLanguages');
    return Array.isArray(languages) ? (languages as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
};

const trackToApiPayload = (track: Record<string, unknown>): Record<string, unknown> => {
  const languageCode =
    normalizeYoutubeLang(String(track.languageCode || track.lang || '')) ||
    String(track.languageCode || '');
  const out: Record<string, unknown> = { languageCode };
  const vss = track.vss_id || track.vssId || track.vssID;
  if (vss) {
    out.vss_id = String(vss);
    out.vssId = String(vss);
  }
  if (track.kind !== undefined && track.kind !== null && track.kind !== '') out.kind = track.kind;
  if (track.name) out.name = track.name;
  if (track.languageName) out.languageName = track.languageName;
  if (track.displayName) out.displayName = track.displayName;
  return out;
};

export const waitForCaptionsCatalog = async (
  embed: YoutubeEmbedApi,
  timeoutMs = 6000,
): Promise<{ tracks: Record<string, unknown>[]; translations: Record<string, unknown>[] }> => {
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

    tracks = readTracklist(embed);
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
    tracks: readTracklist(embed),
    translations: readTranslationLanguages(embed),
  };
};

const pickSourceLang = (tracks: Record<string, unknown>[]): string => {
  const hebrew = tracks.find((t) => youtubeLangsMatch(String(t.languageCode || ''), 'iw'));
  if (hebrew) return normalizeYoutubeLang(String(hebrew.languageCode));
  const english = tracks.find((t) => youtubeLangsMatch(String(t.languageCode || ''), 'en'));
  if (english) return normalizeYoutubeLang(String(english.languageCode));
  const first = tracks[0];
  return first ? normalizeYoutubeLang(String(first.languageCode || '')) || 'iw' : 'iw';
};

const buildTrack = (
  targetLang: string,
  tracks: Record<string, unknown>[],
  translations: Record<string, unknown>[],
): { track: Record<string, unknown>; mode: string; translated: boolean } => {
  if (!targetLang || targetLang === 'none') {
    const code = pickSourceLang(tracks);
    const source = tracks.find((t) => youtubeLangsMatch(String(t.languageCode || ''), code));
    if (source) {
      return { track: trackToApiPayload(source), mode: 'source', translated: false };
    }
    return { track: { languageCode: code }, mode: 'source', translated: false };
  }

  const normalized = normalizeYoutubeLang(targetLang);
  const direct = tracks.find((t) => youtubeLangsMatch(String(t.languageCode || ''), targetLang));
  if (direct) {
    const served = tracks.find(
      (t) =>
        youtubeLangsMatch(String(t.languageCode || ''), targetLang) && t.is_servable !== false,
    );
    const payload = trackToApiPayload(served || direct);
    const translated = direct.is_servable === false;
    return { track: payload, mode: translated ? 'translated' : 'source', translated };
  }

  const fromTranslations = translations.find((entry) =>
    youtubeLangsMatch(String(entry.languageCode || entry.lang || ''), targetLang),
  );
  if (fromTranslations) {
    const track: Record<string, unknown> = { languageCode: normalized };
    const vss = fromTranslations.vss_id || fromTranslations.vssId;
    if (vss) {
      track.vss_id = String(vss);
      track.vssId = String(vss);
    }
    return { track, mode: 'translated', translated: true };
  }

  return {
    track: { languageCode: normalized },
    mode: 'translated',
    translated: true,
  };
};

const applyTrack = (embed: YoutubeEmbedApi, track: Record<string, unknown>): boolean => {
  let applied = false;
  for (const moduleName of ['captions', 'cc']) {
    try {
      embed.loadModule?.(moduleName);
      embed.setOption?.(moduleName, 'track', track);
      applied = true;
    } catch {
      /* try next */
    }
  }
  return applied;
};

export async function disableYouTubeNativeCaptions(
  player: PlayerHandle | null | undefined,
): Promise<void> {
  const embed = getEmbed(player);
  if (!embed?.setOption || !isEmbedApiReady(embed)) return;
  for (const moduleName of ['captions', 'cc']) {
    try {
      embed.loadModule?.(moduleName);
      embed.setOption?.(moduleName, 'track', {});
    } catch {
      /* optional */
    }
  }
}

export async function enableNativeYouTubeCaptions(
  player: PlayerHandle | null | undefined,
  { targetLang = 'none' }: { targetLang?: string; sourceLang?: string } = {},
): Promise<NativeCaptionResult> {
  const embed = getEmbed(player);

  if (!embed?.setOption) {
    return { ok: false, translated: false, track: null, mode: 'failed', needsPlayback: true };
  }

  if (!hasYouTubePlaybackStarted(embed)) {
    return { ok: false, translated: false, track: null, mode: 'needs-playback', needsPlayback: true };
  }

  const { tracks, translations } = await waitForCaptionsCatalog(embed, 8000);
  const selection = buildTrack(targetLang, tracks, translations);
  const applied = applyTrack(embed, selection.track);

  return {
    ok: applied,
    translated: selection.translated,
    track: selection.track,
    mode: selection.mode,
    needsPlayback: false,
  };
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
  const { tracks, translations } = await waitForCaptionsCatalog(embed, 6000);
  const imported: string[] = [];

  for (let i = 0; i < languages.length; i += 1) {
    const lang = languages[i];
    onProgress?.(lang.label, i + 1, languages.length);
    const selection = buildTrack(lang.value, tracks, translations);
    const applied = applyTrack(embed, selection.track);
    if (applied) imported.push(lang.value);
    await new Promise((r) => window.setTimeout(r, 400));
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
