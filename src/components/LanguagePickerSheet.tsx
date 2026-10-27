import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { languageOptions } from '../constants/languages';
import { spacing } from '../constants/theme';

export function LanguagePickerSheet({
  colors,
  options = languageOptions,
  onClose,
  onSelect,
  selectedCode,
  title,
  visible,
}: {
  colors: {
    accent: string;
    border: string;
    surface: string;
    surfaceStrong: string;
    text: string;
    textSoft: string;
  };
  options?: readonly { code: string; label: string }[];
  onClose: () => void;
  onSelect: (code: string) => void;
  selectedCode: string;
  title: string;
  visible: boolean;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable accessible={false} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: 48, justifyContent: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 20 }}>Close</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.textSoft }]}>
            Choose the language that will make the reading experience easiest.
          </Text>

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {options.map((language) => {
              const selected = language.code === selectedCode;

              return (
                <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={language.label}
                  key={language.code}
                  onPress={() => {
                    onSelect(language.code);
                    onClose();
                  }}
                  style={[
                    styles.option,
                    {
                      backgroundColor: selected ? colors.surfaceStrong : colors.surface,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.optionText, { color: colors.text }]}>{language.label}</Text>
                  <Text style={[styles.optionBadge, { color: selected ? colors.accent : colors.textSoft }]}>
                    {selected ? 'Selected' : 'Tap to use'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  option: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  optionBadge: {
    fontSize: 14,
    fontWeight: '700',
  },
  optionText: {
    fontSize: 18,
    fontWeight: '700',
  },
  sheet: {
    borderRadius: 28,
    borderWidth: 1,
    maxHeight: '82%',
    padding: spacing.lg,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 6,
  },
});
