import playerCss from './styles.css';
import {
  disableYouTubeNativeCaptions,
  enableNativeYouTubeCaptions,
  hasYouTubePlaybackStarted,
  prefetchCaptionLanguages,
} from './youtubeNativeCaptions';
import type {
  CaptionState,
  LessonInfo,
  MountTarget,
  PlayerHandle,
  SchoolerPlayerConfig,
  YoutubeEmbedApi,
} from './types';

const CFG: Required<SchoolerPlayerConfig> = {
  captionLang: 'he',
  coverHideMs: 5000,
  ...((typeof window !== 'undefined' && window.SchoolerPlayerConfig) || {}),
};

const MARK = 'data-scp-player';

const CAPTION_LANGS = [
  { value: 'he', label: 'עברית' },
  { value: 'en', label: 'אנגלית' },
  { value: 'ar', label: 'ערבית' },
  { value: 'ru', label: 'רוסית' },
  { value: 'fr', label: 'צרפתית' },
  { value: 'none', label: 'שפת מקור' },
] as const;

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const ICONS = {
  play: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 2.5v13l12-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 2.5h4v13H3zm8 0h4v13h-4z"/></svg>',
  mute: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6.5h3.2L9.5 3v12L5.2 11.5H2zm10.1.4 1.4 1.4-1.4 1.4 1.1 1.1 1.4-1.4 1.4 1.4 1.1-1.1-1.4-1.4 1.4-1.4-1.1-1.1-1.4 1.4-1.4-1.4z"/></svg>',
  volume: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6.5h3.2L9.5 3v12L5.2 11.5H2zm8.3-2.2a5.5 5.5 0 0 1 0 9.4l1.1 1.2a7.1 7.1 0 0 0 0-11.8zm1.8 2.2a3.1 3.1 0 0 1 0 5l1.2 1.1a4.6 4.6 0 0 0 0-7.2z"/></svg>',
  settings: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M7.2 1.6h3.6l.4 2.1 1.7.9 2-1.1 1.8 1.8-1.1 2 .9 1.7 2.1.4v3.6l-2.1.4-.9 1.7 1.1 2-1.8 1.8-2-1.1-1.7.9-.4 2.1H7.2l-.4-2.1-1.7-.9-2 1.1L1.3 14l1.1-2-.9-1.7L-.6 9.9V6.3l2.1-.4.9-1.7L1.3 2.2 3.1.4l2 1.1 1.7-.9zM9 6.4A2.6 2.6 0 1 0 9 11.6 2.6 2.6 0 0 0 9 6.4z"/></svg>',
  fullscreen: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 6V2h4v2H4v2zm10-4h4v4h-2V4h-2zM2 12h2v2h2v2H2zm10 2h2v-2h2v4h-4z"/></svg>',
  exitFs: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6 2H4v2H2v2h4zm8 2V2h-2v4h4V4zm-8 8H2v2h2v2h2zm6 0h4v2h-2v2h-2z"/></svg>',
  back: '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M11.5 3.5 6 9l5.5 5.5 1.2-1.2L8.4 9l4.3-4.3z"/></svg>',
};

