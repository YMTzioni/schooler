export type CaptionLang = 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'none';

export interface SchoolerPlayerConfig {
  captionLang?: CaptionLang;
  coverHideMs?: number;
}

export interface LessonInfo {
  videoId: string;
  seekStart: number;
  lessonId: string;
  title: string;
}

export interface MountTarget {
  host: HTMLElement;
  iframe: HTMLIFrameElement | null;
  videoId: string;
  lesson: LessonInfo;
}

export interface VttCue {
  start: number;
  end: number;
  text: string;
}

export interface CaptionState {
  enabled: boolean;
  lang: string;
  loadingLang: string;
  nativeMode: boolean;
  pendingLang: string;
  selectLang: (lang: string) => void;
  loadForLang: (lang: string) => Promise<void>;
}

export interface YoutubeEmbedApi {
  getOptions?: () => string[];
  getOption?: (module: string, option: string) => unknown;
  setOption?: (module: string, option: string, value: unknown) => void;
  loadModule?: (module: string) => void;
  addEventListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeEventListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  getPlayerState?: () => number;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
  mute?: () => void;
  unMute?: () => void;
  isMuted?: () => boolean;
  setVolume?: (volume: number) => void;
  getVolume?: () => number;
  setPlaybackRate?: (rate: number) => void;
  getPlaybackRate?: () => number;
  getAvailablePlaybackRates?: () => number[];
  destroy?: () => void;
}

export interface PlayerHandle {
  embed: YoutubeEmbedApi;
}

export interface YtPlayerConstructor {
  new (
    elementId: string | HTMLElement,
    options: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YoutubeEmbedApi }) => void;
        onStateChange?: (event: { data: number; target: YoutubeEmbedApi }) => void;
        onApiChange?: (event: { target: YoutubeEmbedApi }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ): YoutubeEmbedApi;
}

declare global {
  interface Window {
    __SchoolerPlayerBooted?: boolean;
    SchoolerPlayerConfig?: SchoolerPlayerConfig;
    YT?: {
      Player: YtPlayerConstructor;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export {};
