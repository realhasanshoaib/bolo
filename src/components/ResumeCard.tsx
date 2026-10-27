import { useQuery } from 'convex/react';
import { View, StyleSheet, Text } from 'react-native';
import { VideoLibraryCard } from './VideoLibraryCard';
import { api } from '../../convex/_generated/api';
import type { Doc } from '../../convex/_generated/dataModel';
import type { ReaderColors } from './SyncedVideoPlayer';

export function ResumeCard({ entryId, colors, onOpen }: {
  entryId: string | null; colors: ReaderColors; onOpen: (entry: Doc<'entries'>) => void;
}) {
  const entry = useQuery(api.entries.getEntry, entryId ? { entryId } : 'skip');
  if (!entry) return null;
  return <View style={styles.card}>
    <Text style={{ color: colors.text, fontSize: 24, fontWeight: '600', marginBottom: 12 }}>Continue watching</Text>
    <VideoLibraryCard entry={entry} colors={colors} continuing onOpen={onOpen} />
  </View>;
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
});