function extractVideoId(value: string | null | undefined): string {
  if (!value) return '';
  const s = String(value);
  if (/^[\w-]{11}$/.test(s.trim())) return s.trim();
  const m =
    s.match(/[?&]v=([\w-]{11})/) ||
    s.match(/youtu\.be\/([\w-]{11})/) ||
    s.match(/\/embed\/([\w-]{11})/) ||
    s.match(/i\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//);
  return m ? m[1] : '';
}

function readLesson(): LessonInfo {
  const out: LessonInfo = { videoId: '', seekStart: 0, lessonId: '', title: '' };
  const nodes = document.querySelectorAll('script.js-react-on-rails-component');
  for (let i = 0; i < nodes.length; i++) {
    const text = nodes[i].textContent || '';
    if (!text.includes('"lesson"')) continue;
    try {
      const data = JSON.parse(text) as {
        lesson?: { video?: { videoId?: string }; seekStart?: number; id?: string; name?: string };
      };
      const lesson = data.lesson || {};
      const video = lesson.video || {};
      out.videoId = String(video.videoId || '');
      out.seekStart = parseFloat(String(lesson.seekStart || 0)) || 0;
      out.lessonId = String(lesson.id || '');
      out.title = String(lesson.name || '');
      if (out.videoId) return out;
    } catch {
      /* ignore */
    }
  }
  const el = document.querySelector('div[lessonid]');
  if (el) {
    out.lessonId = el.getAttribute('lessonid') || '';
    out.seekStart = parseFloat(el.getAttribute('seekstart') || '0') || 0;
  }
  return out;
}

function findTarget(lesson: LessonInfo): MountTarget | null {
  const iframe =
    document.querySelector<HTMLIFrameElement>('.video-responsive iframe[src*="youtube"]') ||
    document.querySelector<HTMLIFrameElement>('.lesson--content_object iframe[src*="youtube"]') ||
    document.querySelector<HTMLIFrameElement>('div[lessonid] iframe[src*="youtube"]') ||
    document.querySelector<HTMLIFrameElement>('iframe[src*="youtube.com/embed"]') ||
    document.querySelector<HTMLIFrameElement>('iframe[src*="youtube-nocookie.com/embed"]');

  const videoId = (iframe && extractVideoId(iframe.getAttribute('src'))) || lesson.videoId;
  if (!videoId) return null;

  const host = iframe
    ? (iframe.closest('.video-responsive') as HTMLElement | null) ||
      (iframe.closest('.lesson--content_object') as HTMLElement | null) ||
      (iframe.closest('div[lessonid]') as HTMLElement | null) ||
      (iframe.parentElement as HTMLElement | null)
    : document.querySelector<HTMLElement>('.video-responsive') ||
      document.querySelector<HTMLElement>('div[lessonid]');

  if (!host) return null;
  return { host, iframe, videoId, lesson };
}

function progressKey(videoId: string, lessonId: string): string {
  return `scp-watch:${lessonId || videoId}`;
}

function loadProgress(videoId: string, lessonId: string): number {
  try {
    return parseFloat(localStorage.getItem(progressKey(videoId, lessonId)) || '0') || 0;
  } catch {
    return 0;
  }
}

function saveProgress(videoId: string, lessonId: string, seconds: number): void {
  if (!seconds || seconds < 3) return;
  try {
    localStorage.setItem(progressKey(videoId, lessonId), String(Math.floor(seconds)));
  } catch {
    /* ignore */
  }
}

function clearProgress(videoId: string, lessonId: string): void {
  try {
    localStorage.removeItem(progressKey(videoId, lessonId));
  } catch {
    /* ignore */
  }
}

function resolveResume(
  videoId: string,
  lessonId: string,
  schoolerSeek: number,
  duration: number,
): number {
  const start = Math.max(loadProgress(videoId, lessonId), schoolerSeek || 0);
  if (duration > 0 && start > duration - 12) return 0;
  return start >= 3 ? start : 0;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function speedLabel(rate: number): string {
  return rate === 1 ? 'רגיל' : `${rate}×`;
}

function captionLabel(value: string): string {
  const found = CAPTION_LANGS.find((lang) => lang.value === value);
  return found ? found.label : value;
}

function ensureStyles(): void {
  if (document.getElementById('scp-player-style')) return;
  const style = document.createElement('style');
  style.id = 'scp-player-style';
  style.textContent = playerCss;
  (document.head || document.documentElement).appendChild(style);
}

function blockEvent(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
}

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } catch {
        /* ignore */
      }
      resolve();
    };
    if (document.querySelector('script[data-scp-yt-api]')) {
      const started = Date.now();
      const tick = () => {
        if (window.YT?.Player) {
          resolve();
          return;
        }
        if (Date.now() - started > 15000) {
          reject(new Error('yt-api'));
          return;
        }
        window.setTimeout(tick, 100);
      };
      tick();
      return;
    }
    const el = document.createElement('script');
    el.src = 'https://www.youtube.com/iframe_api';
    el.async = true;
    el.setAttribute('data-scp-yt-api', '1');
    el.onerror = () => reject(new Error('yt-api'));
    (document.head || document.documentElement).appendChild(el);
  });
}

