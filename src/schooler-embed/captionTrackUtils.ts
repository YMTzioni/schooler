export const youtubeLangsMatch = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const left = a === 'he' || a === 'iw' ? 'he' : a;
  const right = b === 'he' || b === 'iw' ? 'he' : b;
  return left === right;
};

export const normalizeTrackLang = (lang: string): string => {
  if (!lang) return '';
  if (lang === 'iw') return 'he';
  return lang;
};

const matchesLang = (track: CaptionTrack, requestedLang: string): boolean => {
  if (!track?.lang) return false;
  if (requestedLang === 'he' || requestedLang === 'iw') {
    return track.lang === 'he' || track.lang === 'iw';
  }
  return youtubeLangsMatch(track.lang, requestedLang);
};

export interface CaptionTrack {
  lang: string;
  name: string;
  baseUrl: string;
  isAuto: boolean;
  kind: string;
}

export interface TranslationLanguage {
  lang: string;
  name: string;
}

export interface CaptionTrackInfo {
  tracks: CaptionTrack[];
  translationLanguages: TranslationLanguage[];
}

export const pickBestSourceTrack = (
  tracks: CaptionTrack[],
  preferredLang = 'auto',
): CaptionTrack | null => {
  if (!tracks?.length) return null;

  if (preferredLang && preferredLang !== 'auto') {
    const exact = tracks.find((track) => matchesLang(track, preferredLang));
    if (exact) return exact;
    const autoVariant = tracks.find((track) => matchesLang(track, preferredLang) && track.isAuto);
    if (autoVariant) return autoVariant;
  }

  const manualHebrew = tracks.find((track) => (track.lang === 'he' || track.lang === 'iw') && !track.isAuto);
  if (manualHebrew) return manualHebrew;

  const autoHebrew = tracks.find((track) => track.lang === 'he' || track.lang === 'iw');
  if (autoHebrew) return autoHebrew;

  const manualEnglish = tracks.find((track) => track.lang === 'en' && !track.isAuto);
  if (manualEnglish) return manualEnglish;

  const autoEnglish = tracks.find((track) => track.lang === 'en');
  if (autoEnglish) return autoEnglish;

  const anyManual = tracks.find((track) => !track.isAuto);
  if (anyManual) return anyManual;

  return tracks.find((track) => track.isAuto) || tracks[0];
};

export const pickYoutubeTranslationCode = (
  translationLanguages: TranslationLanguage[],
  targetLang: string,
): string | null => {
  if (!targetLang || targetLang === 'none' || !translationLanguages?.length) return null;
  const normalized = normalizeTrackLang(targetLang);

  const exact = translationLanguages.find((entry) => youtubeLangsMatch(entry.lang, normalized));
  if (exact) return exact.lang;

  return null;
};

export const canYoutubeTranslateTo = (
  translationLanguages: TranslationLanguage[],
  targetLang: string,
): boolean => Boolean(pickYoutubeTranslationCode(translationLanguages, targetLang));
