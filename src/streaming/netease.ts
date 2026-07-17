import CryptoJS from 'crypto-js';

import type { EchoLinkTrackPreview } from '../echoLink/types';

export const neteaseDirectApiBaseUrl = 'https://music.163.com';
const neteaseEapiBaseUrl = 'https://interface.music.163.com';
const neteaseEapiKey = 'e82ckenh8dichen8';
const neteaseIphoneUserAgent = 'NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)';

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

type ApiResponse<T> = {
  body: T;
  cookie: string;
};

export const normalizeNeteaseApiBaseUrl = (value = ''): string => {
  const normalized = (value.trim() || neteaseDirectApiBaseUrl).replace(/\/+$/u, '');
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

const isDirectApi = (apiBaseUrl: string): boolean => normalizeNeteaseApiBaseUrl(apiBaseUrl) === neteaseDirectApiBaseUrl;

const cookieFromHeaders = (response: Response): string => {
  const raw = response.headers.get('set-cookie') ?? '';
  return raw
    .split(/,(?=\s*[^;,=\s]+=[^;,]+)/u)
    .map((value) => value.trim().split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
};

const mergeCookies = (...values: string[]): string => {
  const cookies = new Map<string, string>();
  values.flatMap((value) => value.split(';')).forEach((part) => {
    const cookie = part.trim();
    const separator = cookie.indexOf('=');
    if (separator > 0) cookies.set(cookie.slice(0, separator), cookie);
  });
  return Array.from(cookies.values()).join('; ');
};

const cookieValues = (value: string): Record<string, string> => Object.fromEntries(
  value.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf('=');
    return separator > 0 ? [part.slice(0, separator), part.slice(separator + 1)] : ['', ''];
  }).filter(([key]) => Boolean(key)),
);

const randomHex = (length: number): string => Array.from(
  { length },
  () => Math.floor(Math.random() * 16).toString(16).toUpperCase(),
).join('');

const stableDeviceId = (cookies: Record<string, string>): string => {
  const browserId = (cookies._ntes_nuid ?? '').replace(/[^a-f\d]/giu, '').toUpperCase();
  const sessionId = cookies.MUSIC_U || cookies.MUSIC_A || '';
  const sessionDeviceId = sessionId ? CryptoJS.SHA256(sessionId).toString().toUpperCase() : '';
  return cookies.deviceId
    || (browserId.length >= 52 ? browserId.slice(0, 52) : '')
    || (sessionDeviceId ? sessionDeviceId.slice(0, 52) : randomHex(52));
};

