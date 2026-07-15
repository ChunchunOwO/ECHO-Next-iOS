import AsyncStorage from '@react-native-async-storage/async-storage';

export type SavedSettings = {
  appLanguage: 'zh' | 'en';
  artworkBackgroundEnabled: boolean;
  audioTagVisibility: Record<string, boolean>;
  autoOpenLyricsForLocalTracks: boolean;
  autoQueueImportedLocalTracks: boolean;
  confirmBeforeDeletingLocalTracks: boolean;
  defaultLibrarySource: 'all' | 'echo' | 'local' | 'streaming';
  defaultLocalLibraryView: 'albums' | 'artists' | 'favorites' | 'formats' | 'recent' | 'songs';
  defaultPage: 'connect' | 'control' | 'library' | 'search' | 'settings';
  echoConnectionEnabled: boolean;
  eqGains: number[];
  eqPreset: 'bass' | 'clarity' | 'custom' | 'flat' | 'lateNight' | 'vocal' | 'warm';
  lrcApiExternalDataEnabled: boolean;
  lrclibExternalDataEnabled: boolean;
  externalDataSelectionMode: 'ask' | 'automatic';
  neteaseAccessMode: 'direct' | 'selfHosted';
  neteaseExternalDataEnabled: boolean;
  loudnessNormalizationEnabled: boolean;
  showArtworkGlow: boolean;
};

const storageKey = 'echo.ios.settings.v1';

export const loadSavedSettings = async (): Promise<Partial<SavedSettings>> => {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as Partial<SavedSettings>;
  } catch {
    return {};
  }
};

export const saveSettings = async (settings: SavedSettings): Promise<void> => {
  await AsyncStorage.setItem(storageKey, JSON.stringify(settings));
};