function createButton(className: string, label: string, html: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.setAttribute('aria-label', label);
  btn.innerHTML = html;
  return btn;
}

function attachShields(container: HTMLElement): void {
  if (container.querySelector('.scp-shields')) return;
  const wrap = document.createElement('div');
  wrap.className = 'scp-shields';
  wrap.setAttribute('aria-hidden', 'true');
  const zones = [
    'scp-shield--top',
    'scp-shield--top-right',
    'scp-shield--br-watch',
    'scp-shield--br-logo scp-shield--logo-cover',
    'scp-shield--bl-logo scp-shield--logo-cover',
  ];
  for (const zoneClass of zones) {
    const zone = document.createElement('div');
    zone.className = `scp-shield ${zoneClass}`;
    for (const type of ['click', 'mousedown', 'mouseup', 'dblclick', 'contextmenu'] as const) {
      zone.addEventListener(type, blockEvent, true);
    }
    wrap.appendChild(zone);
  }
  container.appendChild(wrap);
}

function buildShell(): {
  shell: HTMLElement;
  surface: HTMLElement;
  mountEl: HTMLElement;
  clickLayer: HTMLElement;
  playLarge: HTMLButtonElement;
  controls: HTMLElement;
  playBtn: HTMLButtonElement;
  seek: HTMLInputElement;
  fill: HTMLElement;
  timeEl: HTMLElement;
  muteBtn: HTMLButtonElement;
  volume: HTMLInputElement;
  settingsBtn: HTMLButtonElement;
  fsBtn: HTMLButtonElement;
  menu: HTMLElement;
  menuBack: HTMLButtonElement;
  menuTitle: HTMLElement;
  menuList: HTMLElement;
  waitOverlay: HTMLElement;
  waitText: HTMLElement;
} {
  const shell = document.createElement('div');
  shell.className = 'scp-shell scp-paused scp-ui-visible scp-booting';

  const surface = document.createElement('div');
  surface.className = 'scp-surface';

  const mountEl = document.createElement('div');
  mountEl.id = `scp-yt-${Math.random().toString(36).slice(2, 9)}`;
  surface.appendChild(mountEl);

  const clickLayer = document.createElement('div');
  clickLayer.className = 'scp-click-layer';

  const playLarge = createButton('scp-play-large', 'נגן', ICONS.play);
  playLarge.disabled = true;

  const waitOverlay = document.createElement('div');
  waitOverlay.className = 'scp-wait';
  waitOverlay.setAttribute('aria-live', 'polite');
  const waitSpinner = document.createElement('div');
  waitSpinner.className = 'scp-wait-spinner';
  const waitText = document.createElement('div');
  waitText.className = 'scp-wait-text';
  waitText.textContent = 'טוען כתוביות…';
  const waitHint = document.createElement('div');
  waitHint.className = 'scp-wait-hint';
  waitHint.textContent = 'מייבאים את כל שפות הכתוביות לפני הצפייה';
  waitOverlay.appendChild(waitSpinner);
  waitOverlay.appendChild(waitText);
  waitOverlay.appendChild(waitHint);

  const controls = document.createElement('div');
  controls.className = 'scp-controls';

  const playBtn = createButton('scp-btn scp-play', 'נגן', ICONS.play);
  playBtn.disabled = true;

  const progress = document.createElement('div');
  progress.className = 'scp-progress';
  const track = document.createElement('div');
  track.className = 'scp-progress-track';
  const fill = document.createElement('div');
  fill.className = 'scp-progress-fill';
  track.appendChild(fill);
  const seek = document.createElement('input');
  seek.type = 'range';
  seek.min = '0';
  seek.max = '1000';
  seek.value = '0';
  seek.step = '1';
  seek.setAttribute('aria-label', 'Seek');
  seek.disabled = true;
  progress.appendChild(track);
  progress.appendChild(seek);

  const timeEl = document.createElement('div');
  timeEl.className = 'scp-time';
  timeEl.textContent = '0:00';

  const volumeWrap = document.createElement('div');
  volumeWrap.className = 'scp-volume';
  const muteBtn = createButton('scp-btn', 'השתק', ICONS.volume);
  muteBtn.disabled = true;
  const volume = document.createElement('input');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '100';
  volume.value = '100';
  volume.setAttribute('aria-label', 'Volume');
  volume.disabled = true;
  volumeWrap.appendChild(muteBtn);
  volumeWrap.appendChild(volume);

  const menuWrap = document.createElement('div');
  menuWrap.className = 'scp-menu-wrap';
  const settingsBtn = createButton('scp-btn', 'הגדרות', ICONS.settings);
  settingsBtn.disabled = true;
  const menu = document.createElement('div');
  menu.className = 'scp-menu';
  menu.setAttribute('role', 'menu');
  const menuHeader = document.createElement('div');
  menuHeader.className = 'scp-menu-header';
  const menuBack = createButton('scp-menu-back', 'חזרה', ICONS.back);
  const menuTitle = document.createElement('span');
  menuTitle.textContent = 'הגדרות';
  menuHeader.appendChild(menuBack);
  menuHeader.appendChild(menuTitle);
  const menuList = document.createElement('div');
  menuList.className = 'scp-menu-list';
  menu.appendChild(menuHeader);
  menu.appendChild(menuList);
  menuWrap.appendChild(settingsBtn);
  menuWrap.appendChild(menu);

  const fsBtn = createButton('scp-btn', 'מסך מלא', ICONS.fullscreen);
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
    waitText,
  };
}

