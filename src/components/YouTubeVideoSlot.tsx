import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import YoutubePlayer, {
  PLAYER_STATES,
  type YoutubeIframeRef,
} from 'react-native-youtube-iframe';

export type YouTubeVideoSlotProps = {
  colors: {
    backgroundAccent: string;
    border: string;
    danger: string;
    text: string;
    textSoft: string;
  };
  onDurationChange: (durationMs: number) => void;
  onError: (message: string) => void;
  onPlayingChange: (playing: boolean) => void;
  onTimeChange: (timeMs: number) => void;
  seekRequestMs: number | null;
  videoId: string;
  seekRequestSequence: number;
  playing: boolean;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  onPlaybackRatesChange: (rates: number[]) => void;
  onReadyChange: (ready: boolean) => void;
};

export function YouTubeVideoSlot({
  colors,
  onDurationChange,
  onError,
  onPlayingChange,
  onTimeChange,
  seekRequestMs,
  videoId,
  seekRequestSequence,
  playing,
  playbackRate,
  onPlaybackRateChange,
  onPlaybackRatesChange,
  onReadyChange,
}: YouTubeVideoSlotProps) {
  const playerRef = useRef<YoutubeIframeRef | null>(null);
  const { height, width } = useWindowDimensions();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const landscape = width > height;
  const landscapeLeftPaneWidth = width * (1.3 / 2.3);
  const playerWidth = Math.round(
    landscape ? Math.min(landscapeLeftPaneWidth, height * 16 / 9) : width,
  );
  const playerHeight = Math.round(playerWidth * 9 / 16);

  useEffect(() => {
    if (!ready || seekRequestMs === null) {
      return;
    }

    playerRef.current?.seekTo(seekRequestMs / 1000, true);
  }, [ready, seekRequestMs, seekRequestSequence]);

  useEffect(() => {
    if (!ready || !playing) {
      return;
    }
    let cancelled = false;
    const interval = setInterval(() => {
      void playerRef.current?.getCurrentTime().then((seconds) => {
        if (!cancelled) onTimeChange(Math.round(seconds * 1000));
      }).catch(() => {
        if (cancelled) return;
        setReady(false);
        onReadyChange(false);
        setError('We could not follow the video position. Please reopen the video.');
        onError('We could not follow the video position. Please reopen the video.');
      });
    }, 500);

    return () => { cancelled = true; clearInterval(interval); };
  }, [onTimeChange, onError, ready, playing, onReadyChange]);

  return (
    <View style={styles.container}>
      <YoutubePlayer
        height={playerHeight}
        play={playing}
        playbackRate={playbackRate}
        onPlaybackRateChange={onPlaybackRateChange}
        initialPlayerParams={{
          controls: true,
          preventFullScreen: true,
          rel: false,
        }}
        onChangeState={(state: PLAYER_STATES) => {
          if (state === PLAYER_STATES.PLAYING) {
            onPlayingChange(true);
          } else if (state === PLAYER_STATES.PAUSED || state === PLAYER_STATES.ENDED) {
            onPlayingChange(false);
            if (state === PLAYER_STATES.ENDED) onTimeChange(0);
            else void playerRef.current?.getCurrentTime().then((seconds) => onTimeChange(seconds * 1000))
              .catch(() => onError('We could not save the paused position. Please reopen the video.'));
          }
        }}
        onError={() => {
          const message = 'This video could not play. Try opening it in YouTube or choose another video.';
          setError(message);
          onReadyChange(false);
          onPlayingChange(false);
          onError(message);
        }}
        onReady={() => {
          setReady(true);
          onReadyChange(true);
          setError(null);
          void playerRef.current?.getDuration().then((seconds) => {
            onDurationChange(Math.round(seconds * 1000));
          }).catch(() => onError('We could not read the video length. Please reopen the video.'));
          void playerRef.current?.getAvailablePlaybackRates().then(onPlaybackRatesChange)
            .catch(() => onError('Slower playback is unavailable for this video.'));
        }}
        ref={playerRef}
        videoId={videoId}
        webViewStyle={[styles.webView, { backgroundColor: colors.backgroundAccent }]}
        width={playerWidth}
      />
      {!ready || error ? (
        <View
          pointerEvents="none"
          style={[
            styles.statusOverlay,
            {
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.statusText, { color: error ? colors.danger : colors.textSoft }]}>
            {error ?? 'Loading video...'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  statusOverlay: {
    alignItems: 'center',
    borderWidth: 2,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '900',
  },
  webView: {
    opacity: 0.99,
  },
});
