import { useDeferredValue, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Dimensions,
  Modal,
  Platform,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LanguagePickerSheet } from '../components/LanguagePickerSheet';
import { SyncedReadingScreen } from './SyncedReadingScreen';
import { VideoLibraryScreen } from './VideoLibraryScreen';
import { useReadingPreferences } from '../lib/readingPreferences';
import { useShareIntent } from 'expo-share-intent';
import Constants from 'expo-constants';
import { getLanguageLabel, languageOptions } from '../constants/languages';
import { palette, spacing } from '../constants/theme';
import {
  fetchYouTubePreview,
  getYouTubeThumbnailUrl,
  parseYouTubeUrl,
  type YouTubePreview,
} from '../lib/youtube';
import {
  getFriendlyFailureCopy,
} from '../lib/reader';
import { buildDebugReportText, type DisplayTranscriptSegment, type ProcessingDebugReport } from '../lib/syncedTranscript';
import type { Doc } from '../../convex/_generated/dataModel';

const { width } = Dimensions.get('window');
const isSmallDevice = width < 375;

export function HomeScreen({
  backendReady,
  entries,
  entriesLoading = false,
  isWorking,
  onToggleFavorite,
  onSelectEntry,
  onTranscribe,
  selectedEntryId,
  selectedEntry,
  syncedDebugReport,
  syncedSegments,
  supportVisible = false,
  onSupportVisibleChange,
}: {
  backendReady: boolean;
  entries: Doc<'entries'>[];
  entriesLoading?: boolean;
  isWorking: boolean;
  onToggleFavorite: (entryId: Doc<'entries'>['_id']) => Promise<void>;
  onSelectEntry: (entryId: Doc<'entries'>['_id']) => void;
  onTranscribe: (args: {
    channelTitle?: string;
    sourceLanguage: string;
    sourceLanguageLabel: string;
    targetLanguage: string;
    targetLanguageLabel: string;
    thumbnailUrl: string;
    title: string;
    videoId: string;
    youtubeUrl: string;
  }) => Promise<Doc<'entries'>['_id'] | null>;
  selectedEntryId: Doc<'entries'>['_id'] | null;
  selectedEntry: Doc<'entries'> | null | undefined;
  syncedDebugReport?: ProcessingDebugReport;
  syncedSegments: DisplayTranscriptSegment[];
  supportVisible?: boolean;
  onSupportVisibleChange?: (visible: boolean) => void;
}) {
  const scheme = useColorScheme();
  const colors = palette[scheme === 'dark' ? 'dark' : 'light'];

  const [url, setUrl] = useState('');
  const [view, setView] = useState<'library' | 'input' | 'reading'>('library');
  const [preview, setPreview] = useState<YouTubePreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const preferences = useReadingPreferences();
  const { language: targetLanguage, setLanguage: setTargetLanguage } = preferences;
  const [pickerVisible, setPickerVisible] = useState(false);
  const [wasAutoPasted, setWasAutoPasted] = useState(false);

  const { hasShareIntent, shareIntent, resetShareIntent, error: shareError } = useShareIntent({
    disabled: Platform.OS === 'web' || Constants.appOwnership === 'expo',
    resetOnBackground: false,
  });
  useEffect(() => {
    if (!hasShareIntent) return;
    const sharedText = shareIntent.webUrl || shareIntent.text || '';
    const candidates = [sharedText, ...(sharedText.match(/https?:\/\/[^\s]+/g) ?? [])];
    const parsed = candidates.map(parseYouTubeUrl).find(Boolean);
    if (parsed) {
      setUrl(parsed.cleanUrl);
      setView('input');
      setWasAutoPasted(true);
    } else {
      Alert.alert('Share a YouTube video', 'This link is not a YouTube video. Open a video in YouTube and share it to Bolo.');
    }
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (view === 'library') return false;
      setView('library');
      return true;
    });
    return () => subscription.remove();
  }, [view]);

  const deferredUrl = useDeferredValue(url);
  const parsedUrl = parseYouTubeUrl(url);
  const targetLanguageOptions = languageOptions.filter((language) => language.code !== 'auto');

  useEffect(() => {
    if (!selectedEntryId && entries[0]) {
      onSelectEntry(entries[0]._id);
    }
  }, [entries, onSelectEntry, selectedEntryId]);

  useEffect(() => {
    if (view !== 'input') return;
    const checkClipboard = async () => {
      if (url.trim()) return;
      let content = '';

      try {
        content = await Clipboard.getStringAsync();
      } catch {
        return;
      }

      const parsed = parseYouTubeUrl(content);
      if (!parsed || wasAutoPasted) return;
      setUrl(parsed.cleanUrl);
      setWasAutoPasted(true);
    };
    void checkClipboard();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void checkClipboard();
    });
    return () => subscription.remove();
  }, [url, wasAutoPasted, view]);

  useEffect(() => {
    const parsed = parseYouTubeUrl(deferredUrl);
    if (!deferredUrl.trim() || !parsed) {
      setPreview(null);
      setIsPreviewLoading(false);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setIsPreviewLoading(true);
      try {
        const nextPreview = await fetchYouTubePreview(parsed.cleanUrl);
        if (!cancelled) setPreview(nextPreview);
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setIsPreviewLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [deferredUrl]);

  const failureCopy = getFriendlyFailureCopy(selectedEntry?.errorMessage);

  const handleReadVideo = async (entryOverride?: Doc<'entries'> | null) => {
    const nextParsed = entryOverride ? parseYouTubeUrl(entryOverride.youtubeUrl) : parsedUrl;
    if (!nextParsed) {
      Alert.alert('Check the link', 'Please copy the full YouTube video link and paste it here.');
      return;
    }
    if (!backendReady) {
      Alert.alert('Almost ready', 'We are setting up video translation. Please try again in a few seconds.');
      return;
    }

    const nextPreview = entryOverride ? null : preview; // Simplify for history override
    const entryId = await onTranscribe({
      channelTitle: nextPreview?.authorName || entryOverride?.channelTitle,
      sourceLanguage: 'auto',
      sourceLanguageLabel: 'Automatic',
      targetLanguage: entryOverride?.targetLanguage ?? targetLanguage,
      targetLanguageLabel: entryOverride?.targetLanguageLabel ?? getLanguageLabel(targetLanguage),
      thumbnailUrl: nextPreview?.thumbnailUrl ?? (entryOverride?.thumbnailUrl || getYouTubeThumbnailUrl(nextParsed.videoId)),
      title: nextPreview?.title ?? (entryOverride?.title || 'YouTube video'),
      videoId: nextParsed.videoId,
      youtubeUrl: nextParsed.cleanUrl,
    });

    if (entryId) {
      onSelectEntry(entryId);
      preferences.rememberEntry(entryId);
      setView('reading');
    }
  };

  const handleToggleFavorite = async (entryId: Doc<'entries'>['_id']) => {
    try {
      await onToggleFavorite(entryId);
    } catch {
      Alert.alert('Could not update your saved video', 'Please check your connection and try again.');
    }
  };

  const renderReadingView = () => {
    if (!selectedEntry) return null;

    const syncedEntry = selectedEntry.processingVersion === 2;

    if (syncedEntry) {
      return <SyncedReadingScreen key={selectedEntry._id} entry={selectedEntry} segments={syncedSegments}
        colors={colors} fontSize={preferences.fontSize} focusMode={preferences.focusMode}
        onFontSizeChange={preferences.setFontSize} onFocusModeChange={preferences.setFocusMode}
        onBack={() => setView('library')} onFavorite={() => { void handleToggleFavorite(selectedEntry._id); }}
        onRetry={() => { void handleReadVideo(selectedEntry); }} />;
    }

    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomWidth: 1, borderColor: colors.border }]}>
          <Pressable accessibilityRole="button"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setView('library');
            }}
            style={styles.backButton}
          >
            <MaterialCommunityIcons name="chevron-left" size={34} color={colors.text} />
            <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
          </Pressable>

          <View style={styles.readerHeaderTools}>
            <Pressable accessibilityRole="button"
              onPress={() => handleToggleFavorite(selectedEntry._id)}
              style={[styles.headerIconBtn, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons
                color={selectedEntry.favorite ? colors.accent : colors.textSoft}
                name={selectedEntry.favorite ? 'star' : 'star-outline'}
                size={22}
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.processingState}>
            {selectedEntry.status === 'failed' ? (
              <>
                <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.danger} />
                <Text style={[styles.statusTitle, { color: colors.danger }]}>{failureCopy.title}</Text>
                <Text style={[styles.statusBody, { color: colors.textSoft }]}>
                  {failureCopy.body}
                </Text>
                <Pressable accessibilityRole="button"
                  onPress={() => handleReadVideo(selectedEntry)}
                  style={[styles.inlineActionButton, { backgroundColor: colors.accent, borderColor: colors.border }]}
                >
                  <MaterialCommunityIcons color="#fff" name="refresh" size={18} />
                  <Text style={styles.inlineActionText}>Try Again</Text>
                </Pressable>
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={[styles.statusTitle, { color: colors.text }]}>Getting your video ready</Text>
                <Text style={[styles.statusBody, { color: colors.textSoft }]}>
                  Adding your translation. You can come back to this video later.
                </Text>
              </>
            )}
        </View>
      </SafeAreaView>
    );
  };

  const openSavedVideo = (entry: Doc<'entries'>) => {
    if (entry.processingVersion !== 2) {
      void handleReadVideo(entry);
      return;
    }
    onSelectEntry(entry._id);
    preferences.rememberEntry(entry._id);
    setView('reading');
  };

  const supportModal = <Modal visible={supportVisible} onRequestClose={() => onSupportVisibleChange?.(false)} animationType="slide">
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background, padding: 20 }]}>
          <Pressable accessibilityRole="button" onPress={() => onSupportVisibleChange?.(false)} style={styles.supportButton}>
            <Text style={{ color: colors.text, fontSize: 22 }}>Close</Text>
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 24 }}>Help & diagnostics</Text>
          <Text style={{ color: colors.text, fontSize: 18, marginVertical: 16 }}>In YouTube, tap Share, then Bolo. You can also copy the link and paste it here.</Text>
          {shareError && <Text style={{ color: colors.danger }}>{shareError}</Text>}
          <ScrollView><Text selectable style={{ color: colors.text, fontSize: 16 }}>
            {syncedDebugReport ? buildDebugReportText(syncedDebugReport) : 'Open a saved video to view its processing details.'}
          </Text></ScrollView>
          {syncedDebugReport && <Pressable accessibilityRole="button" style={styles.supportButton}
            onPress={() => { void Clipboard.setStringAsync(buildDebugReportText(syncedDebugReport)).then(() => Alert.alert('Copied', 'Processing details copied.')).catch(() => Alert.alert('Could not copy', 'Please try again.')); }}>
            <Text style={{ color: colors.text, fontSize: 18 }}>Copy processing details</Text>
          </Pressable>}
        </SafeAreaView>
      </Modal>;

  const library = <View style={[styles.safeArea, { display: view === 'library' ? 'flex' : 'none' }]}>
    <VideoLibraryScreen entries={entries} loading={entriesLoading} colors={colors} lastEntryId={preferences.lastEntryId}
      backendReady={backendReady} error={preferences.error} onOpen={openSavedVideo}
      onFavorite={(id) => { void handleToggleFavorite(id); }} onAdd={() => setView('input')}
      onHelp={() => onSupportVisibleChange?.(true)} />
  </View>;

  const renderContent = () => {
    if (!preferences.loaded) return <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background, justifyContent: 'center' }]}><ActivityIndicator size="large" color={colors.accent} /></SafeAreaView>;
    if (view === 'reading' && selectedEntry === undefined) return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background, padding: 24, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ color: colors.text, fontSize: 22 }}>Opening your video…</Text>
        <Pressable accessibilityRole="button" onPress={() => setView('library')} style={styles.supportButton}>
          <Text style={{ color: colors.text, fontSize: 20 }}>Back to your videos</Text>
        </Pressable>
      </SafeAreaView>
    );
    if (view === 'reading' && selectedEntry === null) return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background, padding: 24, justifyContent: 'center' }]}>
        <Text style={{ color: colors.text, fontSize: 22 }}>This saved video is no longer available.</Text>
        <Pressable accessibilityRole="button" onPress={() => setView('library')} style={styles.supportButton}>
          <Text style={{ color: colors.text, fontSize: 20 }}>Back to your videos</Text>
        </Pressable>
      </SafeAreaView>
    );
    if (view === 'reading') return renderReadingView();
    if (view === 'library') return null;


    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <Pressable accessibilityRole="button" onPress={() => setView('library')} style={styles.supportButton}>
            <Text style={[styles.backText, { color: colors.text }]}>‹ Your videos</Text>
          </Pressable>
          <View style={styles.hero}>
            <View style={[styles.iconContainer, { backgroundColor: colors.backgroundAccent, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="book-open-page-variant" size={42} color={colors.accent} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Add a video</Text>
            <Text style={[styles.subtitle, { color: colors.textSoft }]}>
              Watch your videos with an easy-to-read translation.
            </Text>
          </View>

          {preferences.error && <Text style={{ color: colors.danger, fontSize: 18 }}>{preferences.error}</Text>}


          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.cardHeader, { backgroundColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.background }]}>YouTube link</Text>
            </View>

            <View style={styles.cardBody}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setUrl}
                accessibilityLabel="YouTube video link"
                placeholder="Paste YouTube link"
                placeholderTextColor={colors.textSoft}
                style={[styles.mainInput, { backgroundColor: colors.backgroundAccent, borderColor: colors.border, color: colors.text }]}
                value={url}
              />

              {isPreviewLoading ? (
                <View style={styles.previewPlaceholder}>
                  <ActivityIndicator color={colors.accent} size="large" />
                  <Text style={[styles.previewPlaceholderText, { color: colors.textSoft }]}>Checking the video...</Text>
                </View>
              ) : preview ? (
                <View style={[styles.previewCard, { borderColor: colors.border, backgroundColor: colors.backgroundAccent }]}>
                  <Image source={{ uri: preview.thumbnailUrl }} style={styles.previewThumb} />
                  <View style={styles.previewInfo}>
                    <Text numberOfLines={2} style={[styles.previewTitle, { color: colors.text }]}>{preview.title}</Text>
                    <Text style={[styles.previewAuthor, { color: colors.textSoft }]}>{preview.authorName ?? 'YouTube'}</Text>
                  </View>
                </View>
              ) : null}

              <Pressable accessibilityRole="button"
                onPress={() => setPickerVisible(true)}
                style={[styles.languageCard, { backgroundColor: colors.backgroundAccent, borderColor: colors.border }]}
              >
                <View style={styles.languageCardCopy}>
                  <Text style={[styles.languageCardLabel, { color: colors.textSoft }]}>Translate to</Text>
                  <Text style={[styles.languageCardValue, { color: colors.text }]}>{getLanguageLabel(targetLanguage)}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-down" size={28} color={colors.text} />
              </Pressable>

              <View style={styles.buttonContainer}>
                <Pressable accessibilityRole="button"
                  disabled={isWorking || !preferences.loaded}
                  onPress={() => handleReadVideo(null)}
                  style={[styles.bigButton, { backgroundColor: isWorking ? colors.textSoft : colors.accent, borderColor: colors.border }]}
                >
                  <View style={styles.buttonContent}>
                    {isWorking ? <ActivityIndicator color="#fff" size="small" /> : null}
                    <Text style={[styles.bigButtonText, { color: colors.reader }]}>{isWorking ? 'Preparing video...' : 'Watch with translation'}</Text>
                  </View>
                </Pressable>

              </View>
            </View>
          </View>

          <View style={styles.footer}>
            {onSupportVisibleChange && <Pressable accessibilityRole="button" onPress={() => onSupportVisibleChange(true)} style={styles.supportButton}>
              <Text style={{ color: colors.textSoft, fontSize: 18 }}>Help & diagnostics</Text>
            </Pressable>}
          </View>
        </ScrollView>

        <LanguagePickerSheet
          colors={colors}
          onClose={() => setPickerVisible(false)}
          onSelect={(code) => setTargetLanguage(code)}
          options={targetLanguageOptions}
          selectedCode={targetLanguage}
          title="Choose translation language"
          visible={pickerVisible}
        />
      </SafeAreaView>
    );
  };

  return <View style={styles.safeArea}>
    {preferences.loaded && library}
    {renderContent()}
    {supportModal}
  </View>;
}

