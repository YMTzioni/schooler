import type { VttCue } from './types';

const GOOGLE_LANG_CODES: Record<string, string> = {
  he: 'he',
  iw: 'he',
  en: 'en',
  ar: 'ar',
  ru: 'ru',
  fr: 'fr',
};

const toGoogleLang = (lang: string): string | null => {
  if (!lang || lang === 'none' || lang === 'auto') return null;
  return GOOGLE_LANG_CODES[lang] || lang;
};

const normalizeLangFamily = (lang: string): string => {
  const google = toGoogleLang(lang);
  if (!google) return '';
  if (lang === 'he' || lang === 'iw' || google === 'he') return 'he';
  return google.toLowerCase();
};

const shouldSkipTranslation = (sourceLang: string, targetLang: string): boolean => {
  const source = normalizeLangFamily(sourceLang);
  const target = normalizeLangFamily(targetLang);
  if (!target || targetLang === 'none') return true;
  return source === target;
};

const parseVttCues = (vtt: string): VttCue[] => {
  const cues: VttCue[] = [];
  const blocks = String(vtt).replace(/\r/g, '').split(/\n\n+/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || trimmed.startsWith('WEBVTT') || trimmed.startsWith('NOTE')) continue;

    const lines = trimmed.split('\n');
    const timeLine = lines.find((line) => line.includes('-->'));
    if (!timeLine) continue;

    const [startRaw, endRaw] = timeLine.split('-->');
    const text = lines
      .filter((line) => line !== timeLine && !/^\d+$/.test(line.trim()))
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (!text) continue;

    cues.push({
      start: parseVttTime(startRaw),
      end: parseVttTime(endRaw),
      text,
    });
  }

  return cues;
};

const parseVttTime = (value: string): number => {
  const clean = value.trim().split(/\s+/)[0].replace(',', '.');
  const parts = clean.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return parts[0] * 60 + parts[1];
};

const cuesToVtt = (cues: VttCue[]): string => {
  const lines = ['WEBVTT', ''];
  cues.forEach((cue, index) => {
    lines.push(String(index + 1));
    lines.push(`${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}`);
    lines.push(cue.text);
    lines.push('');
  });
  return lines.join('\n');
};

const formatVttTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const whole = Math.floor(s);
  const ms = Math.round((s - whole) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
};

const translationLooksApplied = (sourceVtt: string, translatedVtt: string): boolean => {
  const sourceCues = parseVttCues(sourceVtt);
  const translatedCues = parseVttCues(translatedVtt);
  if (!sourceCues.length || !translatedCues.length) return false;
  if (sourceCues.length !== translatedCues.length) return true;
  const sample = Math.min(5, sourceCues.length);
  for (let i = 0; i < sample; i++) {
    if (sourceCues[i].text.trim() !== translatedCues[i].text.trim()) return true;
  }
  return false;
};

const translateBatchGoogle = async (texts: string[], fromLang: string, toLang: string): Promise<string[]> => {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: fromLang,
    tl: toLang,
    dt: 't',
  });
  texts.forEach((text) => params.append('q', text));

  const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`translation ${response.status}`);
  }

  const data = (await response.json()) as unknown[];
  const translated = data?.[0];
  if (!Array.isArray(translated)) {
    throw new Error('invalid translation response');
  }

  if (translated.length === texts.length) {
    return translated.map((part) => (Array.isArray(part) ? String(part[0] || '') : ''));
  }

  const joined = translated.map((part) => (Array.isArray(part) ? String(part[0] || '') : '')).join('');
  if (joined.includes('⟦C⟧')) {
    return joined.split('⟦C⟧').map((part) => part.trim());
  }

  return texts.map((text, index) => {
    const part = translated[index];
    return Array.isArray(part) ? String(part[0] || text) : text;
  });
};

const translateCache = new Map<string, string[]>();

const translateVttInternal = async (
  vttContent: string,
  sourceLang: string,
  targetLang: string,
): Promise<{ content: string; translatedLocally: boolean; detectedSourceLang: string }> => {
  const from = toGoogleLang(sourceLang) || 'auto';
  const to = toGoogleLang(targetLang);
  if (!to) {
    return { content: vttContent, translatedLocally: false, detectedSourceLang: sourceLang };
  }

  const cues = parseVttCues(vttContent);
  if (!cues.length) {
    throw new Error('no cues');
  }

  const uniqueTexts = [...new Set(cues.map((cue) => cue.text))];
  const translatedByText = new Map<string, string>();
  const chunkSize = 40;

  for (let index = 0; index < uniqueTexts.length; index += chunkSize) {
    const chunk = uniqueTexts.slice(index, index + chunkSize);
    const cacheKey = `${from}:${to}:${chunk.join('⟦C⟧')}`;
    let translatedChunk = translateCache.get(cacheKey);
    if (!translatedChunk) {
      translatedChunk = await translateBatchGoogle(chunk, from, to);
      translateCache.set(cacheKey, translatedChunk);
    }
    chunk.forEach((text, chunkIndex) => {
      translatedByText.set(text, translatedChunk![chunkIndex] || text);
    });
  }

  const translatedCues = cues.map((cue) => ({
    ...cue,
    text: translatedByText.get(cue.text) || cue.text,
  }));

  return {
    content: cuesToVtt(translatedCues),
    translatedLocally: true,
    detectedSourceLang: sourceLang,
  };
};

export async function translateVttInBrowser(
  vttContent: string,
  sourceLang: string,
  targetLang: string,
): Promise<{ content: string; translatedLocally: boolean; detectedSourceLang: string }> {
  if (shouldSkipTranslation(sourceLang, targetLang)) {
    return { content: vttContent, translatedLocally: false, detectedSourceLang: sourceLang };
  }

  const attempts = sourceLang && sourceLang !== 'auto' ? [sourceLang, 'auto'] : ['auto'];
  let lastResult: { content: string; translatedLocally: boolean; detectedSourceLang: string } | null = null;

  for (const attemptLang of attempts) {
    const result = await translateVttInternal(vttContent, attemptLang, targetLang);
    lastResult = result;
    if (translationLooksApplied(vttContent, result.content)) {
      return {
        ...result,
        detectedSourceLang: attemptLang === 'auto' ? sourceLang || 'auto' : attemptLang,
      };
    }
  }

  return lastResult || { content: vttContent, translatedLocally: false, detectedSourceLang: sourceLang };
}

export function youtubeTranslationLooksApplied(sourceCues: VttCue[], translatedCues: VttCue[]): boolean {
  if (!sourceCues.length || !translatedCues.length) return false;
  if (sourceCues.length !== translatedCues.length) return true;
  const sample = Math.min(5, sourceCues.length);
  for (let i = 0; i < sample; i++) {
    if (sourceCues[i].text.trim() !== translatedCues[i].text.trim()) return true;
  }
  return false;
}

export { parseVttCues };