const eapiEncrypt = (path: string, value: object): string => {
  const text = JSON.stringify(value);
  const digest = CryptoJS.MD5(`nobody${path}use${text}md5forencrypt`).toString();
  const data = `${path}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  return CryptoJS.AES.encrypt(
    CryptoJS.enc.Utf8.parse(data),
    CryptoJS.enc.Utf8.parse(neteaseEapiKey),
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
  ).ciphertext.toString().toUpperCase();
};

const directEapiRequest = async <T>(
  path: string,
  params: Record<string, string | number>,
  cookie = '',
): Promise<ApiResponse<T>> => {
  const now = Date.now();
  const currentCookies = cookieValues(cookie);
  const deviceId = stableDeviceId(currentCookies);
  const header: Record<string, string> = {
    __csrf: currentCookies.__csrf || '',
    appver: '9.0.90',
    buildver: String(Math.floor(now / 1000)),
    channel: 'distribution',
    deviceId,
    mobilename: '',
    os: 'iPhone OS',
    osver: '16.2',
    requestId: `${now}_${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}`,
    resolution: '1920x1080',
    versioncode: '140',
  };
  if (currentCookies.MUSIC_U) header.MUSIC_U = currentCookies.MUSIC_U;
  if (currentCookies.MUSIC_A) header.MUSIC_A = currentCookies.MUSIC_A;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${neteaseEapiBaseUrl}/eapi/${path.slice('/api/'.length)}`, {
      body: new URLSearchParams({ params: eapiEncrypt(path, { ...params, e_r: false, header }) }).toString(),
      credentials: 'include',
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: Object.entries(header).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('; '),
        'User-Agent': neteaseIphoneUserAgent,
      },
      method: 'POST',
      signal: controller.signal,
    });
    const body = await response.json() as T & { code?: number; message?: string };
    const allowedLoginCode = body.code === 800 || body.code === 801 || body.code === 802 || body.code === 803;
    if (!response.ok || (typeof body.code === 'number' && body.code >= 400 && !allowedLoginCode)) {
      throw new Error(body.message || `HTTP ${response.status}`);
    }
    return {
      body,
      cookie: mergeCookies(cookie, `deviceId=${deviceId}`, cookieFromHeaders(response)),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const directRequest = async <T>(
  path: string,
  params: Record<string, string | number> = {},
  cookie = '',
): Promise<ApiResponse<T>> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const body = new URLSearchParams({ timestamp: String(Date.now()) });
  Object.entries(params).forEach(([key, value]) => body.set(key, String(value)));
  try {
    const response = await fetch(`${neteaseDirectApiBaseUrl}${path}`, {
      body: body.toString(),
      credentials: 'include',
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${neteaseDirectApiBaseUrl}/`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      method: 'POST',
      signal: controller.signal,
    });
    const value = await response.json() as T & { code?: number; message?: string };
    const allowedLoginCode = value.code === 800 || value.code === 801 || value.code === 802 || value.code === 803;
    if (!response.ok || (typeof value.code === 'number' && value.code >= 400 && !allowedLoginCode)) {
      throw new Error(value.message || `HTTP ${response.status}`);
    }
    return { body: value, cookie: cookieFromHeaders(response) };
  } finally {
    clearTimeout(timeout);
  }
};

const selfHostedRequest = async <T>(
  apiBaseUrl: string,
  path: string,
  params: Record<string, string | number> = {},
  cookie = '',
): Promise<ApiResponse<T>> => {
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
    const allowedLoginCode = body.code === 800 || body.code === 801 || body.code === 802 || body.code === 803;
    if (!response.ok || (typeof body.code === 'number' && body.code >= 400 && !allowedLoginCode)) {
      throw new Error(body.message || `HTTP ${response.status}`);
    }
    return { body, cookie: '' };
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

export const createNeteaseQrLogin = async (
  apiBaseUrl = neteaseDirectApiBaseUrl,
): Promise<{ cookie: string; key: string; qrUrl: string }> => {
  if (isDirectApi(apiBaseUrl)) {
    const response = await directEapiRequest<{ unikey?: string }>('/api/login/qrcode/unikey', { type: 3 });
    const key = response.body.unikey;
    if (!key) throw new Error('无法生成登录二维码');
    const deviceId = cookieValues(response.cookie).deviceId || `unknown-${Math.floor(Math.random() * 1e6)}`;
    const chainId = `v1_${deviceId}_web_login_${Date.now()}`;
    return {
      cookie: response.cookie,
      key,
      qrUrl: `${neteaseDirectApiBaseUrl}/login?codekey=${encodeURIComponent(key)}&chainId=${encodeURIComponent(chainId)}`,
    };
  }
  const keyResponse = await selfHostedRequest<{ data?: { unikey?: string } }>(apiBaseUrl, '/login/qr/key');
  const key = keyResponse.body.data?.unikey;
  if (!key) throw new Error('无法生成登录二维码');
  const qrResponse = await selfHostedRequest<{ data?: { qrurl?: string } }>(apiBaseUrl, '/login/qr/create', { key });
  const qrUrl = qrResponse.body.data?.qrurl;
  if (!qrUrl) throw new Error('无法生成登录二维码');
  return { cookie: '', key, qrUrl };
};

export const checkNeteaseQrLogin = async (
  apiBaseUrl: string,
  key: string,
  qrCookie = '',
): Promise<{ code?: number; cookie?: string; message?: string }> => {
  if (isDirectApi(apiBaseUrl)) {
    const response = await directEapiRequest<{ code?: number; message?: string }>(
      '/api/login/qrcode/client/login',
      { key, type: 3 },
      qrCookie,
    );
    return { ...response.body, cookie: mergeCookies(qrCookie, response.cookie) || undefined };
  }
  const response = await selfHostedRequest<{ code?: number; cookie?: string; message?: string }>(
    apiBaseUrl,
    '/login/qr/check',
    { key, noCookie: 'true' },
  );
  return response.body;
};

export const getNeteaseProfile = async (apiBaseUrl: string, cookie: string): Promise<NeteaseProfile> => {
  const response = isDirectApi(apiBaseUrl)
    ? await directRequest<{ profile?: { avatarUrl?: string; nickname?: string; userId?: number } }>('/api/nuser/account/get', {}, cookie)
    : await selfHostedRequest<{ profile?: { avatarUrl?: string; nickname?: string; userId?: number } }>(apiBaseUrl, '/user/account', {}, cookie);
  const profile = response.body.profile;
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
    const response = isDirectApi(apiBaseUrl) ? await directRequest<{
      more?: boolean;
      playlist?: Array<{ coverImgUrl?: string; id?: number; name?: string; trackCount?: number }>;
    }>('/api/user/playlist', { uid: userId, limit, offset, includeVideo: 'true' }, cookie) : await selfHostedRequest<{
      more?: boolean;
      playlist?: Array<{ coverImgUrl?: string; id?: number; name?: string; trackCount?: number }>;
    }>(apiBaseUrl, '/user/playlist', { uid: userId, limit, offset }, cookie);
    const page = response.body.playlist ?? [];
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
    more = response.body.more === true && page.length > 0;
    offset += page.length;
  }
  return Array.from(playlists.values());
};

export const getNeteasePlaylistTracks = async (
  apiBaseUrl: string,
  cookie: string,
  playlistId: string,
): Promise<EchoLinkTrackPreview[]> => {
  if (!isDirectApi(apiBaseUrl)) {
    const tracks = new Map<string, EchoLinkTrackPreview>();
    const limit = 500;
    let offset = 0;
    while (true) {
      const response = await selfHostedRequest<{ songs?: NeteaseSong[] }>(
        apiBaseUrl,
        '/playlist/track/all',
        { id: playlistId, limit, offset },
        cookie,
      );
      const songs = response.body.songs ?? [];
      const previousCount = tracks.size;
      songs.map(trackFromSong).filter((track): track is EchoLinkTrackPreview => Boolean(track)).forEach((track) => tracks.set(track.id, track));
      if (songs.length < limit || tracks.size === previousCount) break;
      offset += songs.length;
    }
    return Array.from(tracks.values());
  }
  const detail = await directRequest<{ playlist?: { trackIds?: Array<{ id?: number }> } }>(
    '/api/v6/playlist/detail',
    { id: playlistId, n: 100000, s: 8 },
    cookie,
  );
  const ids = (detail.body.playlist?.trackIds ?? []).map((item) => item.id).filter((id): id is number => Boolean(id));
  const tracks: EchoLinkTrackPreview[] = [];
  for (let offset = 0; offset < ids.length; offset += 500) {
    const chunk = ids.slice(offset, offset + 500);
    const response = await directRequest<{ songs?: NeteaseSong[] }>(
      '/api/v3/song/detail',
      { c: JSON.stringify(chunk.map((id) => ({ id }))) },
      cookie,
    );
    tracks.push(...(response.body.songs ?? []).map(trackFromSong).filter((track): track is EchoLinkTrackPreview => Boolean(track)));
  }
  return tracks;
};

export const searchNeteaseTracks = async (
  apiBaseUrl: string,
  cookie: string,
  keywords: string,
): Promise<EchoLinkTrackPreview[]> => {
  if (!keywords.trim()) return [];
  const response = isDirectApi(apiBaseUrl)
    ? await directRequest<{ result?: { songs?: NeteaseSong[] } }>('/api/cloudsearch/pc', { s: keywords.trim(), limit: 50, offset: 0, total: 'true', type: 1 }, cookie)
    : await selfHostedRequest<{ result?: { songs?: NeteaseSong[] } }>(apiBaseUrl, '/cloudsearch', { keywords: keywords.trim(), limit: 50, type: 1 }, cookie);
  return (response.body.result?.songs ?? []).map(trackFromSong).filter((track): track is EchoLinkTrackPreview => Boolean(track));
};

export const getNeteasePlaybackUrl = async (
  apiBaseUrl: string,
  cookie: string,
  trackId: string,
): Promise<string> => {
  const response = isDirectApi(apiBaseUrl)
    ? await directRequest<{ data?: Array<{ url?: string | null }> }>('/api/song/enhance/player/url/v1', { ids: `[${trackId}]`, level: 'exhigh', encodeType: 'flac' }, cookie)
    : await selfHostedRequest<{ data?: Array<{ url?: string | null }> }>(apiBaseUrl, '/song/url/v1', { id: trackId, level: 'exhigh' }, cookie);
  const url = response.body.data?.[0]?.url;
  if (!url) throw new Error('该歌曲当前不可播放，可能受版权或会员权限限制');
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url;
};
