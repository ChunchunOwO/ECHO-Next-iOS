import AsyncStorage from '@react-native-async-storage/async-storage';

export type SavedLocalMusicState = {
  echoFavoriteTrackIds: string[];
  echoRecentTrackIds: string[];
  favoriteTrackIds: string[];
  playlists: SavedPlaylist[];
  queueActive: boolean;
  queueTrackIds: string[];
  recentTrackIds: string[];
};

export type SavedPlaylistTrack = {
  album: string;
  albumArtist: string;
  artist: string;
  artworkUrl: string | null;
  canPlayOnPhone: boolean;
  durationMs: number;
  id: string;
  source: 'echo' | 'local' | 'remote';
  sourceLabel: string;
  title: string;
};

export type SavedPlaylist = {
  createdAt: number;
  favorite: boolean;
  id: string;
  name: string;
  pinned: boolean;
  tracks: SavedPlaylistTrack[];
};

const storageKey = 'echo.ios.localMusic.v1';

const emptyState: SavedLocalMusicState = {
  echoFavoriteTrackIds: [],
  echoRecentTrackIds: [],
  favoriteTrackIds: [],
  playlists: [],
  queueActive: false,
  queueTrackIds: [],
  recentTrackIds: [],
};

const stringArray = (value: unknown): string[] => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
);

const playlists = (value: unknown): SavedPlaylist[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const playlist = item as Partial<SavedPlaylist>;
    if (typeof playlist.id !== 'string' || typeof playlist.name !== 'string') return [];
    const tracks = Array.isArray(playlist.tracks) ? playlist.tracks.flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const track = value as Partial<SavedPlaylistTrack>;
      if (typeof track.id !== 'string' || typeof track.title !== 'string' || (track.source !== 'echo' && track.source !== 'local' && track.source !== 'remote')) return [];
      return [{
        album: typeof track.album === 'string' ? track.album : '',
        albumArtist: typeof track.albumArtist === 'string' ? track.albumArtist : '',
        artist: typeof track.artist === 'string' ? track.artist : '',
        artworkUrl: typeof track.artworkUrl === 'string' ? track.artworkUrl : null,
        canPlayOnPhone: track.canPlayOnPhone === true,
        durationMs: typeof track.durationMs === 'number' ? track.durationMs : 0,
        id: track.id,
        source: track.source,
        sourceLabel: typeof track.sourceLabel === 'string' ? track.sourceLabel : track.source,
        title: track.title,
      }];
    }) : [];
    return [{
      createdAt: typeof playlist.createdAt === 'number' ? playlist.createdAt : 0,
      favorite: playlist.favorite === true,
      id: playlist.id,
      name: playlist.name,
      pinned: playlist.pinned === true,
      tracks,
    }];
  });
};

export const loadSavedLocalMusicState = async (): Promise<SavedLocalMusicState> => {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) {
      return emptyState;
    }
    const parsed = JSON.parse(raw) as Partial<SavedLocalMusicState>;
    return {
      echoFavoriteTrackIds: stringArray(parsed.echoFavoriteTrackIds),
      echoRecentTrackIds: stringArray(parsed.echoRecentTrackIds),
      favoriteTrackIds: stringArray(parsed.favoriteTrackIds),
      playlists: playlists(parsed.playlists),
      queueActive: parsed.queueActive === true || stringArray(parsed.queueTrackIds).length > 0,
      queueTrackIds: stringArray(parsed.queueTrackIds),
      recentTrackIds: stringArray(parsed.recentTrackIds),
    };
  } catch {
    return emptyState;
  }
};

export const saveLocalMusicState = async (state: SavedLocalMusicState): Promise<void> => {
  await AsyncStorage.setItem(storageKey, JSON.stringify(state));
};