const styles = StyleSheet.create({
  supportButton: { minHeight: 48, paddingVertical: 14, paddingHorizontal: 8 },
  backButton: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  backText: { fontSize: 20, fontWeight: '700' },
  bigButton: { alignItems: 'center', borderRadius: 16, borderWidth: 0, minHeight: 72, padding: 16, justifyContent: 'center', width: '100%' },
  bigButtonText: { color: '#FFFFFF', fontSize: 24, fontWeight: '600', textAlign: 'center' },
  buttonContainer: { marginTop: spacing.xs },
  buttonContent: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  card: { borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  cardBody: { gap: spacing.md, padding: spacing.lg },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  container: { flexGrow: 1, padding: spacing.md, paddingBottom: spacing.xl, paddingTop: spacing.xl },
  emptyContainer: { alignItems: 'center', gap: spacing.sm, justifyContent: 'center', paddingVertical: 100 },
  emptyText: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  footer: { alignItems: 'center', marginTop: spacing.xl },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md },
  headerIconBtn: { alignItems: 'center', borderRadius: 12, borderWidth: 2, height: 42, justifyContent: 'center', width: 42 },
  headerTitle: { fontSize: 20, fontWeight: '800', textTransform: 'none' },
  hero: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  iconContainer: { alignItems: 'center', borderRadius: 24, borderWidth: 1, height: 80, justifyContent: 'center', marginBottom: spacing.xs, transform: [{ rotate: '-4deg' }], width: 80 },
  inlineActionButton: { alignItems: 'center', borderRadius: 14, borderWidth: 2, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 50, paddingHorizontal: spacing.md },
  inlineActionText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  label: { fontSize: 22, fontWeight: '800' },
  languageCard: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 76, paddingHorizontal: spacing.md },
  languageCardCopy: { gap: 4 },
  languageCardLabel: { fontSize: 14, fontWeight: '700', letterSpacing: 0.4, textTransform: 'none' },
  languageCardValue: { fontSize: 22, fontWeight: '800' },
  mainInput: { borderRadius: 16, borderWidth: 1, fontSize: 20, minHeight: 70, padding: spacing.md },
  previewAuthor: { fontSize: 18, fontWeight: '600' },
  previewCard: { alignItems: 'center', borderRadius: 16, borderWidth: 2, flexDirection: 'row', gap: spacing.sm, overflow: 'hidden', padding: spacing.sm },
  previewInfo: { flex: 1, gap: 2 },
  previewPlaceholder: { alignItems: 'center', gap: 8, height: 100, justifyContent: 'center' },
  previewPlaceholderText: { fontSize: 16, fontWeight: '600' },
  previewThumb: { borderRadius: 8, height: 60, width: 80 },
  previewTitle: { fontSize: 16, fontWeight: '800' },
  processingState: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  readerHeaderTools: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  safeArea: { flex: 1 },
  secondaryButton: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  secondaryButtonText: { fontSize: 18, fontWeight: '700' },
  statusTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  statusBody: { fontSize: 16, fontWeight: '600', lineHeight: 24, textAlign: 'center' },
  stepNumber: { alignItems: 'center', borderRadius: 8, height: 32, justifyContent: 'center', width: 32 },
  stepNumberText: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  subtitle: { fontSize: isSmallDevice ? 18 : 22, lineHeight: 30, paddingHorizontal: spacing.md, textAlign: 'center' },
  title: { fontSize: isSmallDevice ? 32 : 44, fontWeight: '900', letterSpacing: -1, textAlign: 'center' },
});
