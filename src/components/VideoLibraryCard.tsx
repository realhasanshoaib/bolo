import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Doc } from '../../convex/_generated/dataModel';
import { getYouTubeThumbnailUrl } from '../lib/youtube';
import type { ReaderColors } from './SyncedVideoPlayer';

export function VideoLibraryCard({ entry, colors, continuing = false, onOpen, onFavorite }: {
  entry: Doc<'entries'>; colors: ReaderColors; continuing?: boolean;
  onOpen: (entry: Doc<'entries'>) => void; onFavorite?: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const action = entry.status === 'failed' ? 'Try again' : continuing ? 'Continue' : 'Watch';
  const preparing = entry.status === 'queued' || entry.status === 'processing';
  return <View style={[styles.card, { backgroundColor: colors.surface }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${preparing ? 'Open' : action}: ${entry.title}`}
      onPress={() => onOpen(entry)} style={({ pressed }) => [styles.open, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.content}>
        <View style={[styles.thumbnail, { backgroundColor: colors.backgroundAccent }]}>
          <Text style={{ color: colors.textSoft, fontSize: 16 }}>Video</Text>
          {!imageFailed && <Image accessible={false} source={{ uri: entry.thumbnailUrl || getYouTubeThumbnailUrl(entry.videoId) }}
            onError={() => setImageFailed(true)} style={StyleSheet.absoluteFill} />}
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text }]}>{entry.title}</Text>
          {!!entry.channelTitle && <Text style={[styles.channel, { color: colors.textSoft }]}>{entry.channelTitle}</Text>}
        </View>
      </View>
      <Text style={[styles.action, { color: entry.status === 'failed' ? colors.danger : colors.accent }]}>
        {preparing ? 'Preparing your translation…' : action}
      </Text>
    </Pressable>
    {onFavorite && <Pressable accessibilityRole="button" accessibilityLabel={`${entry.favorite ? 'Remove from' : 'Add to'} favorites: ${entry.title}`}
      accessibilityState={{ selected: entry.favorite }} onPress={onFavorite}
      style={({ pressed }) => [styles.favorite, { backgroundColor: colors.backgroundAccent, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={{ fontSize: 17, color: colors.text }}>{entry.favorite ? '★ Favorited' : '☆ Favorite'}</Text>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden', marginBottom: 16 },
  open: { padding: 16, gap: 16 },
  content: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  thumbnail: { width: 96, height: 72, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 6 },
  title: { fontSize: 21, lineHeight: 29, fontWeight: '600' },
  channel: { fontSize: 16, lineHeight: 23 },
  action: { fontSize: 20, fontWeight: '600' },
  favorite: { minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 12 },
});
