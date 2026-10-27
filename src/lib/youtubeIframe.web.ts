export interface WebYouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getAvailablePlaybackRates(): number[];
  setSize(width: number, height: number): void;
  destroy(): void;
}

interface YouTubeIframeAPI {
  Player: new (element: HTMLElement, options: {
    width: number; height: number; videoId: string;
    playerVars: { controls: number; rel: number; playsinline: number; origin: string };
    events: {
      onReady(event: { target: WebYouTubePlayer }): void;
      onStateChange(event: { data: number }): void;
      onPlaybackRateChange(event: { data: number }): void;
      onError(event: { data: number }): void;
      onAutoplayBlocked(): void;
    };
  }) => WebYouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeIframeAPI;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeIframeAPI> | undefined;

export function loadYouTubeIframeAPI(): Promise<YouTubeIframeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeIframeAPI>((resolve, reject) => {
    const script = document.createElement('script');
    const previousReady = window.onYouTubeIframeAPIReady;
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      window.onYouTubeIframeAPIReady = previousReady;
      apiPromise = undefined;
      reject(new Error('The video player could not load. Check your connection and reopen the video.'));
    };
    const timeout = setTimeout(fail, 20_000);
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (!window.YT) { fail(); return; }
      clearTimeout(timeout);
      window.onYouTubeIframeAPIReady = previousReady;
      resolve(window.YT);
    };
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return apiPromise;
}
