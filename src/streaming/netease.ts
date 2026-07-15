import type { EchoLinkTrackPreview } from '../echoLink/types';

export type NeteaseProfile = {
  avatarUrl: string;
  nickname: string;
  userId: number;
};

export type NeteasePlaylist = {
  artworkUrl: string;
  id: string;
  name: string;
  sourceLabel: '网易云';
  trackCount: number;
};

type NeteaseSong = {
  al?: { name?: string; picUrl?: string };
  ar?: Array<{ name?: string }>;
  dt?: number;
  id?: number;
  name?: string;
};

export const normalizeNeteaseApiBaseUrl = (value: string): string => {
  const normalized = value.trim().replace(/\/+$/u, '');
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('API 地址必须以 http:// 或 https:// 开头');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('API 地址必须以 http:// 或 https:// 开头');
  const host = url.hostname.toLowerCase();
  const privateHttp = host === 'localhost'
    || host.endsWith('.local')
    || /^10\./u.test(host)
    || /^192\.168\./u.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./u.test(host)
    || host === '127.0.0.1'
    || host === '::1';
  if (url.protocol === 'http:' && !privateHttp) throw new Error('公网流媒体 API 必须使用 HTTPS');
  return normalized;
};

const request = async <T>(
  apiBaseUrl: string,
  path: string,
  params: Record<string, string | number> = {},
  cookie = '',
): Promise<T> => {
  const query = new URLSearchParams({ timestamp: String(Date.now()) });
  Object.entries(params).forEach(([key, value]) => query.set(key, String(value)));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${normalizeNeteaseApiBaseUrl(apiBaseUrl)}${path}?${query.toString()}`, {
      headers: cookie ? { Cookie: cookie } : undefined,
      signal: controller.signal,
    });
    const body = await response.json() as T & { code?: number; message?: string };
    if (!response.ok || (typeof body.code === 'number' && body.code >= 400 && body.code !== 800 && body.code !== 801 && body.code !== 802 && body.code !== 803)) {
      throw new Error(body.message || `HTTP ${response.status}`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
};

const trackFromSong = (song: NeteaseSong): EchoLinkTrackPreview | null => {
  if (!song.id || !song.name) return null;
  return {
    album: song.al?.name ?? '',
    albumArtist: '',
    artist: song.ar?.map((artist) => artist.name).filter(Boolean).join(', ') || '未知艺术家',
    artworkUrl: song.al?.picUrl ?? null,
    canPlayOnPhone: true,
    durationMs: song.dt ?? 0,
    id: String(song.id),
    sourceLabel: '网易云',
    title: song.name,
  };
};

export const createNeteaseQrLogin = async (apiBaseUrl: string): Promise<{ key: string; qrUrl: string }> => {
  const keyResponse = await request<{ data?: { unikey?: string } }>(apiBaseUrl, '/login/qr/key');
  const key = keyResponse.data?.unikey;
  if (!key) throw new Error('无法生成登录二维码');
  const qrResponse = await request<{ data?: { qrurl?: string } }>(apiBaseUrl, '/login/qr/create', { key });
  const qrUrl = qrResponse.data?.qrurl;
  if (!qrUrl) throw new Error('无法生成登录二维码');
  return { key, qrUrl };
};

export const checkNeteaseQrLogin = (
  apiBaseUrl: string,
  key: string,
): Promise<{ code?: number; cookie?: string; message?: string }> => (
  request(apiBaseUrl, '/login/qr/check', { key, noCookie: 'true' })
);

export const getNeteaseProfile = async (apiBaseUrl: string, cookie: string): Promise<NeteaseProfile> => {
  const response = await request<{ profile?: { avatarUrl?: string; nickname?: string; userId?: number } }>(
    apiBaseUrl,
    '/user/account',
    {},
    cookie,
  );
  const profile = response.profile;
  if (!profile?.userId) throw new Error('登录状态已失效');
  return {
    avatarUrl: profile.avatarUrl ?? '',
    nickname: profile.nickname ?? '网易云用户',
    userId: profile.userId,
  };
};

export const getNeteasePlaylists = async (
  apiBaseUrl: string,
  cookie: string,
  userId: number,
): Promise<NeteasePlaylist[]> => {
  const playlists = new Map<string, NeteasePlaylist>();
  const limit = 100;
  let offset = 0;
  let more = true;
  while (more) {
    const response = await request<{
      more?: boolean;
      playlist?: Array<{ coverImgUrl?: string; id?: number; name?: string; trackCount?: number }>;
    }>(apiBaseUrl, '/user/playlist', { uid: userId, limit, offset }, cookie);
    const page = response.playlist ?? [];
    page.forEach((playlist) => {
      if (!playlist.id || !playlist.name) return;
      playlists.set(String(playlist.id), {
        artworkUrl: playlist.coverImgUrl ?? '',
        id: String(playlist.id),
        name: playlist.name,
        sourceLabel: '网易云',
        trackCount: playlist.trackCount ?? 0,
      });
    });
    more = response.more === true && page.length > 0;
    offset += page.length;
  }
  return Array.from(playlists.values());
};

export const getNeteasePlaylistTracks = async (
  apiBaseUrl: string,
  cookie: string,
  playlistId: string,
): Promise<EchoLinkTrackPreview[]> => {
  const tracks = new Map<string, EchoLinkTrackPreview>();
  const limit = 500;
  let offset = 0;
  while (true) {
    const response = await request<{ songs?: NeteaseSong[] }>(
      apiBaseUrl,
      '/playlist/track/all',
      { id: playlistId, limit, offset },
      cookie,
    );
    const songs = response.songs ?? [];
    const page = songs.map(trackFromSong).filter((track): track is EchoLinkTrackPreview => Boolean(track));
    const previousCount = tracks.size;
    page.forEach((track) => tracks.set(track.id, track));
    if (songs.length < limit || tracks.size === previousCount) break;
    offset += songs.length;
  }
  return Array.from(tracks.values());
};

export const searchNeteaseTracks = async (
  apiBaseUrl: string,
  cookie: string,
  keywords: string,
): Promise<EchoLinkTrackPreview[]> => {
  if (!keywords.trim()) return [];
  const response = await request<{ result?: { songs?: NeteaseSong[] } }>(
    apiBaseUrl,
    '/cloudsearch',
    { keywords: keywords.trim(), limit: 50, type: 1 },
    cookie,
  );
  return (response.result?.songs ?? []).map(trackFromSong).filter((track): track is EchoLinkTrackPreview => Boolean(track));
};

export const getNeteasePlaybackUrl = async (
  apiBaseUrl: string,
  cookie: string,
  trackId: string,
): Promise<string> => {
  const response = await request<{ data?: Array<{ url?: string | null }> }>(
    apiBaseUrl,
    '/song/url/v1',
    { id: trackId, level: 'exhigh' },
    cookie,
  );
  const url = response.data?.[0]?.url;
  if (!url) throw new Error('该歌曲当前不可播放，可能受版权或会员权限限制');
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url;
};
