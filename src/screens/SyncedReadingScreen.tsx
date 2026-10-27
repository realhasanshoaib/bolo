import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Doc } from '../../convex/_generated/dataModel';
import { SyncedVideoPlayer, type ReaderColors } from '../components/SyncedVideoPlayer';
import { findActiveSentence } from '../lib/readerPlayback';
import { YouTubeVideoSlot } from '../components/YouTubeVideoSlot';
import type { DisplayTranscriptSegment } from '../lib/syncedTranscript';
import { getFriendlyFailureCopy } from '../lib/reader';
import { readPlaybackPosition, readingFontSizes, savePlaybackPosition } from '../lib/readingPreferences';

export function SyncedReadingScreen({ entry, segments, colors, fontSize, focusMode,
  onFontSizeChange, onFocusModeChange, onBack, onFavorite, onRetry }: {
  entry: Doc<'entries'>; segments: DisplayTranscriptSegment[]; colors: ReaderColors;
  fontSize: number; focusMode: boolean; onFontSizeChange: (size: number) => void;
  onFocusModeChange: (focus: boolean) => void; onBack: () => void;
  onFavorite: () => void; onRetry: () => void;
}) {
  const [initialPosition, setInitialPosition] = useState<number | null>(null);
  const [activeMs, setActiveMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [requestedRate, setRequestedRate] = useState(1);
  const [availableRates, setAvailableRates] = useState<number[]>([]);
  const [seekRequest, setSeekRequest] = useState({ timeMs: 0, sequence: 0 });
  const position = useRef(0);
  const restored = useRef(false);
  const reportedSaveFailure = useRef(false);
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    void readPlaybackPosition(entry._id).then((savedMs) => {
      if (cancelled) return;
      position.current = savedMs;
      setActiveMs(savedMs);
      setSeekRequest({ timeMs: savedMs, sequence: 0 });
      setInitialPosition(savedMs);
      restored.current = true;
    });
    const persist = () => {
      if (!restored.current) return;
      const savedMs = position.current;
      saveQueue.current = saveQueue.current.then(() => savePlaybackPosition(entry._id, savedMs)).catch(() => {
        if (reportedSaveFailure.current) return;
        reportedSaveFailure.current = true;
        Alert.alert('Could not save your place', 'You can keep watching, but this device may not remember where you stopped.');
      });
    };
    const interval = setInterval(persist, 5000);
    const appState = AppState.addEventListener('change', (state) => { if (state !== 'active') persist(); });
    return () => { cancelled = true; clearInterval(interval); appState.remove(); persist(); };
  }, [entry._id]);

  const onTimeChange = useCallback((timeMs: number) => {
    position.current = timeMs;
    setActiveMs(timeMs);
  }, []);
  const onSeek = useCallback((timeMs: number) => {
    const boundedMs = Math.max(0, Math.min(timeMs, durationMs || timeMs));
    position.current = boundedMs;
    setActiveMs(boundedMs);
    setSeekRequest((previous) => ({ timeMs: boundedMs, sequence: previous.sequence + 1 }));
  }, [durationMs]);
  const onPlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    setRequestedRate(rate);
  }, []);
  const slowerRate = [...availableRates].filter((rate) => rate < 1).sort((a, b) => a - b).at(-1);
  const onError = useCallback((message: string) => Alert.alert('Video problem', message), []);
  const failure = getFriendlyFailureCopy(entry.errorMessage);
  const processing = entry.status === 'queued' || entry.status === 'processing';
  const activeIndex = findActiveSentence(segments, activeMs);
  const changeTextSize = (direction: number) => {
    const index = readingFontSizes.findIndex((size) => size === fontSize);
    const nextSize = readingFontSizes[Math.max(0, Math.min(readingFontSizes.length - 1, index + direction))];
    onFontSizeChange(nextSize);
  };
  const button = (label: string, action: () => void, disabled = false, accessibilityLabel = label) => (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }}
      disabled={disabled} onPress={action}
      style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.45 : 1 }]}>
      <Text style={{ color: colors.text, fontSize: 18, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
  const failureContent = (
    <View style={styles.status}>
      <Text style={{ color: colors.danger, fontSize: 20 }}>{failure.title}</Text>
      <Text style={{ color: colors.text, fontSize: 18 }}>{failure.body}</Text>
      {button('Try again', onRetry)}
    </View>
  );

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <SyncedVideoPlayer activeMs={activeMs} colors={colors} segments={segments} onSeek={onSeek}
        fontSize={fontSize} focusMode={focusMode}
        topLeftControls={button('Back', onBack)}
        topRightControls={button(entry.favorite ? '★ Saved' : '☆ Save', onFavorite)}
        videoSlot={initialPosition === null ? <ActivityIndicator style={styles.loading} /> :
          <YouTubeVideoSlot colors={colors} videoId={entry.videoId} onDurationChange={setDurationMs}
            onError={onError} onPlayingChange={setPlaying} onTimeChange={onTimeChange}
            seekRequestMs={seekRequest.timeMs} seekRequestSequence={seekRequest.sequence}
            playing={playing} playbackRate={requestedRate} onPlaybackRateChange={onPlaybackRateChange}
            onPlaybackRatesChange={setAvailableRates} onReadyChange={setPlayerReady} />}
        readingControls={
          <View style={styles.controls}>
            <View style={styles.row}>
              {button(playing ? 'Pause' : 'Play', () => setPlaying(!playing), !playerReady)}
              {button('Replay sentence', () => { onSeek(segments[activeIndex]?.startMs ?? 0); setPlaying(true); }, activeIndex < 0 || !playerReady)}
              {button(playbackRate < 1 ? 'Normal speed' : 'Slower', () => setRequestedRate(playbackRate < 1 ? 1 : slowerRate ?? 1), slowerRate === undefined)}
            </View>
            <View style={styles.row}>
              {button('A−', () => changeTextSize(-1), fontSize === readingFontSizes[0], 'Smaller translation text')}
              {button('A+', () => changeTextSize(1), fontSize === readingFontSizes.at(-1), 'Larger translation text')}
              {button(focusMode ? 'All sentences' : 'Focus reading', () => onFocusModeChange(!focusMode))}
            </View>
          </View>
        }
        statusContent={segments.length > 0 ? (entry.status === 'failed' ? failureContent : processing &&
          <Text accessibilityLiveRegion="polite" style={[styles.progress, { color: colors.textSoft }]}>You can start reading. The rest is on its way…</Text>) : null}
        emptyTranscriptContent={entry.status === 'failed' ? failureContent :
          <View style={styles.status}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text accessibilityLiveRegion="polite" style={{ color: colors.text, fontSize: 22 }}>Getting your video ready</Text>
            <Text style={{ color: colors.textSoft, fontSize: 18 }}>The first translated sentences will appear here.</Text>
          </View>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { height: 180 },
  controls: { paddingHorizontal: 8, paddingTop: 4, gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderRadius: 12, justifyContent: 'center', flexShrink: 1 },
  status: { padding: 20, gap: 12, alignItems: 'center', flexShrink: 1 },
  progress: { fontSize: 16, paddingHorizontal: 16, paddingTop: 8 },
});
