import type {
  PowerampRemoteCommand,
  PowerampRemoteLibraryAlbumsResponse,
  PowerampRemoteLibraryTracksResponse,
  PowerampRemoteStatus,
  PowerampRemoteStreamResponse,
} from './types';

export type PowerampRemoteConnection = {
  host: string;
  name: string;
  port: number;
  scheme: 'http' | 'https';
  token: string;
};

export class PowerampRemoteHttpError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export const normalizePowerampRemoteHost = (value: string): string => (
  value.trim().replace(/^https?:\/\//iu, '').replace(/\/.*$/u, '')
);

export const normalizePowerampRemoteToken = (value: string): string => (
  value.trim().replace(/^Bearer\s+/iu, '').trim()
);

const trimSlashes = (value: string): string => value.replace(/^\/+|\/+$/gu, '');

const parseBody = (body: string): unknown => {
  if (!body) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
};

const messageForError = (error: unknown, url: string): string => {
  if (error instanceof Error && error.name === 'AbortError') return `远程服务连接超时：${url}`;
  const message = error instanceof Error ? error.message : String(error);
  if (/network request failed|fetch failed|timeout/iu.test(message)) return `无法连接远程 Poweramp 服务：${url}`;
  return message;
};

export type PowerampRemoteClient = ReturnType<typeof createPowerampRemoteClient>;

export const createPowerampRemoteClient = (connection: PowerampRemoteConnection) => {
  const host = normalizePowerampRemoteHost(connection.host);
  const token = normalizePowerampRemoteToken(connection.token);
  const baseUrl = `${connection.scheme}://${host}:${connection.port}`;

  const requestJson = async <T>(path: string, init: RequestInit = {}, timeoutMs = 12000): Promise<T> => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('x-poweramp-remote-version', '1');
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const url = `${baseUrl}/${trimSlashes(path)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers, signal: init.signal ?? controller.signal });
    } catch (error) {
      throw new Error(messageForError(error, url));
    } finally {
      clearTimeout(timeout);
    }
    const body = parseBody(await response.text());
    if (!response.ok) {
      const message = typeof body === 'object' && body && 'message' in body
        ? String((body as { message: unknown }).message)
        : response.statusText;
      throw new PowerampRemoteHttpError(response.status, message);
    }
    return body as T;
  };

  const absoluteStreamUrl = (url: string): string => (
    /^https?:\/\//iu.test(url) ? url : `${baseUrl}/${trimSlashes(url)}`
  );

  return {
    baseUrl,
    connection,
    getStatus: () => requestJson<PowerampRemoteStatus>('/poweramp-remote/v1/status', {}, 6000),
    getLibraryTracks: ({ page = 1, pageSize = 40, query = '' }: { page?: number; pageSize?: number; query?: string } = {}) => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (query.trim()) params.set('q', query.trim());
      return requestJson<PowerampRemoteLibraryTracksResponse>(`/poweramp-remote/v1/library/tracks?${params.toString()}`, {}, 15000);
    },
    getLibraryAlbums: ({ page = 1, pageSize = 40, query = '' }: { page?: number; pageSize?: number; query?: string } = {}) => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (query.trim()) params.set('q', query.trim());
      return requestJson<PowerampRemoteLibraryAlbumsResponse>(`/poweramp-remote/v1/library/albums?${params.toString()}`, {}, 15000);
    },
    sendCommand: (command: PowerampRemoteCommand) => requestJson<PowerampRemoteStatus>('/poweramp-remote/v1/playback/command', {
      method: 'POST',
      body: JSON.stringify(command),
    }),
    createStream: async (trackId: string) => {
      const response = await requestJson<PowerampRemoteStreamResponse>(
        `/poweramp-remote/v1/library/tracks/${encodeURIComponent(trackId)}/stream`,
        { method: 'POST', body: JSON.stringify({ target: 'ios' }) },
      );
      return { ...response, streamUrl: absoluteStreamUrl(response.streamUrl) };
    },
    getLyrics: (trackId: string) => requestJson<{ kind: string; lyrics: string; sourceLabel: string }>(
      `/poweramp-remote/v1/library/tracks/${encodeURIComponent(trackId)}/lyrics`,
    ),
  };
};
