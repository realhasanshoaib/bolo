import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Doc } from '../../convex/_generated/dataModel';
import type { ReaderColors } from '../components/SyncedVideoPlayer';
import { ResumeCard } from '../components/ResumeCard';
import { VideoLibraryCard } from '../components/VideoLibraryCard';

export function VideoLibraryScreen({ entries, loading, colors, lastEntryId, backendReady, error, onOpen, onFavorite, onAdd, onHelp }: {
  entries: Doc<'entries'>[]; loading: boolean; colors: ReaderColors; lastEntryId: string | null; backendReady: boolean;
  error: string | null; onOpen: (entry: Doc<'entries'>) => void;
  onFavorite: (id: Doc<'entries'>['_id']) => void; onAdd: () => void; onHelp: () => void;
}) {
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const videos = useMemo(() => {
    const search = query.trim().toLowerCase();
    return entries.filter(entry => (!favoritesOnly || entry.favorite) &&
      [entry.title, entry.channelTitle, entry.targetLanguageLabel].some(value => value?.toLowerCase().includes(search)))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [entries, query, favoritesOnly]);
  return <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
    <FlatList data={videos} keyExtractor={entry => entry._id} contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      ListHeaderComponent={<View>
        <Text style={[styles.brand, { color: colors.accent }]}>BOLO</Text>
        <Text style={[styles.heading, { color: colors.text }]}>Your videos</Text>
        <Text style={[styles.subtitle, { color: colors.textSoft }]}>Watch again, or pick up where you left off.</Text>
        {!!error && <Text style={{ color: colors.danger, fontSize: 18, marginBottom: 16 }}>{error}</Text>}
        {backendReady && !query.trim() && !favoritesOnly && <ResumeCard entryId={lastEntryId} colors={colors} onOpen={onOpen} />}
        {entries.length > 0 && <>
          <TextInput accessibilityLabel="Search your videos" placeholder="Search videos" placeholderTextColor={colors.textSoft}
            value={query} onChangeText={setQuery} autoCorrect={false}
            style={[styles.search, { color: colors.text, backgroundColor: colors.surface }]} />
          <View style={styles.filters}>{[false, true].map(favorite => <Pressable key={String(favorite)}
            accessibilityRole="button" accessibilityState={{ selected: favoritesOnly === favorite }} onPress={() => setFavoritesOnly(favorite)}
            style={[styles.filter, { backgroundColor: favoritesOnly === favorite ? colors.accent : colors.backgroundAccent }]}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: favoritesOnly === favorite ? colors.reader : colors.text }}>{favorite ? 'Favorites' : 'Recent videos'}</Text>
          </Pressable>)}</View>
        </>}
      </View>}
      renderItem={({ item }) => <VideoLibraryCard entry={item} colors={colors} continuing={item._id === lastEntryId}
        onOpen={onOpen} onFavorite={() => onFavorite(item._id)} />}
      ListEmptyComponent={loading ? <View style={styles.empty}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[styles.subtitle, { color: colors.textSoft }]}>Loading your videos…</Text>
      </View> : <View style={styles.empty}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>{query.trim() ? 'No matching videos' : favoritesOnly ? 'Your favorites go here' : 'Your first video starts here'}</Text>
        <Text style={[styles.subtitle, { color: colors.textSoft }]}>{query.trim() ? 'Try a different title or channel.' : favoritesOnly ? 'Tap Favorite on a video to find it here.' : 'Tap Add video below, or share a YouTube link to Bolo.'}</Text>
      </View>}
      ListFooterComponent={<Pressable accessibilityRole="button" onPress={onHelp} style={styles.help}>
        <Text style={{ color: colors.textSoft, fontSize: 18 }}>Help</Text>
      </Pressable>} />
    <View style={[styles.bottom, { backgroundColor: colors.background }]}>
      <Pressable accessibilityRole="button" onPress={onAdd} style={[styles.add, { backgroundColor: colors.accent }]}>
        <Text style={{ color: colors.reader, fontSize: 23, fontWeight: '600' }}>+ Add video</Text>
      </Pressable>
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, list: { padding: 20, paddingTop: 24 },
  brand: { fontSize: 14, fontWeight: '700', letterSpacing: 3, marginBottom: 8 },
  heading: { fontSize: 34, lineHeight: 44, fontWeight: '700' },
  subtitle: { fontSize: 18, lineHeight: 26, marginTop: 6, marginBottom: 24 },
  search: { minHeight: 56, borderRadius: 14, padding: 16, fontSize: 18, marginBottom: 16 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  filter: { minHeight: 48, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 13, justifyContent: 'center' },
  empty: { paddingVertical: 24 }, emptyTitle: { fontSize: 24, fontWeight: '600' },
  help: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  bottom: { paddingHorizontal: 20, paddingVertical: 12 },
  add: { minHeight: 64, padding: 16, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
