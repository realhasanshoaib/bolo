import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { defaultTargetLanguage, languageOptions } from '../constants/languages';

const keys = ['bolo:language', 'bolo:font-size', 'bolo:focus-mode', 'bolo:last-entry'];
export const readingFontSizes = [20, 24, 28, 32] as const;

export function useReadingPreferences() {
  const saveQueue = useRef(Promise.resolve());
  const [loaded, setLoaded] = useState(false);
  const [language, setLanguage] = useState<string>(defaultTargetLanguage.code);
  const [fontSize, setFontSize] = useState(24);
  const [focusMode, setFocusMode] = useState(false);
  const [lastEntryId, setLastEntryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.multiGet(keys).then((values) => {
      if (cancelled) return;
      const saved = new Map(values);
      const savedLanguage = saved.get('bolo:language');
      if (languageOptions.some((option) => option.code === savedLanguage && option.code !== 'auto') && savedLanguage) {
        setLanguage(savedLanguage);
      }
      const savedSize = Number(saved.get('bolo:font-size'));
      if (readingFontSizes.some((size) => size === savedSize)) setFontSize(savedSize);
      setFocusMode(saved.get('bolo:focus-mode') === 'true');
      setLastEntryId(saved.get('bolo:last-entry') ?? null);
    }).catch(() => {
      if (!cancelled) setError('Your saved preferences could not be loaded. Changes will still work for this visit.');
    }).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const save = (key: string, value: string) => {
    saveQueue.current = saveQueue.current.then(() => AsyncStorage.setItem(key, value)).catch(() => {
      setError('Your preferences could not be saved on this device.');
    });
  };

  return {
    loaded, language, fontSize, focusMode, lastEntryId, error,
    setLanguage: (value: string) => { setLanguage(value); save('bolo:language', value); },
    setFontSize: (value: number) => { setFontSize(value); save('bolo:font-size', String(value)); },
    setFocusMode: (value: boolean) => { setFocusMode(value); save('bolo:focus-mode', String(value)); },
    rememberEntry: (value: string) => { setLastEntryId(value); save('bolo:last-entry', value); },
  };
}

export async function readPlaybackPosition(entryId: string) {
  try {
    const value = Number(await AsyncStorage.getItem(`bolo:position:${entryId}`));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    Alert.alert('Could not restore your place', 'You can still watch this video from the beginning.');
    return 0;
  }
}

export async function savePlaybackPosition(entryId: string, timeMs: number) {
  await AsyncStorage.setItem(`bolo:position:${entryId}`, String(Math.max(0, Math.round(timeMs))));
}