function mount(target: MountTarget | null): void {
  if (!target?.host || !target.videoId) return;
  if (
    target.host.getAttribute(MARK) === target.videoId &&
    target.host.querySelector('.scp-shell')
  ) {
    return;
  }

  ensureStyles();
  target.host.setAttribute(MARK, target.videoId);
  target.host.setAttribute('oncontextmenu', 'return false');
  if (getComputedStyle(target.host).position === 'static') target.host.style.position = 'relative';

  target.host.querySelectorAll('.scp-shell').forEach((node) => node.remove());
  if (target.iframe) {
    try {
      target.iframe.src = 'about:blank';
      target.iframe.remove();
    } catch {
      try {
        target.iframe.style.display = 'none';
      } catch {
        /* ignore */
      }
    }
  }

  const ui = buildShell();
  target.host.appendChild(ui.shell);

  const lessonId = target.lesson.lessonId || '';
  const schoolerSeek = target.lesson.seekStart || 0;
  const hideMs = Number(CFG.coverHideMs) || 5000;

  let yt: YoutubeEmbedApi | null = null;
  let handle: PlayerHandle | null = null;
  let duration = 0;
  let seeking = false;
  let uiHideTimer: ReturnType<typeof setTimeout> | null = null;
  let menuPanel: 'root' | 'captions' | 'speed' | 'quality' = 'root';
  let currentSpeed = 1;
  let isPlaying = false;
  let captionsBooted = false;
  let switchingCaptions = false;
  let playerReady = false;
  let playbackUnlocked = false;
  let captionWarmupStarted = false;
  let captionWarmupDone = false;
  let progressTimer: ReturnType<typeof setInterval> | null = null;

  const captionState: CaptionState = {
    enabled: true,
    lang: CFG.captionLang || 'he',
    loadingLang: '',
    nativeMode: false,
    pendingLang: '',
    selectLang() {},
    async loadForLang() {},
  };

  const setControlsEnabled = (enabled: boolean) => {
    ui.playBtn.disabled = !enabled;
    ui.playLarge.disabled = !enabled;
    ui.seek.disabled = !enabled;
    ui.muteBtn.disabled = !enabled;
    ui.volume.disabled = !enabled;
    ui.settingsBtn.disabled = !enabled;
    ui.fsBtn.disabled = !enabled;
  };

  const unlockPlayback = (message = 'מוכן לצפייה') => {
    if (playbackUnlocked) return;
    playbackUnlocked = true;
    captionWarmupDone = true;
    ui.shell.classList.remove('scp-booting');
    ui.waitText.textContent = message;
    ui.waitOverlay.classList.add('scp-wait--done');
    window.setTimeout(() => {
      ui.waitOverlay.hidden = true;
    }, 350);
    setControlsEnabled(true);
    setPausedUi(true);
    setUiVisible(true);
  };

  const finishCaptionWarmup = async () => {
    if (captionWarmupDone || !handle || !yt) return;
    captionWarmupDone = true;
    ui.waitText.textContent = 'מחפש מסלולי כתוביות…';

    try {
      await prefetchCaptionLanguages(handle, CAPTION_LANGS, (label, index, total) => {
        ui.waitText.textContent = `מייבא כתוביות (${index}/${total}): ${label}`;
      });
      ui.waitText.textContent = 'מחיל כתוביות ברירת מחדל…';
      await captionState.loadForLang(captionState.lang);
    } catch {
      try {
        await captionState.loadForLang(captionState.lang);
      } catch {
        /* continue unlock */
      }
    }

    try {
      yt.pauseVideo?.();
      if (resumeAt > 0) yt.seekTo?.(resumeAt, true);
      yt.unMute?.();
      const vol = Number(ui.volume.value);
      if (vol > 0) yt.setVolume?.(vol);
    } catch {
      /* ignore */
    }

    captionsBooted = true;
    ui.muteBtn.innerHTML = ICONS.volume;
    ui.muteBtn.setAttribute('aria-label', 'השתק');
    unlockPlayback('מוכן לצפייה');
  };

  const startCaptionWarmup = () => {
    if (captionWarmupStarted || !playerReady || !yt) return;
    captionWarmupStarted = true;
    ui.waitText.textContent = 'מכין את הנגן…';
    try {
      yt.mute?.();
      yt.playVideo?.();
    } catch {
      unlockPlayback('מוכן לצפייה');
    }
    window.setTimeout(() => {
      if (!playbackUnlocked) void finishCaptionWarmup();
    }, 25000);
  };

  const setPausedUi = (paused: boolean) => {
    ui.shell.classList.toggle('scp-paused', paused);
    ui.playBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
    ui.playBtn.setAttribute('aria-label', paused ? 'נגן' : 'השהה');
  };

  const setUiVisible = (visible: boolean) => {
    ui.shell.classList.toggle('scp-ui-visible', visible);
    ui.shell.classList.toggle('scp-ui-hidden', !visible && isPlaying && menuPanel === 'root');
  };

  const showUiTemporarily = () => {
    setUiVisible(true);
    if (uiHideTimer) clearTimeout(uiHideTimer);
    uiHideTimer = null;
    if (!isPlaying || ui.shell.classList.contains('scp-menu-open')) return;
    uiHideTimer = setTimeout(() => {
      setUiVisible(false);
      uiHideTimer = null;
    }, hideMs);
  };

  const syncProgress = () => {
    if (!playerReady || !yt || seeking) return;
    try {
      const t = yt.getCurrentTime?.() || 0;
      const d = yt.getDuration?.() || duration || 0;
      duration = d;
      const pct = d > 0 ? (t / d) * 1000 : 0;
      ui.seek.value = String(Math.round(pct));
      ui.fill.style.width = `${Math.min(100, pct / 10)}%`;
      ui.timeEl.textContent = formatTime(t);
      if (d > 0 && t > d - 8) clearProgress(target.videoId, lessonId);
      else saveProgress(target.videoId, lessonId, t);
    } catch {
      /* player not ready */
    }
  };

  const safePlay = () => {
    if (!playerReady || !yt) return;
    try {
      yt.playVideo?.();
    } catch {
      /* ignore */
    }
  };

  const safePause = () => {
    if (!playerReady || !yt) return;
    try {
      yt.pauseVideo?.();
    } catch {
      /* ignore */
    }
  };

  const resumeAt = resolveResume(target.videoId, lessonId, schoolerSeek, 0);

  const togglePlay = () => {
    if (!playerReady || !yt || !playbackUnlocked) return;
    try {
      const state = yt.getPlayerState?.();
      if (state === 1) safePause();
      else safePlay();
    } catch {
      safePlay();
    }
  };

  const toggleMute = () => {
    if (!playerReady || !yt) return;
    try {
      if (yt.isMuted?.()) {
        yt.unMute?.();
        ui.muteBtn.innerHTML = ICONS.volume;
        ui.muteBtn.setAttribute('aria-label', 'השתק');
      } else {
        yt.mute?.();
        ui.muteBtn.innerHTML = ICONS.mute;
        ui.muteBtn.setAttribute('aria-label', 'בטל השתקה');
      }
    } catch {
      /* ignore */
    }
  };

  const toggleFullscreen = () => {
    const el = ui.shell;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
    };
    const active = document.fullscreenElement || doc.webkitFullscreenElement;
    if (active === el) {
      if (document.exitFullscreen) void document.exitFullscreen();
      else doc.webkitExitFullscreen?.();
      ui.fsBtn.innerHTML = ICONS.fullscreen;
      return;
    }
    const req =
      el.requestFullscreen?.bind(el) ||
      (el as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen?.bind(el);
    void req?.();
    ui.fsBtn.innerHTML = ICONS.exitFs;
  };

  const closeMenu = () => {
    menuPanel = 'root';
    ui.shell.classList.remove('scp-menu-open');
    ui.menuBack.classList.remove('is-visible');
    ui.menuTitle.textContent = 'הגדרות';
    renderMenu();
  };

  const openMenu = () => {
    if (!playbackUnlocked) return;
    ui.shell.classList.add('scp-menu-open');
    setUiVisible(true);
    if (uiHideTimer) clearTimeout(uiHideTimer);
    renderMenu();
  };

  const makeMenuItem = (
    title: string,
    opts: { value?: string; checked?: boolean; onClick: () => void },
  ): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scp-menu-item';
    btn.setAttribute('role', 'menuitemradio');
    btn.setAttribute('aria-checked', String(Boolean(opts.checked)));
    const label = document.createElement('span');
    label.textContent = title;
    btn.appendChild(label);
    if (opts.value !== undefined) {
      const val = document.createElement('span');
      val.className = 'scp-menu-value';
      val.textContent = opts.value;
      btn.appendChild(val);
    } else {
      const dot = document.createElement('span');
      dot.className = 'scp-dot';
      btn.appendChild(dot);
    }
    btn.addEventListener('click', (e) => {
      blockEvent(e);
      opts.onClick();
    });
    return btn;
  };

  const renderMenu = () => {
    ui.menuList.innerHTML = '';
    if (menuPanel === 'root') {
      ui.menuBack.classList.remove('is-visible');
      ui.menuTitle.textContent = 'הגדרות';
      ui.menuList.appendChild(
        makeMenuItem('כתוביות', {
          value: captionState.enabled ? captionLabel(captionState.lang) : 'כבוי',
          onClick: () => {
            menuPanel = 'captions';
            renderMenu();
          },
        }),
      );
      ui.menuList.appendChild(
        makeMenuItem('מהירות', {
          value: speedLabel(currentSpeed),
          onClick: () => {
            menuPanel = 'speed';
            renderMenu();
          },
        }),
      );
      ui.menuList.appendChild(
        makeMenuItem('איכות', {
          value: 'אוטומטי',
          onClick: () => {
            menuPanel = 'quality';
            renderMenu();
          },
        }),
      );
      return;
    }

    ui.menuBack.classList.add('is-visible');
    if (menuPanel === 'captions') {
      ui.menuTitle.textContent = 'כתוביות';
      ui.menuList.appendChild(
        makeMenuItem('כבוי', {
          checked: !captionState.enabled,
          onClick: () => {
            captionState.enabled = false;
            captionState.pendingLang = '';
            captionState.nativeMode = false;
            captionsBooted = true;
            void disableYouTubeNativeCaptions(handle);
            closeMenu();
          },
        }),
      );
      CAPTION_LANGS.forEach((lang) => {
        const loading = captionState.loadingLang === lang.value;
        ui.menuList.appendChild(
          makeMenuItem(loading ? `${lang.label}…` : lang.label, {
            checked: captionState.enabled && captionState.lang === lang.value,
            onClick: () => {
              captionState.selectLang(lang.value);
              closeMenu();
            },
          }),
        );
      });
      return;
    }

    if (menuPanel === 'speed') {
      ui.menuTitle.textContent = 'מהירות';
      const rates =
        yt?.getAvailablePlaybackRates?.()?.filter((r) => typeof r === 'number') || SPEED_OPTIONS;
      const list = rates.length ? rates : SPEED_OPTIONS;
      list.forEach((rate) => {
        ui.menuList.appendChild(
          makeMenuItem(speedLabel(rate), {
            checked: Math.abs(currentSpeed - rate) < 0.001,
            onClick: () => {
              currentSpeed = rate;
              yt?.setPlaybackRate?.(rate);
              closeMenu();
            },
          }),
        );
      });
      return;
    }

    ui.menuTitle.textContent = 'איכות';
    ui.menuList.appendChild(
      makeMenuItem('אוטומטי', {
        checked: true,
        onClick: () => closeMenu(),
      }),
    );
  };

  captionState.loadForLang = async (lang: string) => {
    if (switchingCaptions) return;
    switchingCaptions = true;
    captionState.enabled = true;
    captionState.lang = lang;
    captionState.loadingLang = lang;
    captionState.pendingLang = '';
    renderMenu();

    try {
      if (!playerReady || !handle || !hasYouTubePlaybackStarted(handle.embed)) {
        captionState.pendingLang = lang;
        captionState.loadingLang = '';
        renderMenu();
        return;
      }

      const native = await enableNativeYouTubeCaptions(handle, {
        targetLang: lang,
        sourceLang: 'auto',
      });

      captionState.nativeMode = native.ok;
      captionState.loadingLang = '';
      captionsBooted = true;

      if (native.needsPlayback) {
        captionState.pendingLang = lang;
      }

      renderMenu();
    } catch {
      captionState.loadingLang = '';
      captionsBooted = true;
      renderMenu();
    } finally {
      switchingCaptions = false;
    }
  };

  captionState.selectLang = (lang: string) => {
    void captionState.loadForLang(lang);
  };

  ui.playBtn.addEventListener('click', (e) => {
    blockEvent(e);
    togglePlay();
  });
  ui.playLarge.addEventListener('click', (e) => {
    blockEvent(e);
    togglePlay();
  });
  ui.clickLayer.addEventListener('click', () => {
    if (ui.shell.classList.contains('scp-menu-open')) {
      closeMenu();
      return;
    }
    togglePlay();
  });
  ui.muteBtn.addEventListener('click', (e) => {
    blockEvent(e);
    toggleMute();
  });
  ui.fsBtn.addEventListener('click', (e) => {
    blockEvent(e);
    toggleFullscreen();
  });
  ui.settingsBtn.addEventListener('click', (e) => {
    blockEvent(e);
    if (ui.shell.classList.contains('scp-menu-open')) closeMenu();
    else openMenu();
  });
  ui.menuBack.addEventListener('click', (e) => {
    blockEvent(e);
    menuPanel = 'root';
    renderMenu();
  });
  ui.menu.addEventListener('click', (e) => e.stopPropagation());
  ui.controls.addEventListener('click', (e) => e.stopPropagation());

  ui.seek.addEventListener('pointerdown', () => {
    seeking = true;
  });
  ui.seek.addEventListener('input', () => {
    const d = duration || yt?.getDuration?.() || 0;
    const pct = Number(ui.seek.value) / 1000;
    ui.fill.style.width = `${pct * 100}%`;
    ui.timeEl.textContent = formatTime(d * pct);
  });
  const commitSeek = () => {
    if (!playerReady || !yt) {
      seeking = false;
      return;
    }
    const d = duration || 0;
    try {
      const live = yt.getDuration?.();
      if (live) duration = live;
    } catch {
      /* ignore */
    }
    const pct = Number(ui.seek.value) / 1000;
    const total = duration || 0;
    if (total > 0) {
      try {
        yt.seekTo?.(total * pct, true);
      } catch {
        /* ignore */
      }
    }
    seeking = false;
    showUiTemporarily();
  };
  ui.seek.addEventListener('change', commitSeek);
  ui.seek.addEventListener('pointerup', commitSeek);

  ui.volume.addEventListener('input', () => {
    if (!playerReady || !yt) return;
    const v = Number(ui.volume.value);
    try {
      yt.setVolume?.(v);
      if (v <= 0) {
        yt.mute?.();
        ui.muteBtn.innerHTML = ICONS.mute;
      } else {
        yt.unMute?.();
        ui.muteBtn.innerHTML = ICONS.volume;
      }
    } catch {
      /* ignore */
    }
  });

  let moveRaf = 0;
  ui.shell.addEventListener(
    'mousemove',
    () => {
      if (moveRaf) return;
      moveRaf = requestAnimationFrame(() => {
        moveRaf = 0;
        showUiTemporarily();
      });
    },
    { passive: true },
  );
  ui.shell.addEventListener('touchstart', () => showUiTemporarily(), { passive: true });
  ui.shell.addEventListener('contextmenu', blockEvent);

  document.addEventListener('fullscreenchange', () => {
    const active = document.fullscreenElement === ui.shell;
    ui.fsBtn.innerHTML = active ? ICONS.exitFs : ICONS.fullscreen;
  });

  const onStateChange = (event: { data: number; target: YoutubeEmbedApi }) => {
    if (!playerReady) return;
    yt = event.target;
    handle = { embed: yt };
    const state = event.data;

    if (!playbackUnlocked) {
      if (captionWarmupDone) return;
      if (state === 1 || state === 3 || (state === 2 && captionWarmupStarted)) {
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
        captionState.pendingLang = '';
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
        saveProgress(target.videoId, lessonId, yt.getCurrentTime?.() || 0);
      } catch {
        /* ignore */
      }
    } else if (state === 0) {
      isPlaying = false;
      setPausedUi(true);
      setUiVisible(true);
      clearProgress(target.videoId, lessonId);
    }
  };

  void loadYouTubeApi()
    .then(() => {
      if (!window.YT?.Player) {
        unlockPlayback('מוכן לצפייה');
        return;
      }
      const origin = window.location.origin;
      const playerVars: Record<string, string | number> = {
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
        origin,
      };
      if (resumeAt > 0) playerVars.start = Math.floor(resumeAt);

      yt = new window.YT.Player(ui.mountEl.id, {
        videoId: target.videoId,
        width: '100%',
        height: '100%',
        host: 'https://www.youtube.com',
        playerVars,
        events: {
          onReady: (event) => {
            yt = event.target;
            handle = { embed: yt };
            playerReady = true;
            try {
              duration = yt.getDuration?.() || 0;
              currentSpeed = yt.getPlaybackRate?.() || 1;
            } catch {
              /* ignore */
            }
            setPausedUi(true);
            setUiVisible(false);
            renderMenu();

            const iframe = ui.surface.querySelector('iframe');
            if (iframe) {
              iframe.style.pointerEvents = 'none';
              iframe.setAttribute('tabindex', '-1');
              iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
            }

            if (!progressTimer) {
              progressTimer = window.setInterval(syncProgress, 400);
            }

            ui.waitText.textContent = 'טוען כתוביות…';
            startCaptionWarmup();
          },
          onStateChange,
          onApiChange: () => {
            if (!playerReady || !handle) return;
            if (!playbackUnlocked && captionWarmupStarted && !captionWarmupDone) {
              void finishCaptionWarmup();
              return;
            }
            if (
              playbackUnlocked &&
              captionState.enabled &&
              captionState.pendingLang &&
              !switchingCaptions &&
              isPlaying
            ) {
              const pending = captionState.pendingLang;
              captionState.pendingLang = '';
              void captionState.loadForLang(pending);
            }
          },
          onError: () => {
            playerReady = true;
            unlockPlayback('מוכן לצפייה');
          },
        },
      });
      handle = { embed: yt };
    })
    .catch(() => {
      unlockPlayback('מוכן לצפייה');
    });
}

function scan(): void {
  mount(findTarget(readLesson()));
}

function boot(): void {
  if (window.__SchoolerPlayerBooted) return;
  window.__SchoolerPlayerBooted = true;
  ensureStyles();
  scan();
  let n = 0;
  const timer = setInterval(() => {
    scan();
    if (++n > 60) clearInterval(timer);
  }, 500);
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => scan()).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
