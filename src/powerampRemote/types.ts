export type PowerampRemotePlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';

export type PowerampRemoteTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  artworkUrl: string | null;
  durationMs: number;
  sourceLabel: string;
  canPlayOnPhone: boolean;
  codec?: string | null;
  sampleRate?: number | null;
  bitDepth?: number | null;
  bitrate?: number | null;
  trackNo?: number | null;
  discNo?: number | null;
};

export type PowerampRemoteAlbum = {
  id: string;
  title: string;
  albumArtist: string;
  artworkUrl: string | null;
  trackCount: number;
  durationMs: number;
  sourceLabel: string;
  year: number | null;
};

export type PowerampRemoteStatus = {
  device: { id: string; name: string };
  playback: {
    state: PowerampRemotePlaybackState;
    track: PowerampRemoteTrack | null;
    positionMs: number;
    durationMs: number;
    volume: number;
    outputMode: string;
    updatedAtEpochMs: number;
  };
};

export type PowerampRemoteLibraryTracksResponse = {
  tracks: PowerampRemoteTrack[];
  totalCount: number;
};

export type PowerampRemoteLibraryAlbumsResponse = {
  albums: PowerampRemoteAlbum[];
  totalCount: number;
};

export type PowerampRemoteStreamResponse = {
  streamUrl: string;
  expiresAtEpochMs: number;
  track: PowerampRemoteTrack;
};

export type PowerampRemoteCommand =
  | { command: 'playPause' }
  | { command: 'next' }
  | { command: 'previous' }
  | { command: 'stop' }
  | { command: 'seekTo'; positionMs: number }
  | { command: 'setVolume'; volume: number }
  | { command: 'playTrack'; trackId: string };
