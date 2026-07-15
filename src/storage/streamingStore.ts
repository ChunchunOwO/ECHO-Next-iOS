import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export type StreamingPreferences = {
  apiBaseUrl: string;
  favoritePlaylistIds: string[];
  pinnedPlaylistIds: string[];
};

const preferencesKey = 'echo.ios.streamingPreferences.v1';
const legacyCookieKey = 'echo.ios.neteaseCookie.v1';
const sessionKey = 'echo.ios.neteaseSession.v2';

export type NeteaseSession = {
  apiBaseUrl: string;
  cookie: string;
};

const strings = (value: unknown): string[] => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
);

export const loadStreamingPreferences = async (): Promise<StreamingPreferences> => {
  try {
    const raw = await AsyncStorage.getItem(preferencesKey);
    const value = raw ? JSON.parse(raw) as Partial<StreamingPreferences> : {};
    return {
      apiBaseUrl: typeof value.apiBaseUrl === 'string' ? value.apiBaseUrl : '',
      favoritePlaylistIds: strings(value.favoritePlaylistIds),
      pinnedPlaylistIds: strings(value.pinnedPlaylistIds),
    };
  } catch {
    return { apiBaseUrl: '', favoritePlaylistIds: [], pinnedPlaylistIds: [] };
  }
};

export const saveStreamingPreferences = (preferences: StreamingPreferences): Promise<void> => (
  AsyncStorage.setItem(preferencesKey, JSON.stringify(preferences))
);

export const loadNeteaseSession = async (): Promise<NeteaseSession | null> => {
  await SecureStore.deleteItemAsync(legacyCookieKey).catch(() => undefined);
  try {
    const raw = await SecureStore.getItemAsync(sessionKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<NeteaseSession>;
    return typeof value.apiBaseUrl === 'string' && typeof value.cookie === 'string'
      ? { apiBaseUrl: value.apiBaseUrl, cookie: value.cookie }
      : null;
  } catch {
    return null;
  }
};

export const saveNeteaseSession = (session: NeteaseSession): Promise<void> => (
  SecureStore.setItemAsync(sessionKey, JSON.stringify(session))
);

export const clearNeteaseSession = (): Promise<void> => SecureStore.deleteItemAsync(sessionKey);
