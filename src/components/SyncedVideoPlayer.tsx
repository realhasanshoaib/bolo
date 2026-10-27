import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { DisplayTranscriptSegment } from '../lib/syncedTranscript';
import { findActiveSentence } from '../lib/readerPlayback';
import { ScrollInteractionBoundary } from './ScrollInteractionBoundary';
import type { palette } from '../constants/theme';

export type ReaderColors = (typeof palette)['light'] | (typeof palette)['dark'];

const Sentence = memo(function Sentence({ segment, active, colors, fontSize, onSeek }: {
  segment: DisplayTranscriptSegment; active: boolean; colors: ReaderColors;
  fontSize: number; onSeek: (timeMs: number) => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={segment.translatedText || segment.originalText}
      accessibilityHint="Play this sentence" accessibilityState={{ selected: active }}
      onPress={() => onSeek(segment.startMs)}
      style={[styles.sentence, { backgroundColor: active ? colors.backgroundAccent : colors.background,
        borderLeftColor: active ? colors.accent : 'transparent' }]}>
      <Text style={{ color: colors.text, fontSize, lineHeight: Math.round(fontSize * 1.55),
        fontWeight: active ? '600' : '400', writingDirection: 'auto' }}>
        {segment.translatedText || segment.originalText}
      </Text>
    </Pressable>
  );
});

const Transcript = memo(function Transcript({ activeIndex, colors, fontSize, focusMode, segments, onSeek }: {
  activeIndex: number; colors: ReaderColors; fontSize: number; focusMode: boolean;
  segments: DisplayTranscriptSegment[]; onSeek: (timeMs: number) => void;
}) {
  const list = useRef<FlatList<DisplayTranscriptSegment>>(null);
  const [following, setFollowing] = useState(true);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const targetIndex = useRef(activeIndex);
  targetIndex.current = activeIndex;
  const follow = useCallback(() => {
    if (targetIndex.current >= 0) list.current?.scrollToIndex({ index: targetIndex.current, viewPosition: 0.2, animated: true });
  }, []);

  useEffect(() => {
    retryCount.current = 0;
    if (following && !focusMode) follow();
    return () => { if (retry.current) clearTimeout(retry.current); };
  }, [activeIndex, following, focusMode, fontSize, follow]);

  const renderItem = useCallback(({ item, index }: { item: DisplayTranscriptSegment; index: number }) => (
    <Sentence segment={item} active={index === activeIndex} colors={colors} fontSize={fontSize} onSeek={onSeek} />
  ), [activeIndex, colors, fontSize, onSeek]);

  if (focusMode) {
    const current = segments[activeIndex];
    return (
      <FlatList key={`focus-${current?.index ?? 'waiting'}`} data={current ? segments.slice(activeIndex, activeIndex + 2) : segments.slice(0, 1)}
        keyExtractor={(segment) => String(segment.index)}
        renderItem={({ item }) => <Sentence segment={item} active={item.index === current?.index}
          colors={colors} fontSize={fontSize} onSeek={onSeek} />}
        contentContainerStyle={styles.transcript} />
    );
  }

  return (
    <ScrollInteractionBoundary onManualScroll={() => {
      setFollowing(false);
      if (retry.current) clearTimeout(retry.current);
    }}>
    <View style={styles.fill}>
      <FlatList ref={list} data={segments} renderItem={renderItem} extraData={activeIndex}
        keyExtractor={(segment) => String(segment.index)} contentContainerStyle={styles.transcript}
        initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
        onScrollBeginDrag={() => {
          setFollowing(false);
          if (retry.current) clearTimeout(retry.current);
        }}
        onScrollToIndexFailed={({ averageItemLength, index }) => {
          // Move the render window near an unmeasured row, then seek its measured
          // layout. Never treat a fixed sentence height as the final position.
          if (!following) return;
          if (retryCount.current >= 3) { setFollowing(false); return; }
          retryCount.current += 1;
          list.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
          retry.current = setTimeout(follow, 150);
        }} />
      {!following && <Pressable accessibilityRole="button" onPress={() => setFollowing(true)}
        style={[styles.followButton, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
        <Text style={{ color: colors.text, fontSize: 18 }}>Follow video</Text>
      </Pressable>}
    </View>
    </ScrollInteractionBoundary>
  );
});

export function SyncedVideoPlayer({ activeMs, colors, emptyTranscriptContent, onSeek, segments,
  topLeftControls, topRightControls, videoSlot, fontSize, focusMode, readingControls, statusContent }: {
  activeMs: number; colors: ReaderColors; emptyTranscriptContent?: React.ReactNode;
  onSeek: (timeMs: number) => void; segments: DisplayTranscriptSegment[];
  topLeftControls?: React.ReactNode; topRightControls?: React.ReactNode; videoSlot?: React.ReactNode;
  fontSize: number; focusMode: boolean; readingControls: React.ReactNode; statusContent?: React.ReactNode;
}) {
  const { height, width } = useWindowDimensions();
  const landscape = width > height;
  const activeIndex = findActiveSentence(segments, activeMs);
  const transcript = segments.length ? <Transcript activeIndex={activeIndex} colors={colors} fontSize={fontSize}
    focusMode={focusMode} segments={segments} onSeek={onSeek} /> : emptyTranscriptContent ?? <ActivityIndicator />;
  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>{topLeftControls}{topRightControls}</View>
      <View style={[styles.fill, landscape && styles.landscape]}>
        <View style={landscape ? styles.videoLandscape : undefined}>{videoSlot}</View>
        <View style={styles.fill}>
          {readingControls}
          {statusContent}
          {transcript}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0, minWidth: 0 },
  landscape: { flexDirection: 'row' },
  videoLandscape: { flex: 1.3, justifyContent: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 4 },
  transcript: { paddingVertical: 12, paddingBottom: 32 },
  sentence: { paddingHorizontal: 16, paddingVertical: 12, borderLeftWidth: 4, minHeight: 52 },
  followButton: { alignSelf: 'center', borderWidth: 1, borderRadius: 14, padding: 14, margin: 8, minHeight: 48 },
});
