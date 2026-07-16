import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PowerampRemoteConnection } from '../powerampRemote/client';

export type SavedPowerampRemoteState = {
  connection: PowerampRemoteConnection | null;
  favoriteTrackIds: string[];
  recentTrackIds: string[];
};

const storageKey = 'echo.ios.powerampRemote.v1';

const emptyState: SavedPowerampRemoteState = {
  connection: null,
  favoriteTrackIds: [],
  recentTrackIds: [],
};

const strings = (value: unknown): string[] => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
);

const connection = (value: unknown): PowerampRemoteConnection | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<PowerampRemoteConnection>;
  return typeof candidate.host === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.token === 'string'
    && typeof candidate.port === 'number'
    && Number.isInteger(candidate.port)
    && candidate.port >= 1
    && candidate.port <= 65535
    && (candidate.scheme === 'http' || candidate.scheme === 'https')
    ? {
      host: candidate.host,
      name: candidate.name,
      port: candidate.port,
      scheme: candidate.scheme,
      token: candidate.token,
    }
    : null;
};

export const loadPowerampRemoteState = async (): Promise<SavedPowerampRemoteState> => {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return emptyState;
    const value = JSON.parse(raw) as Partial<SavedPowerampRemoteState>;
    return {
      connection: connection(value.connection),
      favoriteTrackIds: strings(value.favoriteTrackIds),
      recentTrackIds: strings(value.recentTrackIds),
    };
  } catch {
    return emptyState;
  }
};

export const savePowerampRemoteState = async (state: SavedPowerampRemoteState): Promise<void> => {
  await AsyncStorage.setItem(storageKey, JSON.stringify(state));
};
