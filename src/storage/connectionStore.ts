import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EchoLinkConnection } from '../echoLink/client';

const storageKey = 'echo.ios.echoLinkConnection.v1';

const isConnection = (value: unknown): value is EchoLinkConnection => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<EchoLinkConnection>;
  return (
    typeof candidate.host === 'string' &&
    candidate.host.trim().length > 0 &&
    typeof candidate.token === 'string' &&
    candidate.token.trim().length > 0 &&
    typeof candidate.name === 'string' &&
    typeof candidate.port === 'number' &&
    Number.isInteger(candidate.port) &&
    candidate.port >= 1 &&
    candidate.port <= 65535 &&
    (candidate.scheme === 'http' || candidate.scheme === 'https')
  );
};

export const loadSavedConnection = async (): Promise<EchoLinkConnection | null> => {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (isConnection(parsed)) {
      return parsed;
    }
    await AsyncStorage.removeItem(storageKey);
    return null;
  } catch {
    return null;
  }
};

export const saveConnection = async (connection: EchoLinkConnection): Promise<void> => {
  await AsyncStorage.setItem(storageKey, JSON.stringify(connection));
};
