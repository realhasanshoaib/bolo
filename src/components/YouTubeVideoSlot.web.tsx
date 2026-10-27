import { createElement, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { loadYouTubeIframeAPI, type WebYouTubePlayer } from '../lib/youtubeIframe.web';
import type { YouTubeVideoSlotProps } from './YouTubeVideoSlot';

export function YouTubeVideoSlot(props: YouTubeVideoSlotProps) {
  const { colors, videoId, playing, playbackRate, seekRequestMs, seekRequestSequence } = props;
  const callbacks = useRef(props);
  callbacks.current = props;
  const host = useRef<HTMLDivElement | null>(null);
  const player = useRef<WebYouTubePlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { height, width } = useWindowDimensions();
  const landscape = width > height;
  const playerWidth = Math.round(landscape ? width * (1.3 / 2.3) : width);
  const playerHeight = Math.max(200, Math.round(playerWidth * 9 / 16));
  const size = useRef({ width: playerWidth, height: playerHeight });
  size.current = { width: playerWidth, height: playerHeight };

  useEffect(() => {
    let cancelled = false;
    let instance: WebYouTubePlayer | null = null;
    void loadYouTubeIframeAPI().then((api) => {
      if (cancelled || !host.current) return;
      const element = document.createElement('div');
      host.current.replaceChildren(element);
      instance = new api.Player(element, {
        ...size.current, videoId,
        playerVars: { controls: 1, rel: 0, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: ({ target }) => {
            if (cancelled) return;
            player.current = target;
            callbacks.current.onDurationChange(target.getDuration() * 1000);
            callbacks.current.onPlaybackRatesChange(target.getAvailablePlaybackRates());
            setReady(true);
            callbacks.current.onReadyChange(true);
          },
          onStateChange: ({ data }) => {
            if (cancelled) return;
            if (data === 1) callbacks.current.onPlayingChange(true);
            if (data === 0 || data === 2) callbacks.current.onPlayingChange(false);
            if (data === 0) callbacks.current.onTimeChange(0);
            else if (data === 2 && player.current) callbacks.current.onTimeChange(player.current.getCurrentTime() * 1000);
          },
          onPlaybackRateChange: ({ data }) => { if (!cancelled) callbacks.current.onPlaybackRateChange(data); },
          onError: () => {
            if (cancelled) return;
            setError('This video could not play. Try opening it in YouTube or choose another video.');
            callbacks.current.onPlayingChange(false);
            callbacks.current.onReadyChange(false);
          },
          onAutoplayBlocked: () => { if (!cancelled) callbacks.current.onPlayingChange(false); },
        },
      });
    }).catch((loadError: unknown) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'The video player could not load.');
    });
    return () => { cancelled = true; instance?.destroy(); player.current = null; };
  }, [videoId]);

  useEffect(() => { if (ready) player.current?.setSize(playerWidth, playerHeight); }, [ready, playerWidth, playerHeight]);
  useEffect(() => {
    if (!ready) return;
    if (playing) player.current?.playVideo();
    else player.current?.pauseVideo();
  }, [playing, ready]);
  useEffect(() => { if (ready) player.current?.setPlaybackRate(playbackRate); }, [playbackRate, ready]);
  useEffect(() => {
    if (ready && seekRequestMs !== null) player.current?.seekTo(seekRequestMs / 1000, true);
  }, [ready, seekRequestMs, seekRequestSequence]);
  useEffect(() => {
    if (!ready || !playing) return;
    const interval = setInterval(() => {
      if (player.current) callbacks.current.onTimeChange(player.current.getCurrentTime() * 1000);
    }, 500);
    return () => clearInterval(interval);
  }, [ready, playing]);

  return <View style={[styles.container, { backgroundColor: colors.backgroundAccent, height: playerHeight, width: playerWidth }]}>
    {createElement('div', { ref: host, style: { width: '100%', height: '100%' } })}
    {error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.text, backgroundColor: colors.backgroundAccent }]}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  error: { position: 'absolute', top: 0, left: 0, right: 0, padding: 20, fontSize: 18 },
});
