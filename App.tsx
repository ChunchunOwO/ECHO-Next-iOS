import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactElement, type ReactNode } from 'react';
import {
  Alert,
  Animated,
  Easing,
  GestureResponderEvent,
  Image as RNImage,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { BlurView } from 'expo-blur';
import * as FileSystem from 'expo-file-system/legacy';
import {
  echoAudioDsp,
  EchoNativeEqLauncherView,
  EchoNativePlayerView,
  type EchoAudioDspRemoteCommand,
  type EchoAudioDspStatus,
  type EchoNativeAction,
} from 'echo-audio-dsp';
import {
  createEchoLinkClient,
  EchoLinkHttpError,
  EchoLinkNetworkError,
  normalizeEchoLinkHost,
  normalizeEchoLinkToken,
  type EchoLinkClient,
  type EchoLinkConnection,
} from './src/echoLink/client';
import type { EchoLinkAlbumPreview, EchoLinkStatusResponse, EchoLinkTrackPreview } from './src/echoLink/types';
import { parsePairingUri } from './src/echoLink/pairing';
import {
  createPowerampRemoteClient,
  normalizePowerampRemoteHost,
  normalizePowerampRemoteToken,
  type PowerampRemoteClient,
  type PowerampRemoteConnection,
} from './src/powerampRemote/client';
import { parsePowerampPairingUri } from './src/powerampRemote/pairing';
import type { PowerampRemoteAlbum, PowerampRemoteStatus, PowerampRemoteTrack } from './src/powerampRemote/types';
import {
  deleteLocalMusicTrack,
  getLocalMusicStorageUsage,
  importLocalLyricFile,
  importLocalMusicFiles,
  readLocalLyrics,
  scanLocalMusic,
  type LocalMusicTrack,
} from './src/localMusic/library';
import { loadSavedConnection, saveConnection } from './src/storage/connectionStore';
import {
  loadSavedLocalMusicState,
  saveLocalMusicState,
  type SavedPlaylist,
  type SavedPlaylistTrack,
} from './src/storage/localMusicStore';
import { loadSavedSettings, saveSettings, type SavedSettings } from './src/storage/settingsStore';
import { loadPowerampRemoteState, savePowerampRemoteState } from './src/storage/powerampRemoteStore';
import { SuperconIcon } from './src/components/SuperconIcon';
import {
  checkNeteaseQrLogin,
  createNeteaseQrLogin,
  getNeteasePlaybackUrl,
  getNeteasePlaylistTracks,
  getNeteasePlaylists,
  getNeteaseProfile,
  neteaseDirectApiBaseUrl,
  normalizeNeteaseApiBaseUrl,
  searchNeteaseTracks,
  type NeteasePlaylist,
  type NeteaseProfile,
} from './src/streaming/netease';
import {
  clearNeteaseSession,
  loadNeteaseSession,
  loadStreamingPreferences,
  saveNeteaseSession,
  saveStreamingPreferences,
} from './src/storage/streamingStore';

type AppPage = 'control' | 'library' | 'search' | 'connect' | 'settings';
type ConnectPanelMode = 'echo' | 'remote' | 'streaming';
type PlaybackOutputMode = 'local' | 'pc' | 'phone' | 'remoteControl' | 'remoteStream' | 'streaming';
type LibraryFilter = 'all' | 'streamable' | 'local';
type LibrarySource = 'all' | 'echo' | 'local' | 'remote' | 'streaming';
type LibraryAlbumSort = 'artist' | 'default' | 'duration' | 'title' | 'track';
type StreamingLibraryMode = 'playlists' | 'search';
type EchoLibraryView = 'albums' | 'artists' | 'favorites' | 'recent' | 'songs';
type LibraryCollectionPreview = {
  artworkUrl: string | null;
  id: string;
  query: string;
  subtitle: string;
  title: string;
};
type LocalLibraryView = 'albums' | 'artists' | 'favorites' | 'formats' | 'recent' | 'songs';
type SettingsSectionKey = 'audioTags' | 'externalData' | 'interface' | 'library' | 'playback' | 'remote' | 'storage';
type EqPreset = 'bass' | 'clarity' | 'custom' | 'flat' | 'lateNight' | 'vocal' | 'warm';
type AppLanguage = 'zh' | 'en';
type AudioTagKey = 'output' | 'source' | 'streamability' | 'quality' | 'bitrate' | 'duration';
type AudioTagVisibility = Record<AudioTagKey, boolean>;
type PendingPcSeek = {
  positionMs: number;
  requestedAtMs: number;
  trackId: string | null;
};
type ExternalTrackMetadata = {
  albumArt: string | null;
  artist: string | null;
  error: string | null;
  lyrics: string | null;
  sourceTitle: string | null;
  status: 'error' | 'loading' | 'ready';
};
type ExternalMetadataSource = 'lrcapi' | 'lrclib' | 'netease';
type ExternalDataSelectionMode = 'ask' | 'automatic';
type NeteaseAccessMode = 'direct' | 'selfHosted';
type ExternalMetadataField = 'albumArt' | 'artist' | 'lyrics';
const externalMetadataFields: ExternalMetadataField[] = ['lyrics', 'artist', 'albumArt'];
type ExternalMetadataCandidate = {
  albumArt: string | null;
  artist: string | null;
  id: string;
  lyrics: string | null;
  source: ExternalMetadataSource;
  sourceLabel: string;
  title: string;
};
type PendingExternalMetadataSelection = {
  candidates: ExternalMetadataCandidate[];
  id: string;
  metadataKey: string;
};
type PlaybackListTrack = EchoLinkTrackPreview & { source?: 'echo' | 'local' | 'remote' | 'streaming' };
type MotionKey = boolean | number | string | null | undefined;
type AnimatedButtonContentProps = {
  children: ReactNode;
  motionKey: MotionKey;
  style?: StyleProp<ViewStyle>;
};

const eqFrequencyLabels = ['31', '63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'] as const;
const eqGainMin = -12;
const eqGainMax = 12;
const eqGainStep = 0.5;

const clampEqGain = (gain: number): number => (
  Math.max(eqGainMin, Math.min(eqGainMax, Math.round(gain / eqGainStep) * eqGainStep))
);

const normalizeEqGains = (gains: number[] | null | undefined): number[] => (
  eqFrequencyLabels.map((_, index) => clampEqGain(Number.isFinite(gains?.[index]) ? gains![index]! : 0))
);

const gainForEqPosition = (locationY: number, trackHeight: number): number => (
  clampEqGain(eqGainMax - (Math.max(0, Math.min(trackHeight, locationY)) / trackHeight) * (eqGainMax - eqGainMin))
);

const formatEqGain = (gain: number): string => `${gain > 0 ? '+' : ''}${gain.toFixed(1)}`;
const formatEqFrequency = (label: string): string => (
  label.endsWith('k') ? `${label.slice(0, -1)} kHz` : `${label} Hz`
);

const EqBandSlider = ({
  gain,
  label,
  onChange,
  onFocus,
  trackHeight,
}: {
  gain: number;
  label: string;
  onChange: (gain: number) => void;
  onFocus: () => void;
  trackHeight: number;
}): ReactElement => {
  const onChangeRef = useRef(onChange);
  const onFocusRef = useRef(onFocus);
  onChangeRef.current = onChange;
  onFocusRef.current = onFocus;

  const updateGain = useCallback((locationY: number) => {
    onFocusRef.current();
    onChangeRef.current(gainForEqPosition(locationY, trackHeight));
  }, [trackHeight]);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => updateGain(event.nativeEvent.locationY),
    onPanResponderMove: (event) => updateGain(event.nativeEvent.locationY),
    onPanResponderTerminationRequest: () => false,
    onStartShouldSetPanResponder: () => true,
  }), [updateGain]);
  const knobTop = ((eqGainMax - gain) / (eqGainMax - eqGainMin)) * trackHeight;
  const center = trackHeight / 2;

  return (
    <View style={styles.eqEditorBand}>
      <View
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        accessibilityLabel={`${label} ${formatEqGain(gain)} dB`}
        accessibilityRole="adjustable"
        accessibilityValue={{ max: eqGainMax, min: eqGainMin, now: gain, text: `${formatEqGain(gain)} dB` }}
        onAccessibilityAction={(event) => {
          const delta = event.nativeEvent.actionName === 'increment' ? eqGainStep : -eqGainStep;
          onFocus();
          onChange(clampEqGain(gain + delta));
        }}
        style={[styles.eqBandTouch, { height: trackHeight }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.eqBandTrack} />
        <View
          style={[
            styles.eqBandActiveTrack,
            {
              height: Math.max(2, Math.abs(knobTop - center)),
              top: Math.min(knobTop, center),
            },
          ]}
        />
        <View style={[styles.eqBandKnob, { top: knobTop - 6 }]} />
      </View>
      <Text style={styles.eqFrequencyLabel}>{label}</Text>
    </View>
  );
};

const AnimatedButtonContent = ({ children, motionKey, style }: AnimatedButtonContentProps): ReactElement => {
  const transition = useRef(new Animated.Value(1)).current;
  const latestChildrenRef = useRef<ReactNode>(children);
  const lastMotionKeyRef = useRef<MotionKey>(motionKey);
  const [previousChildren, setPreviousChildren] = useState<ReactNode | null>(null);

  useEffect(() => {
    if (!Object.is(lastMotionKeyRef.current, motionKey)) {
      setPreviousChildren(latestChildrenRef.current);
      lastMotionKeyRef.current = motionKey;
      transition.setValue(0);
      Animated.timing(transition, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setPreviousChildren(null);
        }
      });
    }
    latestChildrenRef.current = children;
  }, [children, motionKey, transition]);

  return (
    <View style={styles.buttonMotionShell}>
      {previousChildren ? (
        <Animated.View
          pointerEvents="none"
          style={[
            style,
            styles.buttonMotionExitLayer,
            {
              opacity: transition.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
              }),
              transform: [
                {
                  scale: transition.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0.96],
                  }),
                },
              ],
            },
          ]}
        >
          {previousChildren}
        </Animated.View>
      ) : null}
      <Animated.View
        style={[
          style,
          {
            opacity: transition,
            transform: [
              {
                scale: transition.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.88, 1],
                }),
              },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
};

const SettingsReveal = ({ children, motionKey }: { children: ReactNode; motionKey: MotionKey }): ReactElement => {
  const transition = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    transition.setValue(0);
    Animated.timing(transition, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [motionKey, transition]);

  return (
    <Animated.View
      style={[
        styles.settingsReveal,
        {
          opacity: transition,
          transform: [
            {
              translateY: transition.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

const appPages: AppPage[] = ['control', 'library', 'connect', 'settings'];
const defaultAudioTagVisibility: AudioTagVisibility = {
  bitrate: true,
  duration: true,
  output: true,
  quality: true,
  source: true,
  streamability: true,
};
const audioTagOptions: Array<{
  descriptionEn: string;
  descriptionZh: string;
  key: AudioTagKey;
  labelEn: string;
  labelZh: string;
}> = [
  { key: 'output', labelZh: '输出模式', labelEn: 'Output', descriptionZh: 'WASAPI / ASIO / 串流', descriptionEn: 'WASAPI / ASIO / Stream' },
  { key: 'source', labelZh: '来源', labelEn: 'Source', descriptionZh: 'Local / Remote', descriptionEn: 'Local / Remote' },
  { key: 'streamability', labelZh: '串流能力', labelEn: 'Streamable', descriptionZh: '可串流 / 仅控制', descriptionEn: 'Streamable / Control only' },
  { key: 'quality', labelZh: '格式音质', labelEn: 'Quality', descriptionZh: 'FLAC 48kHz/24bit', descriptionEn: 'FLAC 48kHz/24bit' },
  { key: 'bitrate', labelZh: '码率', labelEn: 'Bitrate', descriptionZh: '921kbps', descriptionEn: '921kbps' },
  { key: 'duration', labelZh: '时长', labelEn: 'Duration', descriptionZh: '曲库列表显示', descriptionEn: 'Shown in library rows' },
];
const localLibraryViewOptions: LocalLibraryView[] = [
  'songs',
  'albums',
  'artists',
  'formats',
  'favorites',
  'recent',
];
const echoLibraryViewOptions: EchoLibraryView[] = ['songs', 'albums', 'artists', 'favorites', 'recent'];
const eqPresetOptions: Array<{
  descriptionEn: string;
  descriptionZh: string;
  gains: number[];
  key: EqPreset;
  labelEn: string;
  labelZh: string;
}> = [
  { key: 'flat', labelZh: '平直', labelEn: 'Flat', descriptionZh: '不强调任何频段', descriptionEn: 'Neutral response', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { key: 'bass', labelZh: '低频', labelEn: 'Bass', descriptionZh: '增强低频和律动感', descriptionEn: 'More low-end weight', gains: [6, 5, 4, 3, 1, 0, -1, -1, 0, 1] },
  { key: 'vocal', labelZh: '人声', labelEn: 'Vocal', descriptionZh: '突出人声和中频', descriptionEn: 'Forward vocal range', gains: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1] },
  { key: 'clarity', labelZh: '清晰', labelEn: 'Clarity', descriptionZh: '增强细节和空气感', descriptionEn: 'More detail and air', gains: [-2, -1, -1, 0, 1, 2, 3, 4, 5, 4] },
  { key: 'warm', labelZh: '暖声', labelEn: 'Warm', descriptionZh: '柔和高频，增加厚度', descriptionEn: 'Softer treble, fuller body', gains: [3, 4, 3, 2, 1, 0, -1, -2, -3, -3] },
  { key: 'lateNight', labelZh: '夜间', labelEn: 'Late Night', descriptionZh: '轻压动态，适合小音量', descriptionEn: 'Gentler late-night balance', gains: [-3, -2, -1, 1, 2, 2, 1, 0, -2, -4] },
];
const defaultEqOption = eqPresetOptions[0]!;

const defaultSettings: SavedSettings = {
  appLanguage: 'zh',
  artworkBackgroundEnabled: true,
  audioTagVisibility: defaultAudioTagVisibility,
  autoOpenLyricsForLocalTracks: true,
  autoQueueImportedLocalTracks: false,
  confirmBeforeDeletingLocalTracks: true,
  defaultLibrarySource: 'echo',
  defaultLocalLibraryView: 'songs',
  defaultPage: 'control',
  echoConnectionEnabled: false,
  eqGains: [...defaultEqOption.gains],
  eqPreset: 'flat',
  followSystemAppearance: true,
  externalMetadataSearchEnabled: false,
  externalMetadataSkipExisting: true,
  lrcApiExternalDataEnabled: false,
  lrclibExternalDataEnabled: false,
  externalDataSelectionMode: 'ask',
  neteaseAccessMode: 'direct',
  neteaseExternalDataEnabled: false,
  loudnessNormalizationEnabled: false,
  powerampRemoteEnabled: false,
  showPowerampRemoteConnection: false,
  showArtworkGlow: true,
  darkModeEnabled: false,
};

type LyricLine = {
  id: string;
  text: string;
  timeMs: number | null;
};

const formatTime = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const formatStorageSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  return `${bytes}B`;
};

const parseLyrics = (lyrics: string): LyricLine[] => {
  const lines = lyrics
    .split(/\r?\n/u)
    .map((line, index) => {
      const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/gu)];
      const text = line.replace(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/gu, '').trim();
      if (!text) {
        return [];
      }
      if (matches.length === 0) {
        return [{ id: `plain-${index}`, text, timeMs: null }];
      }
      return matches.map((match, matchIndex) => {
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        const fraction = match[3] ?? '0';
        const fractionMs = Number(fraction.padEnd(3, '0').slice(0, 3));
        return {
          id: `${minutes}-${seconds}-${fraction}-${index}-${matchIndex}`,
          text,
          timeMs: (minutes * 60 + seconds) * 1000 + fractionMs,
        };
      });
    })
    .flat()
    .sort((a, b) => (a.timeMs ?? Number.MAX_SAFE_INTEGER) - (b.timeMs ?? Number.MAX_SAFE_INTEGER));

  return lines.length > 0
    ? lines
    : [];
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const ratioFromGesture = (event: GestureResponderEvent, width: number): number => (
  width > 0 ? clamp01(event.nativeEvent.locationX / width) : 0
);

const formatSourceTag = (sourceLabel: string | null | undefined): string | null => {
  const value = sourceLabel?.trim();
  if (!value) {
    return null;
  }
  if (/local/iu.test(value)) {
    return 'Local';
  }
  if (/remote/iu.test(value)) {
    return 'Remote';
  }
  if (/stream/iu.test(value)) {
    return 'Streaming';
  }
  return value;
};

const formatOutputTag = (outputMode: string | null | undefined): string | null => {
  const value = outputMode?.trim();
  if (!value) {
    return null;
  }
  if (/asio/iu.test(value)) {
    return 'ASIO';
  }
  if (/wasapi|shared|exclusive/iu.test(value)) {
    return 'WASAPI';
  }
  if (/system/iu.test(value)) {
    return 'System';
  }
  return value;
};

const formatCodecTag = (codec: string | null | undefined): string | null => {
  const value = codec?.trim();
  return value ? value.toUpperCase() : null;
};

const formatSampleRateTag = (sampleRate: number | null | undefined): string | null => {
  if (!Number.isFinite(sampleRate) || !sampleRate || sampleRate <= 0) {
    return null;
  }
  const khz = sampleRate >= 1000 ? sampleRate / 1000 : sampleRate;
  return `${Number.isInteger(khz) ? khz.toFixed(0) : khz.toFixed(1)}kHz`;
};

const formatBitDepthTag = (bitDepth: number | null | undefined): string | null => {
  if (!Number.isFinite(bitDepth) || !bitDepth || bitDepth <= 0) {
    return null;
  }
  return `${Math.round(bitDepth)}Bit`;
};

const formatBitrateTag = (bitrate: number | null | undefined): string | null => {
  if (!Number.isFinite(bitrate) || !bitrate || bitrate <= 0) {
    return null;
  }
  const kbps = bitrate >= 1000 ? bitrate / 1000 : bitrate;
  return `${Math.round(kbps)}kbps`;
};

const formatQualityTag = (track: EchoLinkTrackPreview | null | undefined): string | null => {
  const sampleRate = formatSampleRateTag(track?.sampleRate);
  const bitDepth = formatBitDepthTag(track?.bitDepth);
  if (sampleRate && bitDepth) {
    return `${sampleRate}/${bitDepth}`;
  }
  return sampleRate ?? bitDepth;
};

const formatAudioQualityTag = (track: EchoLinkTrackPreview | null | undefined): string | null => {
  const codec = formatCodecTag(track?.codec);
  const quality = formatQualityTag(track);
  if (codec && quality) {
    return `${codec} ${quality}`;
  }
  return codec ?? quality;
};

const tagsForTrack = (
  track: EchoLinkTrackPreview | null | undefined,
  options: {
    includeDuration?: boolean;
    outputMode?: string | null;
    visibleAudioTags?: AudioTagVisibility;
  } = {},
): string[] => {
  const visibleTags = options.visibleAudioTags ?? defaultAudioTagVisibility;
  const tags = [
    visibleTags.output ? formatOutputTag(options.outputMode) : null,
    visibleTags.source ? formatSourceTag(track?.sourceLabel) : null,
    visibleTags.streamability && track ? (track.canPlayOnPhone ? '可串流' : '仅控制') : null,
    ...(visibleTags.quality ? [formatCodecTag(track?.codec), formatQualityTag(track)] : []),
    visibleTags.bitrate ? formatBitrateTag(track?.bitrate) : null,
    visibleTags.duration && options.includeDuration && track ? formatTime(track.durationMs) : null,
  ];
  return tags.filter((tag): tag is string => Boolean(tag && tag.trim()));
};

const normalizeExternalLookupValue = (value: string | null | undefined): string => (
  (value ?? '')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase()
);

const externalMetadataKeyForTrack = (track: EchoLinkTrackPreview | null | undefined): string | null => {
  const title = normalizeExternalLookupValue(track?.title);
  if (!title) {
    return null;
  }
  return `${title}::${normalizeExternalLookupValue(track?.artist)}`;
};

const playlistTrackFromPreview = (
  track: EchoLinkTrackPreview,
  source: 'echo' | 'local' | 'remote',
): SavedPlaylistTrack => ({
  album: track.album,
  albumArtist: track.albumArtist,
  artist: track.artist,
  artworkUrl: track.artworkUrl,
  canPlayOnPhone: track.canPlayOnPhone,
  durationMs: track.durationMs,
  id: track.id,
  source,
  sourceLabel: track.sourceLabel,
  title: track.title,
});

const moveItem = <T,>(items: T[], index: number, direction: -1 | 1): T[] => {
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item === undefined) return items;
  next.splice(targetIndex, 0, item);
  return next;
};

const normalizedNeteaseOrigin = (value: string): string => {
  if (!value.trim()) return '';
  try {
    return normalizeNeteaseApiBaseUrl(value);
  } catch {
    return '';
  }
};

const sortTracksBy = <T extends EchoLinkTrackPreview>(
  tracks: T[],
  label: (track: T) => string,
): T[] => [...tracks].sort((a, b) => label(a).localeCompare(label(b)) || a.title.localeCompare(b.title));

const sortTracksByAlbumOrder = <T extends EchoLinkTrackPreview>(tracks: T[]): T[] => (
  [...tracks].sort((left, right) => {
    const disc = (left.discNo ?? 1) - (right.discNo ?? 1);
    if (disc) return disc;
    const track = (left.trackNo ?? Number.MAX_SAFE_INTEGER) - (right.trackNo ?? Number.MAX_SAFE_INTEGER);
    return track || left.title.localeCompare(right.title);
  })
);

const buildTrackCollections = <T extends EchoLinkTrackPreview>(
  tracks: T[],
  titleForTrack: (track: T) => string | string[],
  idForTitle: (title: string) => string,
  subtitleForCount: (count: number) => string,
  artworkForTitle?: (title: string) => string | null,
): LibraryCollectionPreview[] => {
  const groups = new Map<string, T[]>();
  tracks.forEach((track) => {
    const titles = titleForTrack(track);
    (Array.isArray(titles) ? titles : [titles]).forEach((title) => {
      const group = groups.get(title);
      if (group) group.push(track);
      else groups.set(title, [track]);
    });
  });
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([title, items]) => ({
    artworkUrl: artworkForTitle?.(title) ?? items.find((item) => item.artworkUrl)?.artworkUrl ?? null,
    id: idForTitle(title),
    query: title,
    subtitle: subtitleForCount(items.length),
    title,
  }));
};

const artistNamesForTrack = (track: EchoLinkTrackPreview, fallback: string): string[] => {
  const names = track.artist
    ?.split(/\s*(?:,|;|，|；|、)\s*|\s+\/\s+/)
    .map((name) => name.trim())
    .filter(Boolean) ?? [];
  return names.length > 0 ? [...new Set(names)] : [fallback];
};

const fetchAllPages = async <T extends { id: string }>(
  fetchPage: (page: number, pageSize: number) => Promise<{ items: T[] }>,
): Promise<T[]> => {
  const items = new Map<string, T>();
  let pageSize = 100;
  let page = 1;
  const maxPages = 500;

  // Match an older server's first-page cap so subsequent page offsets stay contiguous.
  // Continue until the endpoint is exhausted instead of trusting a possibly capped total.
  while (page <= maxPages) {
    let response: { items: T[] };
    try {
      response = await fetchPage(page, pageSize);
    } catch (error) {
      if (page > 1 && error instanceof EchoLinkHttpError && [400, 404, 416].includes(error.statusCode)) {
        break;
      }
      throw error;
    }
    if (page === 1 && response.items.length > 0 && response.items.length < pageSize) {
      pageSize = response.items.length;
    }
    const previousSize = items.size;
    response.items.forEach((item) => items.set(item.id, item));
    if (response.items.length === 0 || items.size === previousSize) break;
    page += 1;
  }
  return Array.from(items.values());
};

const fetchAllEchoTracks = (client: EchoLinkClient): Promise<EchoLinkTrackPreview[]> => (
  fetchAllPages(async (page, pageSize) => {
    const response = await client.getLibraryTracks({ page, pageSize });
    return { items: response.tracks, totalCount: response.totalCount };
  })
);

const fetchAllEchoAlbums = (client: EchoLinkClient): Promise<EchoLinkAlbumPreview[]> => (
  fetchAllPages(async (page, pageSize) => {
    const response = await client.getLibraryAlbums({ page, pageSize });
    return { items: response.albums, totalCount: response.totalCount };
  })
);

const fetchAllPowerampTracks = (client: PowerampRemoteClient): Promise<PowerampRemoteTrack[]> => (
  fetchAllPages(async (page, pageSize) => {
    const response = await client.getLibraryTracks({ page, pageSize });
    return { items: response.tracks, totalCount: response.totalCount };
  })
);

const fetchAllPowerampAlbums = (client: PowerampRemoteClient): Promise<PowerampRemoteAlbum[]> => (
  fetchAllPages(async (page, pageSize) => {
    const response = await client.getLibraryAlbums({ page, pageSize });
    return { items: response.albums, totalCount: response.totalCount };
  })
);

const fetchJson = async <T,>(url: string, headers: Record<string, string> = {}): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json,text/plain,*/*',
      'User-Agent': 'ECHO-iPhone/0.5.0',
      ...headers,
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
};

type LrclibSearchItem = {
  artistName?: string;
  id?: number;
  name?: string;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  trackName?: string;
};

type ExternalMetadataMatch = {
  albumArt: string | null;
  artist: string | null;
  candidateKey: string;
  lyrics: string | null;
  sourceTitle: string | null;
};

const lookupLrclibMetadata = async (track: EchoLinkTrackPreview): Promise<ExternalMetadataMatch[]> => {
  const params = new URLSearchParams({
    artist_name: track.artist ?? '',
    track_name: track.title ?? '',
  });
  const results = await fetchJson<LrclibSearchItem[]>(`https://lrclib.net/api/search?${params.toString()}`);
  const title = normalizeExternalLookupValue(track.title);
  const artist = normalizeExternalLookupValue(track.artist);
  return results
    .filter((item) => item.syncedLyrics || item.plainLyrics)
    .sort((a, b) => {
      const score = (item: LrclibSearchItem) => (
        (normalizeExternalLookupValue(item.trackName ?? item.name) === title ? 4 : 0)
        + (artist && normalizeExternalLookupValue(item.artistName).includes(artist) ? 2 : 0)
      );
      return score(b) - score(a);
    })
    .slice(0, 2)
    .map((item, index) => ({
      albumArt: null,
      artist: item.artistName ?? null,
      candidateKey: String(item.id ?? index),
      lyrics: item.syncedLyrics ?? item.plainLyrics ?? null,
      sourceTitle: item.trackName ?? item.name ?? null,
    }));
};

type LrcApiSearchItem = {
  artist?: string;
  cover?: string;
  cover_format?: string;
  lrc?: string;
  lyrics?: string;
  title?: string;
};

const lookupLrcApiMetadata = async (track: EchoLinkTrackPreview): Promise<ExternalMetadataMatch[]> => {
  const params = new URLSearchParams({
    album: track.album ?? '',
    artist: track.artist ?? '',
    title: track.title ?? '',
  });
  const results = await fetchJson<LrcApiSearchItem[]>(`https://api.lrc.cx/jsonapi?${params.toString()}`);
  const title = normalizeExternalLookupValue(track.title);
  const artist = normalizeExternalLookupValue(track.artist);
  const usable = results.filter((item) => item.cover || item.lrc || item.lyrics);
  return usable
    .sort((a, b) => {
      const score = (item: LrcApiSearchItem) => (
        (normalizeExternalLookupValue(item.title) === title ? 4 : 0)
        + (artist && normalizeExternalLookupValue(item.artist).includes(artist) ? 2 : 0)
      );
      return score(b) - score(a);
    })
    .slice(0, 2)
    .map((item, index) => ({
      albumArt: item.cover ?? item.cover_format?.replace('{w}', '1200').replace('{h}', '1200') ?? null,
      artist: item.artist ?? null,
      candidateKey: `${normalizeExternalLookupValue(item.title)}:${normalizeExternalLookupValue(item.artist)}:${index}`,
      lyrics: item.lrc?.trim() || item.lyrics?.trim() || null,
      sourceTitle: item.title ?? null,
    }));
};

type NeteaseSearchResponse = {
  result?: {
    songs?: NeteaseSearchSong[];
  };
};
type NeteaseSearchSong = {
  artists?: Array<{ name?: string }>;
  id?: number;
  name?: string;
};

type NeteaseDetailResponse = {
  songs?: Array<{
    album?: {
      picUrl?: string;
    };
    name?: string;
  }>;
};

type NeteaseLyricResponse = {
  lrc?: {
    lyric?: string;
  };
};
type NeteaseMediaResponse = {
  lyric?: string;
};

const scoreNeteaseSong = (track: EchoLinkTrackPreview, song: NeteaseSearchSong): number => {
  const trackTitle = normalizeExternalLookupValue(track.title);
  const trackArtist = normalizeExternalLookupValue(track.artist);
  const songTitle = normalizeExternalLookupValue(song.name);
  const songArtists = normalizeExternalLookupValue(song.artists?.map((artist) => artist.name).filter(Boolean).join(' '));
  let score = 0;

  if (songTitle === trackTitle) {
    score += 20;
  } else if (songTitle.includes(trackTitle)) {
    score += 12;
  } else if (trackTitle.includes(songTitle)) {
    score += 8;
  }

  if (trackArtist) {
    if (songArtists === trackArtist) {
      score += 12;
    } else if (songArtists.includes(trackArtist) || trackArtist.includes(songArtists)) {
      score += 8;
    }
  }

  return score;
};

const lookupNeteaseMetadata = async (
  track: EchoLinkTrackPreview,
  options: { includeLyrics?: boolean } = {},
): Promise<ExternalMetadataMatch[]> => {
  const query = [track.title, track.artist].filter(Boolean).join(' ');
  if (!query.trim()) {
    return [];
  }

  const searchParams = new URLSearchParams({
    limit: '8',
    offset: '0',
    s: query,
    total: 'false',
    type: '1',
  });
  const neteaseHeaders = { Referer: 'https://music.163.com/' };
  const search = await fetchJson<NeteaseSearchResponse>(`https://music.163.com/api/search/get/web?${searchParams.toString()}`, neteaseHeaders);
  const songs = (search.result?.songs ?? [])
    .filter((item) => item.id)
    .sort((a, b) => scoreNeteaseSong(track, b) - scoreNeteaseSong(track, a))
    .slice(0, 2);

  const includeLyrics = options.includeLyrics ?? true;
  return Promise.all(songs.map(async (song): Promise<ExternalMetadataMatch> => {
    const [detailResult, lyricResult, mediaResult] = await Promise.allSettled([
      fetchJson<NeteaseDetailResponse>(`https://music.163.com/api/song/detail/?id=${song.id}&ids=${encodeURIComponent(`[${song.id}]`)}`, neteaseHeaders),
      includeLyrics
        ? fetchJson<NeteaseLyricResponse>(`https://music.163.com/api/song/lyric?id=${song.id}&lv=1&kv=1&tv=-1`, neteaseHeaders)
        : Promise.resolve<NeteaseLyricResponse>({}),
      includeLyrics
        ? fetchJson<NeteaseMediaResponse>(`https://music.163.com/api/song/media?id=${song.id}`, neteaseHeaders)
        : Promise.resolve<NeteaseMediaResponse>({}),
    ]);
    const detail = detailResult.status === 'fulfilled' ? detailResult.value : null;
    const lyric = lyricResult.status === 'fulfilled' ? lyricResult.value : null;
    const media = mediaResult.status === 'fulfilled' ? mediaResult.value : null;
    return {
      albumArt: detail?.songs?.[0]?.album?.picUrl ?? null,
      artist: song.artists?.map((artist) => artist.name).filter(Boolean).join(', ') || null,
      candidateKey: String(song.id),
      lyrics: lyric?.lrc?.lyric?.trim() || media?.lyric?.trim() || null,
      sourceTitle: song.name ?? detail?.songs?.[0]?.name ?? null,
    };
  }));
};

const lookupExternalMetadataCandidates = async (
  track: EchoLinkTrackPreview,
  sources: Record<ExternalMetadataSource, boolean>,
  options: { includeNeteaseLyrics?: boolean } = {},
): Promise<ExternalMetadataCandidate[]> => {
  const lookups: Array<Promise<{ source: ExternalMetadataSource; values: ExternalMetadataMatch[] }>> = [];
  if (sources.lrcapi) {
    lookups.push(lookupLrcApiMetadata(track).then((values) => ({ source: 'lrcapi', values })));
  }
  if (sources.lrclib) {
    lookups.push(lookupLrclibMetadata(track).then((values) => ({ source: 'lrclib', values })));
  }
  if (sources.netease) {
    lookups.push(lookupNeteaseMetadata(track, {
      includeLyrics: options.includeNeteaseLyrics ?? true,
    }).then((values) => ({ source: 'netease', values })));
  }

  const results = await Promise.allSettled(lookups);
  const fulfilled = results
    .filter((result): result is PromiseFulfilledResult<{ source: ExternalMetadataSource; values: ExternalMetadataMatch[] }> => result.status === 'fulfilled');
  if (lookups.length > 0 && fulfilled.length === 0) {
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    throw failure?.reason ?? new Error('External metadata lookup failed.');
  }
  const values = fulfilled
    .flatMap((result) => result.value.values.map((value) => ({ source: result.value.source, value })));
  if (values.length === 0) {
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
  const sourceLabels: Record<ExternalMetadataSource, string> = {
    lrcapi: 'LrcAPI',
    lrclib: 'LRCLIB',
    netease: 'NetEase Cloud Music',
  };
  return values
    .map(({ source, value }) => ({
      albumArt: value?.albumArt ?? null,
      artist: value?.artist ?? null,
      id: `${source}:${value.candidateKey}`,
      lyrics: value?.lyrics ?? null,
      source,
      sourceLabel: sourceLabels[source],
      title: value?.sourceTitle || track.title || sourceLabels[source],
    }))
    .filter((candidate) => Boolean(candidate.albumArt || candidate.artist || candidate.lyrics))
    .slice(0, 6);
};

const initialConnection: EchoLinkConnection = {
  host: '',
  port: 26789,
  token: '',
  name: 'PC ECHO',
  scheme: 'http',
};

type EchoLinkConnectionDraft = Omit<EchoLinkConnection, 'port'> & { port: string };
const connectionDraftFrom = (connection: EchoLinkConnection): EchoLinkConnectionDraft => ({
  ...connection,
  port: String(connection.port),
});

type PowerampRemoteConnectionDraft = Omit<PowerampRemoteConnection, 'port'> & { port: string };
const powerampConnectionDraftFrom = (
  connection: PowerampRemoteConnection | null,
): PowerampRemoteConnectionDraft => ({
  host: connection?.host ?? '',
  name: connection?.name ?? 'Poweramp',
  port: String(connection?.port ?? 27806),
  scheme: connection?.scheme ?? 'http',
  token: connection?.token ?? '',
});

const formatRequestError = (error: unknown): string => {
  if (error instanceof EchoLinkNetworkError) {
    return error.message;
  }
  if (error instanceof EchoLinkHttpError) {
    if (error.statusCode === 401) {
      return '认证失败：Token 不匹配。请在电脑端重新生成配对链接，或重新输入最新 token。';
    }
    if (error.statusCode === 403) {
      return '电脑端拒绝了请求：请确认手机和电脑在同一个局域网，且没有走蜂窝网络、访客 Wi-Fi、VPN 或热点隔离。';
    }
    return `${error.statusCode} ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
};

const formatPhoneAudioError = (error: unknown): string => {
  if (error instanceof EchoLinkHttpError && (error.statusCode === 409 || error.statusCode === 415)) {
    return '这首歌暂时不能在手机播放。请先用本地 MP3/AAC/M4A 等 iOS 友好的音频文件测试。';
  }
  return formatRequestError(error);
};

const dspStreamCacheDirectory = `${FileSystem.cacheDirectory ?? ''}echo-dsp-streams/`;

const extensionForDspCache = (track: EchoLinkTrackPreview, streamUrl = ''): string => {
  const codec = track.codec?.trim().toLowerCase();
  if (codec === 'mp3' || codec === 'flac' || codec === 'wav' || codec === 'aac') {
    return codec;
  }
  if (codec === 'alac' || codec === 'm4a' || codec === 'mp4') {
    return 'm4a';
  }
  const urlExtension = streamUrl.split(/[?#]/u, 1)[0]?.split('.').pop()?.toLowerCase();
  if (urlExtension && ['aac', 'flac', 'm4a', 'mp3', 'wav'].includes(urlExtension)) return urlExtension;
  return 'm4a';
};

const safeCacheToken = (value: string): string => (
  value.replace(/[^a-z0-9._-]/giu, '_').slice(0, 72) || `track-${Date.now()}`
);

const downloadStreamForDsp = async (
  streamUrl: string,
  track: EchoLinkTrackPreview,
  namespace: string,
): Promise<string> => {
  if (!FileSystem.cacheDirectory) {
    throw new Error('无法访问临时音频缓存目录。');
  }
  await FileSystem.makeDirectoryAsync(dspStreamCacheDirectory, { intermediates: true }).catch(() => undefined);
  const extension = extensionForDspCache(track, streamUrl);
  const uri = `${dspStreamCacheDirectory}${safeCacheToken(`${namespace}-${track.id}`)}.${extension}`;
  const markerUri = `${uri}.complete`;
  const temporaryUri = `${uri}.download`;
  const cached = await FileSystem.getInfoAsync(uri);
  const marker = await FileSystem.getInfoAsync(markerUri);
  if (cached.exists && marker.exists && (cached.size ?? 0) > 0) return uri;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  await FileSystem.deleteAsync(markerUri, { idempotent: true }).catch(() => undefined);
  await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => undefined);
  const result = await FileSystem.downloadAsync(streamUrl, temporaryUri);
  await FileSystem.moveAsync({ from: result.uri, to: uri });
  await FileSystem.writeAsStringAsync(markerUri, 'ok');
  return uri;
};

type ErrorBoundaryState = {
  error: Error | null;
};

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ECHO iPhone startup error', error, errorInfo.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>应用启动失败</Text>
            <Text style={styles.errorText}>{this.state.error.message}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }
}

function EchoLinkApp(): ReactElement {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const phonePlayer = useAudioPlayer(null, {
    keepAudioSessionActive: true,
    preferredForwardBufferDuration: 12,
    updateInterval: 250,
  });
  const phonePlayerStatus = useAudioPlayerStatus(phonePlayer);
  const [page, setPage] = useState<AppPage>('control');
  const [pageSlideDirection, setPageSlideDirection] = useState(1);
  const [connection, setConnection] = useState<EchoLinkConnection>(initialConnection);
  const [connectionDraft, setConnectionDraft] = useState<EchoLinkConnectionDraft>(() => connectionDraftFrom(initialConnection));
  const [connectPanelMode, setConnectPanelMode] = useState<ConnectPanelMode>('echo');
  const [pairingText, setPairingText] = useState('');
  const [status, setStatus] = useState<EchoLinkStatusResponse | null>(null);
  const [statusReceivedAtMs, setStatusReceivedAtMs] = useState(() => Date.now());
  const [powerampStatus, setPowerampStatus] = useState<PowerampRemoteStatus | null>(null);
  const [powerampStatusReceivedAtMs, setPowerampStatusReceivedAtMs] = useState(() => Date.now());
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [tracks, setTracks] = useState<EchoLinkTrackPreview[]>([]);
  const [albums, setAlbums] = useState<EchoLinkAlbumPreview[]>([]);
  const [powerampTracks, setPowerampTracks] = useState<PowerampRemoteTrack[]>([]);
  const [powerampAlbums, setPowerampAlbums] = useState<PowerampRemoteAlbum[]>([]);
  const [powerampConnection, setPowerampConnection] = useState<PowerampRemoteConnection | null>(null);
  const [powerampConnectionDraft, setPowerampConnectionDraft] = useState<PowerampRemoteConnectionDraft>(() => powerampConnectionDraftFrom(null));
  const [powerampBusy, setPowerampBusy] = useState(false);
  const [powerampError, setPowerampError] = useState<string | null>(null);
  const [localTracks, setLocalTracks] = useState<LocalMusicTrack[]>([]);
  const [localStorageBytes, setLocalStorageBytes] = useState(0);
  const [query, setQuery] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [librarySource, setLibrarySource] = useState<LibrarySource>('echo');
  const [libraryAlbumSort, setLibraryAlbumSort] = useState<LibraryAlbumSort>('default');
  const [libraryExpanded, setLibraryExpanded] = useState(false);
  const [libraryPageIndex, setLibraryPageIndex] = useState(0);
  const [selectedLibraryCollectionId, setSelectedLibraryCollectionId] = useState('');
  const [echoLibraryView, setEchoLibraryView] = useState<EchoLibraryView>('songs');
  const [powerampLibraryView, setPowerampLibraryView] = useState<EchoLibraryView>('songs');
  const [localLibraryView, setLocalLibraryView] = useState<LocalLibraryView>('songs');
  const [favoriteEchoTrackIds, setFavoriteEchoTrackIds] = useState<string[]>([]);
  const [recentEchoTrackIds, setRecentEchoTrackIds] = useState<string[]>([]);
  const [favoriteLocalTrackIds, setFavoriteLocalTrackIds] = useState<string[]>([]);
  const [recentLocalTrackIds, setRecentLocalTrackIds] = useState<string[]>([]);
  const [favoritePowerampTrackIds, setFavoritePowerampTrackIds] = useState<string[]>([]);
  const [recentPowerampTrackIds, setRecentPowerampTrackIds] = useState<string[]>([]);
  const [localQueueTrackIds, setLocalQueueTrackIds] = useState<string[]>([]);
  const [localQueueActive, setLocalQueueActive] = useState(false);
  const [playlists, setPlaylists] = useState<SavedPlaylist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [activePlaybackPlaylistId, setActivePlaybackPlaylistId] = useState<string | null>(null);
  const [neteaseAccessMode, setNeteaseAccessMode] = useState<NeteaseAccessMode>(defaultSettings.neteaseAccessMode);
  const [streamingApiInput, setStreamingApiInput] = useState('');
  const streamingApiBaseUrl = neteaseAccessMode === 'direct' ? neteaseDirectApiBaseUrl : streamingApiInput.trim();
  const [streamingCookie, setStreamingCookie] = useState('');
  const [streamingSessionOrigin, setStreamingSessionOrigin] = useState('');
  const [streamingProfile, setStreamingProfile] = useState<NeteaseProfile | null>(null);
  const [streamingPlaylists, setStreamingPlaylists] = useState<NeteasePlaylist[]>([]);
  const [streamingTracks, setStreamingTracks] = useState<EchoLinkTrackPreview[]>([]);
  const [streamingTrack, setStreamingTrack] = useState<EchoLinkTrackPreview | null>(null);
  const [streamingLibraryMode, setStreamingLibraryMode] = useState<StreamingLibraryMode>('search');
  const [streamingQrCookie, setStreamingQrCookie] = useState('');
  const [streamingQrKey, setStreamingQrKey] = useState('');
  const [streamingQrPollToken, setStreamingQrPollToken] = useState(0);
  const [streamingQrUrl, setStreamingQrUrl] = useState('');
  const [streamingStatusText, setStreamingStatusText] = useState('');
  const [streamingBusy, setStreamingBusy] = useState(false);
  const [favoriteStreamingPlaylistIds, setFavoriteStreamingPlaylistIds] = useState<string[]>([]);
  const [pinnedStreamingPlaylistIds, setPinnedStreamingPlaylistIds] = useState<string[]>([]);
  const [selectedStreamingPlaylistId, setSelectedStreamingPlaylistId] = useState<string | null>(null);
  const [streamingPreferencesLoaded, setStreamingPreferencesLoaded] = useState(false);
  const [powerampRemoteStateLoaded, setPowerampRemoteStateLoaded] = useState(false);
  const [localMusicStateLoaded, setLocalMusicStateLoaded] = useState(false);
  const [localLibraryLoaded, setLocalLibraryLoaded] = useState(false);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>('zh');
  const [audioTagVisibility, setAudioTagVisibility] = useState<AudioTagVisibility>(defaultAudioTagVisibility);
  const [defaultPage, setDefaultPage] = useState<AppPage>(defaultSettings.defaultPage);
  const [defaultLibrarySource, setDefaultLibrarySource] = useState<LibrarySource>(defaultSettings.defaultLibrarySource);
  const [defaultLocalLibraryView, setDefaultLocalLibraryView] = useState<LocalLibraryView>(defaultSettings.defaultLocalLibraryView);
  const [echoConnectionEnabled, setEchoConnectionEnabled] = useState(defaultSettings.echoConnectionEnabled);
  const [powerampRemoteEnabled, setPowerampRemoteEnabled] = useState(defaultSettings.powerampRemoteEnabled);
  const [showPowerampRemoteConnection, setShowPowerampRemoteConnection] = useState(defaultSettings.showPowerampRemoteConnection);
  const [autoOpenLyricsForLocalTracks, setAutoOpenLyricsForLocalTracks] = useState(defaultSettings.autoOpenLyricsForLocalTracks);
  const [autoQueueImportedLocalTracks, setAutoQueueImportedLocalTracks] = useState(defaultSettings.autoQueueImportedLocalTracks);
  const [confirmBeforeDeletingLocalTracks, setConfirmBeforeDeletingLocalTracks] = useState(defaultSettings.confirmBeforeDeletingLocalTracks);
  const [eqGains, setEqGains] = useState(() => normalizeEqGains(defaultSettings.eqGains));
  const [eqPreset, setEqPreset] = useState<EqPreset>(defaultSettings.eqPreset);
  const [followSystemAppearance, setFollowSystemAppearance] = useState(defaultSettings.followSystemAppearance);
  const [darkModeEnabled, setDarkModeEnabled] = useState(defaultSettings.darkModeEnabled);
  const [eqPanelOpen, setEqPanelOpen] = useState(false);
  const [eqPanelVisible, setEqPanelVisible] = useState(false);
  const [activeEqBand, setActiveEqBand] = useState(4);
  const [externalMetadataSearchEnabled, setExternalMetadataSearchEnabled] = useState(defaultSettings.externalMetadataSearchEnabled);
  const [externalMetadataSkipExisting, setExternalMetadataSkipExisting] = useState(defaultSettings.externalMetadataSkipExisting);
  const [lrcApiExternalDataEnabled, setLrcApiExternalDataEnabled] = useState(defaultSettings.lrcApiExternalDataEnabled);
  const [lrclibExternalDataEnabled, setLrclibExternalDataEnabled] = useState(defaultSettings.lrclibExternalDataEnabled);
  const [neteaseExternalDataEnabled, setNeteaseExternalDataEnabled] = useState(defaultSettings.neteaseExternalDataEnabled);
  const [externalDataSelectionMode, setExternalDataSelectionMode] = useState<ExternalDataSelectionMode>(defaultSettings.externalDataSelectionMode);
  const [loudnessNormalizationEnabled, setLoudnessNormalizationEnabled] = useState(defaultSettings.loudnessNormalizationEnabled);
  const [artworkBackgroundEnabled, setArtworkBackgroundEnabled] = useState(defaultSettings.artworkBackgroundEnabled);
  const [showArtworkGlow, setShowArtworkGlow] = useState(defaultSettings.showArtworkGlow);
  const [openSettingsSection, setOpenSettingsSection] = useState<SettingsSectionKey>('interface');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [localLibraryBusy, setLocalLibraryBusy] = useState(false);
  const [localLibraryError, setLocalLibraryError] = useState<string | null>(null);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistVisible, setPlaylistVisible] = useState(false);
  const [repeatOneEnabled, setRepeatOneEnabled] = useState(false);
  const [lyricsVisible, setLyricsVisible] = useState(false);
  const [lyricsText, setLyricsText] = useState('');
  const [lyricsTrackId, setLyricsTrackId] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [volumeExpanded, setVolumeExpanded] = useState(false);
  const [playbackOutputMode, setPlaybackOutputMode] = useState<PlaybackOutputMode>('pc');
  const [localTrack, setLocalTrack] = useState<LocalMusicTrack | null>(null);
  const [phoneTrack, setPhoneTrack] = useState<EchoLinkTrackPreview | null>(null);
  const [powerampStreamTrack, setPowerampStreamTrack] = useState<PowerampRemoteTrack | null>(null);
  const [phoneAudioBusy, setPhoneAudioBusy] = useState(false);
  const [phoneAudioError, setPhoneAudioError] = useState<string | null>(null);
  const [dspStatus, setDspStatus] = useState<EchoAudioDspStatus>({
    currentTime: 0,
    didJustFinish: false,
    duration: 0,
    playing: false,
    volume: 1,
  });
  const [dspPlaybackActive, setDspPlaybackActive] = useState(false);
  const [externalMetadataByKey, setExternalMetadataByKey] = useState<Record<string, ExternalTrackMetadata>>({});
  const [externalMetadataFieldSourcesByKey, setExternalMetadataFieldSourcesByKey] = useState<Record<
    string,
    Partial<Record<ExternalMetadataField, ExternalMetadataSource>>
  >>({});
  const [pendingExternalMetadataSelection, setPendingExternalMetadataSelection] = useState<PendingExternalMetadataSelection | null>(null);
  const [phoneVolume, setPhoneVolume] = useState(1);
  const [phoneSeekPreviewMs, setPhoneSeekPreviewMs] = useState<number | null>(null);
  const [progressTrackWidth, setProgressTrackWidth] = useState(0);
  const [volumeTrackWidth, setVolumeTrackWidth] = useState(0);
  const [failedArtworkUrls, setFailedArtworkUrls] = useState<Set<string>>(() => new Set());
  const [loadedArtworkUrls, setLoadedArtworkUrls] = useState<Set<string>>(() => new Set());
  const [stableArtworkUrl, setStableArtworkUrl] = useState<string | null>(null);
  const pageTransition = useRef(new Animated.Value(1)).current;
  const lyricsTransition = useRef(new Animated.Value(0)).current;
  const playlistTransition = useRef(new Animated.Value(0)).current;
  const eqTransition = useRef(new Animated.Value(0)).current;
  const volumeTransition = useRef(new Animated.Value(0)).current;
  const lyricsScrollRef = useRef<ScrollView | null>(null);
  const lyricLineLayoutsRef = useRef<Record<string, { height: number; y: number }>>({});
  const shownAlertKeysRef = useRef<Set<string>>(new Set()).current;
  const statusPollInFlight = useRef(false);
  const sliderInteractionInFlight = useRef(false);
  const latestStatusRef = useRef<EchoLinkStatusResponse | null>(null);
  const lastRemotePlaybackUpdatedAtRef = useRef(0);
  const pendingPcSeekRef = useRef<PendingPcSeek | null>(null);
  const pcAutoAdvanceArmedRef = useRef(true);
  const pcRepeatArmedRef = useRef(true);
  const phoneAutoAdvanceArmedRef = useRef(true);
  const phoneRepeatArmedRef = useRef(true);
  const devicePlaybackRequestRef = useRef(0);
  const nativeNowPlayingPublishedRef = useRef(false);
  const nativeNowPlayingSnapshotRef = useRef('');
  const nativeRemoteCommandHandlerRef = useRef<(command: EchoAudioDspRemoteCommand) => void>(() => undefined);
  const activeExternalMetadataKeyRef = useRef<string | null>(null);
  const externalMetadataLookupKeysRef = useRef<Set<string>>(new Set());
  const ignoredExternalMetadataKeysRef = useRef<Set<string>>(new Set());
  const libraryArtworkLookupKeysRef = useRef<Set<string>>(new Set());
  const [externalMetadataRefreshToken, setExternalMetadataRefreshToken] = useState(0);
  const [externalMetadataManualRefreshKey, setExternalMetadataManualRefreshKey] = useState<string | null>(null);
  const busyCountRef = useRef(0);
  const streamingBusyCountRef = useRef(0);
  const beginBusy = useCallback(() => {
    busyCountRef.current += 1;
    setBusy(true);
  }, []);
  const endBusy = useCallback(() => {
    busyCountRef.current = Math.max(0, busyCountRef.current - 1);
    setBusy(busyCountRef.current > 0);
  }, []);
  const beginStreamingBusy = useCallback(() => {
    streamingBusyCountRef.current += 1;
    setStreamingBusy(true);
  }, []);
  const endStreamingBusy = useCallback(() => {
    streamingBusyCountRef.current = Math.max(0, streamingBusyCountRef.current - 1);
    setStreamingBusy(streamingBusyCountRef.current > 0);
  }, []);
  const clearNativeNowPlaying = useCallback(async () => {
    nativeNowPlayingPublishedRef.current = false;
    nativeNowPlayingSnapshotRef.current = '';
    if (echoAudioDsp.isAvailable) {
      await echoAudioDsp.clearNowPlaying().catch(() => undefined);
    }
  }, []);
  const stopDspPlayback = useCallback(async () => {
    setDspPlaybackActive(false);
    if (echoAudioDsp.isAvailable) {
      await echoAudioDsp.stop().catch(() => undefined);
    }
  }, []);

  const client = useMemo(() => (
    echoConnectionEnabled && connection.host.trim() && connection.token.trim()
      ? createEchoLinkClient(connection)
      : null
  ), [connection, echoConnectionEnabled]);
  const activeClientRef = useRef<EchoLinkClient | null>(client);
  activeClientRef.current = client;
  const powerampClient = useMemo(() => (
    powerampRemoteEnabled
      && powerampConnection
      && normalizePowerampRemoteHost(powerampConnection.host)
      && normalizePowerampRemoteToken(powerampConnection.token)
      ? createPowerampRemoteClient(powerampConnection)
      : null
  ), [powerampConnection, powerampRemoteEnabled]);
  const activePowerampClientRef = useRef<PowerampRemoteClient | null>(powerampClient);
  activePowerampClientRef.current = powerampClient;
  const connectionDraftDirty = normalizeEchoLinkHost(connectionDraft.host) !== connection.host
    || normalizeEchoLinkToken(connectionDraft.token) !== connection.token
    || Number(connectionDraft.port) !== connection.port;
  const streamingSessionMatchesApi = Boolean(
    streamingCookie
    && streamingSessionOrigin
    && normalizedNeteaseOrigin(streamingApiBaseUrl) === streamingSessionOrigin
  );

  const markArtworkUrlFailed = useCallback((url: string | null | undefined) => {
    if (!url) {
      return;
    }
    setFailedArtworkUrls((current) => {
      if (current.has(url)) {
        return current;
      }
      const next = new Set(current);
      next.add(url);
      return next;
    });
  }, []);

  const markArtworkUrlLoaded = useCallback((url: string | null | undefined) => {
    if (!url) {
      return;
    }
    setStableArtworkUrl(url);
    setLoadedArtworkUrls((current) => {
      if (current.has(url)) {
        return current;
      }
      const next = new Set(current);
      next.add(url);
      return next;
    });
  }, []);

  const artworkUrlIsVisible = useCallback((url: string | null | undefined): url is string => (
    Boolean(url && !failedArtworkUrls.has(url))
  ), [failedArtworkUrls]);

  const artworkUrlHasLoaded = useCallback((url: string | null | undefined): boolean => (
    Boolean(url && loadedArtworkUrls.has(url))
  ), [loadedArtworkUrls]);

  const resolveArtworkUrl = useCallback((url: string | null | undefined): string | null => {
    const value = url?.trim();
    if (!value) {
      return null;
    }
    try {
      return new URL(value, powerampClient?.baseUrl ?? client?.baseUrl).toString();
    } catch {
      return value;
    }
  }, [client?.baseUrl, powerampClient?.baseUrl]);

  const showErrorAlert = useCallback((title: string, message: string, alertKey = `${title}:${message}`) => {
    if (shownAlertKeysRef.has(alertKey)) {
      return;
    }
    shownAlertKeysRef.add(alertKey);
    Alert.alert(title, message);
  }, [shownAlertKeysRef]);

  const languageIsEnglish = appLanguage === 'en';
  const text = useMemo(() => (languageIsEnglish ? {
    addToQueue: 'Queue',
    all: 'All',
    albums: 'Albums',
    artists: 'Artists',
    audioTags: 'Audio Tags',
    audioTagsDescription: 'Choose which audio tags stay visible.',
    autoLyrics: 'Auto-open local lyrics',
    autoLyricsDescription: 'Open the lyrics view when a local track has an imported LRC file.',
    autoQueueImports: 'Queue imported music',
    autoQueueImportsDescription: 'Newly imported tracks are appended to the local playback queue.',
    chooseCategory: 'Choose A Category',
    clear: 'Clear',
    clearLocalQueue: 'Clear Local Queue',
    clearLocalQueueDescription: 'Remove all tracks from the local playback queue.',
    clearRecent: 'Clear Recent',
    clearRecentDescription: 'Clear local recently played history.',
    closeEqPanel: 'Close EQ panel',
    closeLyrics: 'Close lyrics',
    closePlaylist: 'Close playlist',
    closePlaylistPreview: 'Close queue preview',
    closeRepeatOne: 'Disable repeat one',
    collapseVolume: 'Collapse volume control',
    confirmDeleteLocalTrackMessagePrefix: 'Delete',
    confirmDeleteLocalTrackMessageSuffix: 'from the local library on this phone?',
    confirmDelete: 'Confirm before deleting',
    confirmDeleteDescription: 'Ask before removing local audio files from the phone.',
    connect: 'Connect',
    connectEcho: 'Connect ECHO',
    connectPage: 'Connection page',
    connectWithPairingA11y: 'Connect with pairing link',
    connectedPrefix: 'Connected',
    connectingLabel: 'Connecting',
    control: 'Control',
    controlComputerPlayback: 'Control computer playback',
    controllingMode: 'Controlling Mode',
    customEq: 'Custom',
    defaultLibrarySource: 'Default library source',
    defaultLibrarySourceHint: 'Choose whether the library starts with all, ECHO, or local content.',
    defaultLocalView: 'Default local view',
    defaultLocalViewHint: 'Choose the default grouping for local music.',
    defaultPage: 'Launch page',
    defaultPageHint: 'Choose which page opens first next time.',
    deleteAction: 'Del',
    deleteLocalTrackA11y: 'Delete local track',
    deleteLocalTrackTitle: 'Delete local track',
    echoConnection: 'ECHO Connection',
    echoConnectionDescription: 'When off, ECHO iPhone will not connect, poll, or show connection alerts.',
    echoConnectionEnabled: 'Enable ECHO connection',
    echoNotConnected: 'ECHO Not Connected',
    echoOff: 'ECHO Off',
    echoLibrary: 'ECHO',
    emptyEchoLibrary: client ? 'No matching tracks' : 'Connect to show the desktop library',
    emptyLocalLibrary: localTracks.length > 0 ? 'No matching local tracks' : 'Tap “Import Music” to choose audio files',
    eq: 'EQ',
    eqDescription: 'Ten-band EQ for local and streaming playback. Presets and manual gains are saved on this phone.',
    eqTenBand: '10-band equalizer',
    eqUnavailable: 'EQ is for Local and Streaming modes.',
    expandVolume: 'Expand volume control',
    externalData: 'External Data',
    externalDataDescription: 'Use online sources only when local / ECHO artwork or lyrics are missing.',
    formats: 'Formats',
    favorites: 'Favorites',
    filterA11y: 'Filter',
    glow: 'Artwork glow',
    glowDescription: 'Show a soft glow behind the player artwork.',
    host: 'Host',
    importLyrics: 'LRC',
    importLyricsA11y: 'Import lyrics',
    importLocalMusicA11y: 'Import local music',
    importNoFilesMessage: 'Please choose MP3, AAC, M4A, FLAC, ALAC, WAV, or other audio files.',
    importNoFilesTitle: 'No music imported',
    importMusic: 'Import Music',
    interface: 'Interface',
    interfaceDescription: 'Language and launch behavior.',
    followSystemAppearance: 'Follow system appearance',
    followSystemAppearanceDescription: 'Use the iPhone system light or dark mode. Turn this off to choose manually.',
    manualAppearance: 'Manual dark mode',
    manualAppearanceDescription: 'Choose the app appearance when system following is disabled.',
    language: 'Language',
    languageHint: 'Changes the app language and keeps it saved on this phone.',
    library: 'Library',
    libraryPage: 'Library page',
    librarySettingsDescription: 'Local and desktop library defaults.',
    lyricsLoadingText: 'Loading lyrics...',
    lyricsUnavailable: 'No available lyrics',
    localLibrary: 'Local',
    localLibraryErrorTitle: 'Local library error',
    localPlay: 'Local Play',
    localPlayback: 'Local',
    localPlaybackA11y: 'Local playback',
    localMode: 'Local Mode',
    lrcApiSource: 'LrcAPI',
    lrcApiSourceHint: 'Fetches artwork, lyrics, artist, and other song metadata.\nRequires the phone to reach the internet.',
    lrclibSource: 'LRCLIB',
    lrclibSourceHint: 'Can fetch song lyrics and related lyric data.\nRequires the phone to reach the internet.',
    loudness: 'Loudness normalization',
    loudnessDescription: 'Uses the native DSP dynamics processor to keep perceived volume steadier. Off by default.',
    loudnessEnabled: 'Loudness normalization enabled',
    manual: 'Manual',
    manualHostPlaceholder: 'Computer IP, for example 192.168.1.12',
    moreInQueueSuffix: 'more in queue',
    moveDown: 'Move down',
    moveUp: 'Move up',
    neteaseSource: 'NetEase Cloud Music',
    neteaseSourceHint: 'Chinese library supplement.\nRequires the phone to reach the internet.',
    nextPlay: 'Next',
    nextTrack: 'Next track',
    noLyrics: 'No lyrics',
    noTrack: 'No Track Playing',
    nowPlaying: 'Now Playing',
    openEqPanel: 'Open EQ panel',
    openLyrics: 'Open lyrics',
    openPlaylistPreview: 'Open queue preview',
    openRepeatOne: 'Enable repeat one',
    pairLink: 'Pair Link',
    pairingFailedTitle: 'Pairing failed',
    pausePlayback: 'Pause playback',
    pcLocal: 'PC Local',
    playback: 'Playback',
    playbackPage: 'Playback page',
    playbackSettingsDescription: 'Playback page behavior.',
    playFirstLocalMusicA11y: 'Play first local track',
    playLocalTrackA11y: 'Play local track',
    playlistItemPrefix: 'Queue item',
    playNextA11y: 'Play next',
    playlist: 'Queue',
    portPlaceholder: 'Port',
    previousTrack: 'Previous track',
    queue: 'Queue',
    queueEmpty: 'The current queue is empty.',
    recent: 'Recent',
    remoteLibrary: 'Remote',
    powerampRemote: 'Poweramp Remote',
    powerampRemoteDescription: 'Connect an Android Poweramp bridge for control and LAN streaming.',
    powerampRemoteEnabled: 'Enable Poweramp compatibility',
    powerampRemoteEnabledDescription: 'When enabled, ECHO iPhone can connect to the configured Android Poweramp service.',
    powerampRemoteVisibility: 'Show Poweramp Remote',
    powerampRemoteVisibilityDescription: 'Remote entry switch.',
    powerampRemoteSetup: 'Poweramp service',
    powerampRemoteSetupDescription: 'Set the Android address, port, and pairing token.',
    powerampRemoteNotConfigured: 'Not configured',
    removeFromQueue: 'Remove from queue',
    resetTags: 'Reset tags',
    resetTagsDescription: 'Restore the default visible audio tags.',
    rescanMetadata: 'Rescan metadata',
    rescanMetadataDescription: 'Scan local files again and refresh metadata.',
    save: 'Save',
    saveManualConnectionA11y: 'Save manual connection',
    scan: 'Scan',
    scanning: 'Scanning',
    searchPlaceholder: 'Search tracks, artists, or albums',
    search: 'Search',
    settings: 'Settings',
    settingsCenter: 'Settings Center',
    settingsDescription: 'Open a category, then tune only the settings under it.',
    settingsPage: 'Settings page',
    songs: 'Songs',
    startPlayback: 'Start playback',
    storage: 'Storage',
    storageDescription: 'Local files, queue, and cleanup.',
    storageUsed: 'Local storage used',
    stream: 'Stream',
    streamToPhonePlayback: 'Stream to phone playback',
    streamingComingSoon: 'Streaming is in progress and not available yet.',
    streamingMode: 'Streaming Mode',
    streamingReserved: 'This page is reserved for future streaming integrations.',
    streamingServices: 'Streaming',
    streamable: 'Streamable',
    switchLibraryPrefix: 'Switch to',
    switchLibrarySuffix: 'library',
    sync: 'Sync',
    syncing: 'Syncing',
    test: 'Test',
    testComputerConnectionA11y: 'Test computer connection',
    testing: 'Testing',
    alertCancel: 'Cancel',
    connectionErrorTitle: 'Connection error',
    deleteConfirmAction: 'Delete',
    libraryErrorTitle: 'Library error',
    localMusicMissingMessage: 'Import music in the local library first.',
    localMusicMissingTitle: 'No local music',
    localNextMissing: 'There is no next track in the local library.',
    localPreviousMissing: 'There is no previous track in the local library.',
    noPlayableTrackMessage: 'No playable track right now. Play a song on the desktop first.',
    phoneAudioErrorTitle: 'Playback error',
    previousPhoneQueueMissing: 'There is no previous track in the queue.',
    nextPhoneQueueMissing: 'There is no next track in the queue.',
    streamUnsupportedMessage: 'This track cannot stream directly to the phone yet. Try a local MP3/AAC/M4A or another iOS-friendly file.',
  } : {
    addToQueue: '队列',
    all: '全部',
    albums: '专辑',
    artists: '艺术家',
    audioTags: '音频标签',
    audioTagsDescription: '选择播放页和曲库里展示哪些音频 tag。',
    autoLyrics: '自动打开本地歌词',
    autoLyricsDescription: '本地歌曲已有 LRC 时，播放后自动进入歌词页。',
    autoQueueImports: '导入后加入队列',
    autoQueueImportsDescription: '新导入的歌曲会自动追加到本地播放列表。',
    chooseCategory: '选择一个分类',
    clear: '清空',
    clearLocalQueue: '清空本地队列',
    clearLocalQueueDescription: '清空本地播放列表里的所有歌曲。',
    clearRecent: '清空最近播放',
    clearRecentDescription: '清空本地最近播放记录。',
    closeEqPanel: '关闭 EQ 面板',
    closeLyrics: '关闭歌词显示',
    closePlaylist: '关闭播放列表',
    closePlaylistPreview: '关闭播放列表预览',
    closeRepeatOne: '关闭单曲循环',
    collapseVolume: '收起音量调节',
    confirmDeleteLocalTrackMessagePrefix: '从手机本地曲库删除',
    confirmDeleteLocalTrackMessageSuffix: '？',
    confirmDelete: '删除前确认',
    confirmDeleteDescription: '从手机本地曲库删除音频文件前弹出确认。',
    connect: '连接',
    connectEcho: '连接 ECHO',
    connectPage: '连接页面',
    connectWithPairingA11y: '使用配对链接连接电脑',
    connectedPrefix: '已连接',
    connectingLabel: '正在连接',
    control: '控制',
    controlComputerPlayback: '控制电脑播放',
    controllingMode: 'Controlling Mode',
    customEq: '手动',
    defaultLibrarySource: '默认曲库源',
    defaultLibrarySourceHint: '选择曲库页默认显示全部、ECHO 或手机本地内容。',
    defaultLocalView: '默认本地视图',
    defaultLocalViewHint: '选择本地曲库默认按歌曲、专辑、艺术家或格式展示。',
    defaultPage: '启动页面',
    defaultPageHint: '选择下次打开 App 时默认进入哪个页面。',
    deleteAction: '删',
    deleteLocalTrackA11y: '删除本地歌曲',
    deleteLocalTrackTitle: '删除本地歌曲',
    echoConnection: 'ECHO 连接',
    echoConnectionDescription: '关闭后不会自动连接、轮询 ECHO，也不会弹出连接异常提醒。',
    echoConnectionEnabled: '启用 ECHO 连接',
    echoNotConnected: 'ECHO未连接',
    echoOff: 'ECHO 已关闭',
    echoLibrary: 'ECHO',
    emptyEchoLibrary: client ? '没有匹配的歌曲' : '连接后会显示电脑端曲库',
    emptyLocalLibrary: localTracks.length > 0 ? '没有匹配的本地歌曲' : '点“导入音乐”选择音频文件',
    eq: 'EQ',
    eqDescription: '本地/串流播放使用十段 EQ；预设和手动增益会保存在本机。',
    eqTenBand: '十段均衡器',
    eqUnavailable: 'EQ 仅用于本地和串流模式。',
    expandVolume: '展开音量调节',
    externalData: '外源数据',
    externalDataDescription: '本地 / 串流 / 控制模式都会在缺少封面或歌词时按歌曲名与艺术家检索。',
    formats: '格式',
    favorites: '收藏',
    filterA11y: '筛选',
    glow: '封面光晕',
    glowDescription: '在播放页封面后显示一层柔和光晕。',
    host: '主机',
    importLyrics: '词',
    importLyricsA11y: '导入歌词',
    importLocalMusicA11y: '导入本地音乐',
    importNoFilesMessage: '请选择 MP3、AAC、M4A、FLAC、ALAC、WAV 等音频文件。',
    importNoFilesTitle: '没有导入音乐',
    importMusic: '导入音乐',
    interface: '界面',
    interfaceDescription: '语言、启动页和界面显示。',
    followSystemAppearance: '自动跟随系统深色模式',
    followSystemAppearanceDescription: '跟随 iPhone 系统的浅色/深色模式；关闭后可以手动选择。',
    manualAppearance: '手动深色模式',
    manualAppearanceDescription: '关闭自动跟随后，手动选择浅色或深色界面。',
    language: '语言',
    languageHint: '切换 App 界面语言，并保存在本机个人数据里。',
    library: '曲库',
    libraryPage: '曲库页面',
    librarySettingsDescription: '本地/电脑曲库的默认入口和视图。',
    lyricsLoadingText: '正在载入歌词...',
    lyricsUnavailable: '暂无可用歌词',
    localLibrary: '本地',
    localLibraryErrorTitle: '本地曲库异常',
    localPlay: '本地播放',
    localPlayback: '本地',
    localPlaybackA11y: '本地播放',
    localMode: 'Local Mode',
    lrcApiSource: 'LrcAPI',
    lrcApiSourceHint: '可获取封面、歌词、艺术家等歌曲信息\n需要保证手机能连接到外网才可获取',
    lrclibSource: 'LRCLIB',
    lrclibSourceHint: '可获取歌曲歌词等\n需要保证手机能连接到外网才可获取',
    loudness: '响度归一化',
    loudnessDescription: '使用原生 DSP 动态处理器，让本地和串流歌曲的感知音量更稳定，默认关闭。',
    loudnessEnabled: '响度归一化已开启',
    manual: '手动输入',
    manualHostPlaceholder: '电脑 IP，例如 192.168.1.12',
    moreInQueueSuffix: '首在队列中',
    moveDown: '下移',
    moveUp: '上移',
    neteaseSource: '网易云音乐',
    neteaseSourceHint: '中文曲库补充\n需要保证手机能连接到外网才可获取',
    nextPlay: '下',
    nextTrack: '下一首',
    noLyrics: '暂无歌词',
    noTrack: '没有正在播放的歌曲',
    nowPlaying: '正在播放',
    openEqPanel: '打开 EQ 面板',
    openLyrics: '打开歌词显示',
    openPlaylistPreview: '打开播放列表预览',
    openRepeatOne: '开启单曲循环',
    pairLink: '配对链接',
    pairingFailedTitle: '配对失败',
    pausePlayback: '暂停播放',
    pcLocal: 'PC 本地',
    playback: '播放',
    playbackPage: '播放页面',
    playbackSettingsDescription: '播放页和播放动作相关设置。',
    playFirstLocalMusicA11y: '播放第一首本地音乐',
    playLocalTrackA11y: '本地播放',
    playlistItemPrefix: '播放列表第',
    playNextA11y: '下一首播放',
    playlist: '播放列表',
    portPlaceholder: '端口',
    previousTrack: '上一首',
    queue: '队列',
    queueEmpty: '当前播放队列暂无内容。',
    recent: '最近',
    remoteLibrary: '远程',
    powerampRemote: 'Poweramp 远程',
    powerampRemoteDescription: '连接安卓 Poweramp 服务，支持控制与局域网串流。',
    powerampRemoteEnabled: '兼容 Poweramp',
    powerampRemoteEnabledDescription: '开启后，ECHO iPhone 会连接已配置的安卓 Poweramp 服务。',
    powerampRemoteVisibility: '显示 Poweramp 远程',
    powerampRemoteVisibilityDescription: '远程入口开关',
    powerampRemoteSetup: 'Poweramp 服务',
    powerampRemoteSetupDescription: '设置安卓地址、端口与配对令牌。',
    powerampRemoteNotConfigured: '未配置',
    removeFromQueue: '从队列移除',
    resetTags: '重置标签',
    resetTagsDescription: '恢复默认显示的音频 tag。',
    rescanMetadata: '重扫元数据',
    rescanMetadataDescription: '重新扫描本地文件并刷新元数据。',
    save: '保存',
    saveManualConnectionA11y: '保存手动连接',
    scan: '扫描',
    scanning: '扫描中',
    searchPlaceholder: '搜索歌曲、艺术家或专辑',
    search: '搜索',
    settings: '设置',
    settingsCenter: '设置中心',
    settingsDescription: '按类型展开设置，只调整当前需要的那一组。',
    settingsPage: '设置页面',
    songs: '歌曲',
    startPlayback: '开始播放',
    storage: '存储',
    storageDescription: '本地文件、播放队列和清理设置。',
    storageUsed: '本地占用',
    stream: '串流',
    streamToPhonePlayback: '串流到手机播放',
    streamingComingSoon: '正在制作，暂未开放。',
    streamingMode: 'Streaming Mode',
    streamingReserved: '这里会预留给后续流媒体服务接入。',
    streamingServices: '流媒体',
    streamable: '可串流',
    switchLibraryPrefix: '切换到',
    switchLibrarySuffix: '曲库',
    sync: '刷新',
    syncing: '同步中',
    test: '测试',
    testComputerConnectionA11y: '测试电脑连接',
    testing: '测试中',
    alertCancel: '取消',
    connectionErrorTitle: '连接异常',
    deleteConfirmAction: '删除',
    libraryErrorTitle: '曲库加载异常',
    localMusicMissingMessage: '请先在本地曲库导入音乐。',
    localMusicMissingTitle: '没有本地音乐',
    localNextMissing: '本地曲库里暂时没有下一首。',
    localPreviousMissing: '本地曲库里暂时没有上一首。',
    noPlayableTrackMessage: '当前没有可播放的歌曲。请先在电脑端播放一首歌。',
    phoneAudioErrorTitle: '播放异常',
    previousPhoneQueueMissing: '播放列表里暂时没有上一首。',
    nextPhoneQueueMissing: '播放列表里暂时没有下一首。',
    streamUnsupportedMessage: '这首歌暂时不能直接串流到手机。请换一首本地 MP3/AAC/M4A 等 iOS 友好格式的歌曲。',
  }), [client, languageIsEnglish, localTracks.length]);

  const switchPage = useCallback((nextPage: AppPage) => {
    if (nextPage === page) {
      return;
    }
    const currentIndex = appPages.indexOf(page);
    const nextIndex = appPages.indexOf(nextPage);
    setPageSlideDirection(nextIndex >= currentIndex ? 1 : -1);
    setPlaylistOpen(false);
    setPage(nextPage);
  }, [page]);

  const pagePanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => (
      !sliderInteractionInFlight.current
      && Math.abs(gestureState.dx) > 46
      && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.65
    ),
    onPanResponderRelease: (_, gestureState) => {
      if (Math.abs(gestureState.dx) < 70) {
        return;
      }
      const currentIndex = appPages.indexOf(page);
      const nextIndex = gestureState.dx < 0
        ? Math.min(appPages.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex - 1);
      const nextPage = appPages[nextIndex];
      if (nextPage) {
        switchPage(nextPage);
      }
    },
  }), [page, switchPage]);

  const applyStatus = useCallback((nextStatus: EchoLinkStatusResponse, options: { force?: boolean } = {}) => {
    const nextUpdatedAt = nextStatus.playback.updatedAtEpochMs;
    if (!options.force && nextUpdatedAt > 0 && nextUpdatedAt < lastRemotePlaybackUpdatedAtRef.current) return;
    const pendingSeek = pendingPcSeekRef.current;
    if (pendingSeek && !options.force) {
      const nextTrackId = nextStatus.playback.track?.id ?? null;
      const pendingAgeMs = Date.now() - pendingSeek.requestedAtMs;
      const expectedPositionMs = pendingSeek.positionMs + (
        nextStatus.playback.state === 'playing' ? Math.max(0, pendingAgeMs) : 0
      );
      const closeEnough = Math.abs(nextStatus.playback.positionMs - expectedPositionMs) < 1200;

      if (nextTrackId === pendingSeek.trackId && !closeEnough && pendingAgeMs < 3500) {
        return;
      }
      pendingPcSeekRef.current = null;
    }
    if (nextUpdatedAt > 0) lastRemotePlaybackUpdatedAtRef.current = nextUpdatedAt;
    latestStatusRef.current = nextStatus;
    setStatus(nextStatus);
    setStatusReceivedAtMs(Date.now());
  }, []);

  const patchPlayback = useCallback((patch: Partial<EchoLinkStatusResponse['playback']>) => {
    const now = Date.now();
    setStatus((current) => {
      if (!current) {
        return current;
      }
      const nextStatus = {
        ...current,
        playback: {
          ...current.playback,
          ...patch,
          updatedAtEpochMs: now,
        },
      };
      latestStatusRef.current = nextStatus;
      return nextStatus;
    });
    setClockMs(now);
    setStatusReceivedAtMs(now);
  }, []);

  const beginSliderInteraction = useCallback(() => {
    sliderInteractionInFlight.current = true;
  }, []);

  const endSliderInteraction = useCallback(() => {
    sliderInteractionInFlight.current = false;
  }, []);

  const refresh = useCallback(async () => {
    if (!client) {
      return;
    }
    beginBusy();
    setError(null);
    setLibraryError(null);
    try {
      const nextStatus = await client.getStatus();
      if (activeClientRef.current !== client) {
        endBusy();
        return;
      }
      applyStatus(nextStatus);
    } catch (refreshError) {
      if (activeClientRef.current === client) setError(formatRequestError(refreshError));
      endBusy();
      return;
    }

    try {
      const [libraryResult, albumsResult] = await Promise.allSettled([
        fetchAllEchoTracks(client),
        fetchAllEchoAlbums(client),
      ]);
      if (activeClientRef.current !== client) return;
      if (libraryResult.status === 'rejected') throw libraryResult.reason;
      setTracks(libraryResult.value);
      if (albumsResult.status === 'fulfilled') setAlbums(albumsResult.value);
    } catch (libraryLoadError) {
      setLibraryError(`已连接电脑端，但曲库加载失败：${formatRequestError(libraryLoadError)}`);
    } finally {
      endBusy();
    }
  }, [applyStatus, beginBusy, client, endBusy]);

  const refreshPowerampRemote = useCallback(async () => {
    if (!powerampClient) return;
    setPowerampBusy(true);
    setPowerampError(null);
    try {
      const [nextStatus, tracksResult, albumsResult] = await Promise.all([
        powerampClient.getStatus(),
        fetchAllPowerampTracks(powerampClient),
        fetchAllPowerampAlbums(powerampClient),
      ]);
      if (activePowerampClientRef.current !== powerampClient) return;
      setPowerampStatus(nextStatus);
      setPowerampStatusReceivedAtMs(Date.now());
      setPowerampTracks(tracksResult);
      setPowerampAlbums(albumsResult);
    } catch (remoteError) {
      if (activePowerampClientRef.current === powerampClient) setPowerampError(formatRequestError(remoteError));
    } finally {
      if (activePowerampClientRef.current === powerampClient) setPowerampBusy(false);
    }
  }, [powerampClient]);

  const refreshLocalLibrary = useCallback(async () => {
    setLocalLibraryBusy(true);
    setLocalLibraryError(null);
    try {
      setLocalTracks(await scanLocalMusic());
      setLocalStorageBytes(await getLocalMusicStorageUsage());
      setLocalLibraryLoaded(true);
    } catch (scanError) {
      setLocalLibraryError(formatRequestError(scanError));
    } finally {
      setLocalLibraryBusy(false);
    }
  }, []);

  const refreshFromPull = useCallback(async () => {
    setPullRefreshing(true);
    try {
      if (page === 'library' && librarySource === 'remote') {
        await refreshPowerampRemote();
      } else if (page === 'library' && librarySource === 'local') {
        await refreshLocalLibrary();
      } else if ((page === 'library' && librarySource === 'all') || page === 'search') {
        await Promise.all([refresh(), refreshLocalLibrary(), refreshPowerampRemote()]);
      } else {
        await refresh();
      }
    } finally {
      setPullRefreshing(false);
    }
  }, [librarySource, page, refresh, refreshLocalLibrary, refreshPowerampRemote]);

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      loadSavedConnection(),
      loadSavedSettings(),
      loadSavedLocalMusicState(),
      loadStreamingPreferences(),
      loadNeteaseSession(),
      loadPowerampRemoteState(),
    ]).then(([savedConn, savedSettings, savedLocalMusic, savedStreaming, savedSession, savedPoweramp]) => {
      if (!mounted) {
        return;
      }
      if (savedConn) {
        setConnection(savedConn);
        setConnectionDraft(connectionDraftFrom(savedConn));
      }
      setFavoriteStreamingPlaylistIds(savedStreaming.favoritePlaylistIds);
      setPinnedStreamingPlaylistIds(savedStreaming.pinnedPlaylistIds);
      setStreamingApiInput(savedStreaming.apiBaseUrl === neteaseDirectApiBaseUrl ? '' : savedStreaming.apiBaseUrl);
      const savedAccessMode = savedSettings.neteaseAccessMode === 'direct' || savedSettings.neteaseAccessMode === 'selfHosted'
        ? savedSettings.neteaseAccessMode
        : savedStreaming.apiBaseUrl && savedStreaming.apiBaseUrl !== neteaseDirectApiBaseUrl ? 'selfHosted' : 'direct';
      setNeteaseAccessMode(savedAccessMode);
      if (savedSession) {
        setStreamingCookie(savedSession.cookie);
        setStreamingSessionOrigin(savedSession.apiBaseUrl);
      }
      setStreamingPreferencesLoaded(true);
      if (savedSettings.appLanguage === 'zh' || savedSettings.appLanguage === 'en') {
        setAppLanguage(savedSettings.appLanguage);
      }
      if (savedSettings.audioTagVisibility && typeof savedSettings.audioTagVisibility === 'object') {
        setAudioTagVisibility((current) => ({ ...current, ...savedSettings.audioTagVisibility }));
      }
      if (savedSettings.defaultPage && appPages.includes(savedSettings.defaultPage)) {
        setDefaultPage(savedSettings.defaultPage);
        setPage(savedSettings.defaultPage);
      }
      if (savedSettings.defaultLibrarySource && ['all', 'echo', 'local', 'remote', 'streaming'].includes(savedSettings.defaultLibrarySource)) {
        setDefaultLibrarySource(savedSettings.defaultLibrarySource);
        setLibrarySource(savedSettings.defaultLibrarySource);
      }
      if (savedSettings.defaultLocalLibraryView && localLibraryViewOptions.includes(savedSettings.defaultLocalLibraryView)) {
        setDefaultLocalLibraryView(savedSettings.defaultLocalLibraryView);
        setLocalLibraryView(savedSettings.defaultLocalLibraryView);
      }
      if (typeof savedSettings.autoOpenLyricsForLocalTracks === 'boolean') {
        setAutoOpenLyricsForLocalTracks(savedSettings.autoOpenLyricsForLocalTracks);
      }
      if (typeof savedSettings.autoQueueImportedLocalTracks === 'boolean') {
        setAutoQueueImportedLocalTracks(savedSettings.autoQueueImportedLocalTracks);
      }
      if (typeof savedSettings.confirmBeforeDeletingLocalTracks === 'boolean') {
        setConfirmBeforeDeletingLocalTracks(savedSettings.confirmBeforeDeletingLocalTracks);
      }
      if (typeof savedSettings.echoConnectionEnabled === 'boolean') {
        setEchoConnectionEnabled(savedSettings.echoConnectionEnabled);
      }
      if (typeof savedSettings.powerampRemoteEnabled === 'boolean') {
        setPowerampRemoteEnabled(savedSettings.powerampRemoteEnabled);
      }
      if (typeof savedSettings.showPowerampRemoteConnection === 'boolean') {
        setShowPowerampRemoteConnection(savedSettings.showPowerampRemoteConnection);
      }
      if (savedSettings.eqPreset === 'custom') {
        setEqPreset('custom');
        setEqGains(normalizeEqGains(savedSettings.eqGains));
      } else {
        const savedEqOption = eqPresetOptions.find((option) => option.key === savedSettings.eqPreset);
        if (savedEqOption) {
          setEqPreset(savedEqOption.key);
          setEqGains([...savedEqOption.gains]);
        }
      }
      if (typeof savedSettings.followSystemAppearance === 'boolean') {
        setFollowSystemAppearance(savedSettings.followSystemAppearance);
      }
      if (typeof savedSettings.darkModeEnabled === 'boolean') {
        setDarkModeEnabled(savedSettings.darkModeEnabled);
      }
      if (typeof savedSettings.lrcApiExternalDataEnabled === 'boolean') {
        setLrcApiExternalDataEnabled(savedSettings.lrcApiExternalDataEnabled);
      }
      if (typeof savedSettings.externalMetadataSearchEnabled === 'boolean') {
        setExternalMetadataSearchEnabled(savedSettings.externalMetadataSearchEnabled);
      }
      if (typeof savedSettings.externalMetadataSkipExisting === 'boolean') {
        setExternalMetadataSkipExisting(savedSettings.externalMetadataSkipExisting);
      }
      if (typeof savedSettings.lrclibExternalDataEnabled === 'boolean') {
        setLrclibExternalDataEnabled(savedSettings.lrclibExternalDataEnabled);
      }
      if (typeof savedSettings.neteaseExternalDataEnabled === 'boolean') {
        setNeteaseExternalDataEnabled(savedSettings.neteaseExternalDataEnabled);
      }
      if (savedSettings.externalDataSelectionMode === 'ask' || savedSettings.externalDataSelectionMode === 'automatic') {
        setExternalDataSelectionMode(savedSettings.externalDataSelectionMode);
      }
      if (typeof savedSettings.loudnessNormalizationEnabled === 'boolean') {
        setLoudnessNormalizationEnabled(savedSettings.loudnessNormalizationEnabled);
      }
      if (typeof savedSettings.showArtworkGlow === 'boolean') {
        setShowArtworkGlow(savedSettings.showArtworkGlow);
      }
      if (typeof savedSettings.artworkBackgroundEnabled === 'boolean') {
        setArtworkBackgroundEnabled(savedSettings.artworkBackgroundEnabled);
      }
      setSettingsLoaded(true);
      setPowerampConnection(savedPoweramp.connection);
      setPowerampConnectionDraft(powerampConnectionDraftFrom(savedPoweramp.connection));
      setFavoritePowerampTrackIds(savedPoweramp.favoriteTrackIds);
      setRecentPowerampTrackIds(savedPoweramp.recentTrackIds);
      setPowerampRemoteStateLoaded(true);
      setFavoriteEchoTrackIds(savedLocalMusic.echoFavoriteTrackIds);
      setRecentEchoTrackIds(savedLocalMusic.echoRecentTrackIds);
      setFavoriteLocalTrackIds(savedLocalMusic.favoriteTrackIds);
      setLocalQueueActive(savedLocalMusic.queueActive);
      setLocalQueueTrackIds(savedLocalMusic.queueTrackIds);
      setPlaylists(savedLocalMusic.playlists);
      setRecentLocalTrackIds(savedLocalMusic.recentTrackIds);
      setLocalMusicStateLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void Promise.all([scanLocalMusic(), getLocalMusicStorageUsage()])
      .then(([nextTracks, nextStorageBytes]) => {
        if (mounted) {
          setLocalTracks(nextTracks);
          setLocalStorageBytes(nextStorageBytes);
          setLocalLibraryLoaded(true);
        }
      })
      .catch((scanError) => {
        if (mounted) {
          setLocalLibraryError(formatRequestError(scanError));
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    lastRemotePlaybackUpdatedAtRef.current = 0;
    if (client) {
      void refresh();
    }
  }, [client, refresh]);

  useEffect(() => {
    if (powerampClient) void refreshPowerampRemote();
  }, [powerampClient, refreshPowerampRemote]);

  useEffect(() => {
    if (!powerampClient) {
      setPowerampBusy(false);
      setPowerampStatus(null);
      setPowerampError(null);
      return undefined;
    }
    let cancelled = false;
    const poll = () => {
      void powerampClient.getStatus()
        .then((nextStatus) => {
          if (!cancelled && activePowerampClientRef.current === powerampClient) {
            setPowerampStatus(nextStatus);
            setPowerampStatusReceivedAtMs(Date.now());
          }
        })
        .catch((pollError) => {
          if (!cancelled && activePowerampClientRef.current === powerampClient) setPowerampError(formatRequestError(pollError));
        });
    };
    poll();
    const interval = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [powerampClient]);

  useEffect(() => {
    if (!echoConnectionEnabled && librarySource === 'echo') setLibrarySource('local');
    if (!powerampRemoteEnabled && librarySource === 'remote') setLibrarySource('local');
    if (!echoConnectionEnabled && defaultLibrarySource === 'echo') setDefaultLibrarySource('local');
    if (!powerampRemoteEnabled && defaultLibrarySource === 'remote') setDefaultLibrarySource('local');
  }, [defaultLibrarySource, echoConnectionEnabled, librarySource, powerampRemoteEnabled]);

  useEffect(() => {
    if (!showPowerampRemoteConnection && connectPanelMode === 'remote') setConnectPanelMode('echo');
  }, [connectPanelMode, showPowerampRemoteConnection]);

  useEffect(() => {
    if (echoConnectionEnabled) {
      return;
    }
    setBusy(false);
    setError(null);
    setLibraryError(null);
    setStatus(null);
  }, [echoConnectionEnabled]);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }
    void saveSettings({
      appLanguage,
      artworkBackgroundEnabled,
      audioTagVisibility,
      autoOpenLyricsForLocalTracks,
      autoQueueImportedLocalTracks,
      confirmBeforeDeletingLocalTracks,
      defaultLibrarySource,
      defaultLocalLibraryView,
      defaultPage,
      echoConnectionEnabled,
      eqGains,
      eqPreset,
      followSystemAppearance,
      externalMetadataSearchEnabled,
      externalMetadataSkipExisting,
      lrcApiExternalDataEnabled,
      lrclibExternalDataEnabled,
      externalDataSelectionMode,
      loudnessNormalizationEnabled,
      neteaseExternalDataEnabled,
      neteaseAccessMode,
      powerampRemoteEnabled,
      showPowerampRemoteConnection,
      showArtworkGlow,
      darkModeEnabled,
    }).catch((saveError) => {
      showErrorAlert(
        languageIsEnglish ? 'Settings not saved' : '设置未保存',
        formatRequestError(saveError),
        'settings-save-error',
      );
    });
  }, [
    appLanguage,
    artworkBackgroundEnabled,
    audioTagVisibility,
    autoOpenLyricsForLocalTracks,
    autoQueueImportedLocalTracks,
    confirmBeforeDeletingLocalTracks,
    defaultLibrarySource,
    defaultLocalLibraryView,
    defaultPage,
    echoConnectionEnabled,
    eqGains,
    eqPreset,
    followSystemAppearance,
    externalMetadataSearchEnabled,
    externalMetadataSkipExisting,
    lrcApiExternalDataEnabled,
    lrclibExternalDataEnabled,
    externalDataSelectionMode,
    loudnessNormalizationEnabled,
    neteaseExternalDataEnabled,
    neteaseAccessMode,
    powerampRemoteEnabled,
    settingsLoaded,
    showPowerampRemoteConnection,
    showArtworkGlow,
    darkModeEnabled,
    showErrorAlert,
  ]);

  useEffect(() => {
    if (!localMusicStateLoaded) {
      return;
    }
    void saveLocalMusicState({
      echoFavoriteTrackIds: favoriteEchoTrackIds,
      echoRecentTrackIds: recentEchoTrackIds,
      favoriteTrackIds: favoriteLocalTrackIds,
      playlists,
      queueActive: localQueueActive,
      queueTrackIds: localQueueTrackIds,
      recentTrackIds: recentLocalTrackIds,
    }).catch((saveError) => {
      showErrorAlert(
        languageIsEnglish ? 'Library changes not saved' : '曲库更改未保存',
        formatRequestError(saveError),
        'local-library-save-error',
      );
    });
  }, [favoriteEchoTrackIds, favoriteLocalTrackIds, languageIsEnglish, localMusicStateLoaded, localQueueActive, localQueueTrackIds, playlists, recentEchoTrackIds, recentLocalTrackIds, showErrorAlert]);

  useEffect(() => {
    if (!powerampRemoteStateLoaded) return;
    void savePowerampRemoteState({
      connection: powerampConnection,
      favoriteTrackIds: favoritePowerampTrackIds,
      recentTrackIds: recentPowerampTrackIds,
    }).catch((saveError) => {
      showErrorAlert(
        languageIsEnglish ? 'Remote settings not saved' : '远程设置未保存',
        formatRequestError(saveError),
        'poweramp-remote-save-error',
      );
    });
  }, [favoritePowerampTrackIds, languageIsEnglish, powerampConnection, powerampRemoteStateLoaded, recentPowerampTrackIds, showErrorAlert]);

  useEffect(() => {
    if (!localLibraryLoaded || !localMusicStateLoaded) return;
    const validIds = new Set(localTracks.map((track) => track.id));
    setFavoriteLocalTrackIds((current) => current.filter((id) => validIds.has(id)));
    setLocalQueueTrackIds((current) => current.filter((id) => validIds.has(id)));
    setRecentLocalTrackIds((current) => current.filter((id) => validIds.has(id)));
  }, [localLibraryLoaded, localMusicStateLoaded, localTracks]);

  useEffect(() => {
    if (!streamingPreferencesLoaded) return;
    void saveStreamingPreferences({
      apiBaseUrl: streamingApiInput,
      favoritePlaylistIds: favoriteStreamingPlaylistIds,
      pinnedPlaylistIds: pinnedStreamingPlaylistIds,
    }).catch((saveError) => {
      showErrorAlert(
        languageIsEnglish ? 'Streaming settings not saved' : '流媒体设置未保存',
        formatRequestError(saveError),
        'streaming-settings-save-error',
      );
    });
  }, [
    favoriteStreamingPlaylistIds,
    languageIsEnglish,
    pinnedStreamingPlaylistIds,
    showErrorAlert,
    streamingApiInput,
    streamingPreferencesLoaded,
  ]);

  useEffect(() => {
    if (!streamingSessionMatchesApi) return;
    let cancelled = false;
    beginStreamingBusy();
    void getNeteaseProfile(streamingApiBaseUrl, streamingCookie)
      .then(async (profile) => {
        const nextPlaylists = await getNeteasePlaylists(streamingApiBaseUrl, streamingCookie, profile.userId);
        if (cancelled) return;
        setStreamingProfile(profile);
        setStreamingPlaylists(nextPlaylists);
        setStreamingStatusText('');
      })
      .catch((streamingError) => {
        if (!cancelled) {
          setStreamingProfile(null);
          setStreamingPlaylists([]);
          setStreamingTracks([]);
          setStreamingStatusText(formatRequestError(streamingError));
        }
      })
      .finally(endStreamingBusy);
    return () => {
      cancelled = true;
    };
  }, [beginStreamingBusy, endStreamingBusy, streamingApiBaseUrl, streamingCookie, streamingSessionMatchesApi]);

  useEffect(() => {
    if (
      librarySource !== 'streaming'
      || streamingLibraryMode !== 'search'
      || !streamingApiBaseUrl
      || !streamingCookie
      || !streamingSessionMatchesApi
    ) return;
    if (!query.trim()) {
      setStreamingTracks([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      beginStreamingBusy();
      void searchNeteaseTracks(streamingApiBaseUrl, streamingCookie, query)
        .then((results) => {
          if (!cancelled) setStreamingTracks(results);
        })
        .catch((searchError) => {
          if (!cancelled) setStreamingStatusText(formatRequestError(searchError));
        })
        .finally(endStreamingBusy);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [beginStreamingBusy, endStreamingBusy, librarySource, query, streamingApiBaseUrl, streamingCookie, streamingLibraryMode, streamingSessionMatchesApi]);

  useEffect(() => {
    pageTransition.setValue(0);
    Animated.timing(pageTransition, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [page, pageTransition]);

  useEffect(() => {
    Animated.timing(lyricsTransition, {
      duration: 360,
      easing: Easing.out(Easing.cubic),
      toValue: lyricsVisible ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [lyricsTransition, lyricsVisible]);

  useEffect(() => {
    if (playlistOpen) {
      setPlaylistVisible(true);
      Animated.timing(playlistTransition, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(playlistTransition, {
      duration: 190,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setPlaylistVisible(false);
      }
    });
  }, [playlistOpen, playlistTransition]);

  useEffect(() => {
    if (eqPanelOpen) {
      setEqPanelVisible(true);
      Animated.timing(eqTransition, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(eqTransition, {
      duration: 180,
      easing: Easing.in(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setEqPanelVisible(false);
      }
    });
  }, [eqPanelOpen, eqTransition]);

  useEffect(() => {
    Animated.timing(volumeTransition, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
      toValue: volumeExpanded ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [volumeExpanded, volumeTransition]);

  useEffect(() => {
    if (echoConnectionEnabled && error) {
      showErrorAlert(text.connectionErrorTitle, error, 'connection-error');
    }
  }, [echoConnectionEnabled, error, showErrorAlert, text.connectionErrorTitle]);

  useEffect(() => {
    if (echoConnectionEnabled && libraryError) {
      showErrorAlert(text.libraryErrorTitle, libraryError, 'library-error');
    }
  }, [echoConnectionEnabled, libraryError, showErrorAlert, text.libraryErrorTitle]);

  useEffect(() => {
    if (localLibraryError) {
      showErrorAlert(text.localLibraryErrorTitle, localLibraryError, 'local-library-error');
    }
  }, [localLibraryError, showErrorAlert, text.localLibraryErrorTitle]);

  useEffect(() => {
    if (phoneAudioError) {
      showErrorAlert(text.phoneAudioErrorTitle, phoneAudioError, 'phone-audio-error');
    }
  }, [phoneAudioError, showErrorAlert, text.phoneAudioErrorTitle]);

  useEffect(() => {
    if (playbackOutputMode !== 'pc' || status?.playback.state !== 'playing') {
      return undefined;
    }
    const interval = setInterval(() => {
      setClockMs(Date.now());
    }, 500);

    return () => clearInterval(interval);
  }, [playbackOutputMode, status?.playback.state]);

  useEffect(() => {
    void setAudioModeAsync({
      interruptionMode: 'doNotMix',
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    }).catch((audioModeError) => {
      setPhoneAudioError(formatRequestError(audioModeError));
    });
  }, []);

  useEffect(() => {
    if (!client) {
      return undefined;
    }

    let cancelled = false;
    const pollStatus = async () => {
      if (statusPollInFlight.current) {
        return;
      }
      statusPollInFlight.current = true;
      try {
        const nextStatus = await client.getStatus();
        if (!cancelled && !sliderInteractionInFlight.current) {
          applyStatus(nextStatus);
          setError(null);
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(formatRequestError(pollError));
        }
      } finally {
        statusPollInFlight.current = false;
      }
    };

    void pollStatus();
    const interval = setInterval(() => {
      void pollStatus();
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [applyStatus, client]);

  const applyPairingValue = useCallback(async (value: string) => {
    try {
      const parsed = parsePairingUri(value);
      parsed.host = normalizeEchoLinkHost(parsed.host);
      setEchoConnectionEnabled(true);
      setConnection(parsed);
      setConnectionDraft(connectionDraftFrom(parsed));
      await saveConnection(parsed);
      setPairingText('');
      setError(null);
      switchPage('control');
    } catch (pairingError) {
      Alert.alert(text.pairingFailedTitle, pairingError instanceof Error ? pairingError.message : String(pairingError));
    }
  }, [switchPage, text.pairingFailedTitle]);
  const applyPairingText = useCallback(async () => {
    await applyPairingValue(pairingText);
  }, [applyPairingValue, pairingText]);

  const applyPowerampPairingValue = useCallback((value: string) => {
    try {
      const nextConnection = parsePowerampPairingUri(value);
      setPowerampConnection(nextConnection);
      setPowerampConnectionDraft(powerampConnectionDraftFrom(nextConnection));
      setPowerampRemoteEnabled(true);
      setPowerampError(null);
    } catch (pairingError) {
      Alert.alert(
        languageIsEnglish ? 'Poweramp pairing failed' : 'Poweramp 配对失败',
        pairingError instanceof Error ? pairingError.message : String(pairingError),
      );
    }
  }, [languageIsEnglish]);

  const saveManualConnection = useCallback(async () => {
    const host = normalizeEchoLinkHost(connectionDraft.host);
    const token = normalizeEchoLinkToken(connectionDraft.token);
    const port = Number(connectionDraft.port);
    if (!host || !token || !Number.isInteger(port) || port < 1 || port > 65535) {
      Alert.alert(
        text.connectionErrorTitle,
        languageIsEnglish
          ? 'Enter a valid computer address, port (1-65535), and pairing token.'
          : '请输入有效的电脑地址、端口（1-65535）和配对 Token。',
      );
      return;
    }
    const nextConnection = {
      ...connectionDraft,
      host,
      token,
      port,
      scheme: connection.scheme || 'http',
    };
    try {
      await saveConnection(nextConnection);
      setEchoConnectionEnabled(true);
      setConnection(nextConnection);
      setConnectionDraft(connectionDraftFrom(nextConnection));
      setError(null);
      switchPage('control');
    } catch (saveError) {
      Alert.alert(
        languageIsEnglish ? 'Connection not saved' : '连接未保存',
        formatRequestError(saveError),
      );
    }
  }, [connectionDraft, languageIsEnglish, switchPage, text.connectionErrorTitle]);

  const savePowerampRemoteConnection = useCallback(() => {
    const host = normalizePowerampRemoteHost(powerampConnectionDraft.host);
    const token = normalizePowerampRemoteToken(powerampConnectionDraft.token);
    const port = Number(powerampConnectionDraft.port);
    if (!host || !token || !Number.isInteger(port) || port < 1 || port > 65535) {
      Alert.alert(
        text.connectionErrorTitle,
        languageIsEnglish
          ? 'Enter a valid Poweramp Remote address, port (1-65535), and pairing token.'
          : '请输入有效的 Poweramp 远程地址、端口（1-65535）和配对令牌。',
      );
      return;
    }
    const nextConnection: PowerampRemoteConnection = {
      host,
      name: powerampConnectionDraft.name.trim() || 'Poweramp',
      port,
      scheme: powerampConnectionDraft.scheme === 'https' ? 'https' : 'http',
      token,
    };
    setPowerampConnection(nextConnection);
    setPowerampConnectionDraft(powerampConnectionDraftFrom(nextConnection));
    setPowerampRemoteEnabled(true);
    setPowerampError(null);
  }, [languageIsEnglish, powerampConnectionDraft, text.connectionErrorTitle]);

  const startNeteaseLogin = useCallback(async () => {
    beginStreamingBusy();
    setStreamingQrCookie('');
    setStreamingQrKey('');
    setStreamingQrUrl('');
    setStreamingStatusText('');
    try {
      const login = await createNeteaseQrLogin(streamingApiBaseUrl);
      setStreamingQrCookie(login.cookie);
      setStreamingQrKey(login.key);
      setStreamingQrUrl(login.qrUrl);
      setStreamingStatusText(appLanguage === 'en' ? 'Scan with NetEase Cloud Music.' : '请使用网易云音乐扫码登录');
    } catch (loginError) {
      setStreamingStatusText(formatRequestError(loginError));
    } finally {
      endStreamingBusy();
    }
  }, [appLanguage, beginStreamingBusy, endStreamingBusy, streamingApiBaseUrl]);

  const logoutNetease = useCallback(async () => {
    await clearNeteaseSession();
    if (playbackOutputMode === 'streaming') {
      devicePlaybackRequestRef.current += 1;
      setPhoneAudioBusy(false);
      phonePlayer.pause();
      phonePlayer.clearLockScreenControls();
      await stopDspPlayback();
      setDspStatus((current) => ({ ...current, currentTime: 0, didJustFinish: false, playing: false }));
      setPlaybackOutputMode('local');
    }
    setStreamingCookie('');
    setStreamingSessionOrigin('');
    setStreamingProfile(null);
    setStreamingPlaylists([]);
    setStreamingTracks([]);
    setStreamingTrack(null);
    setStreamingQrCookie('');
    setStreamingQrKey('');
    setStreamingQrUrl('');
    setStreamingStatusText('');
  }, [phonePlayer, playbackOutputMode, stopDspPlayback]);

  useEffect(() => {
    if (!streamingApiBaseUrl || !streamingQrKey) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await checkNeteaseQrLogin(streamingApiBaseUrl, streamingQrKey, streamingQrCookie);
        if (cancelled) return;
        const responseCookie = response.cookie ?? '';
        if (responseCookie) setStreamingQrCookie(responseCookie);
        if (response.code === 803 && /(?:^|;\s*)MUSIC_(?:U|A)=/u.test(responseCookie)) {
          const apiBaseUrl = normalizeNeteaseApiBaseUrl(streamingApiBaseUrl);
          await saveNeteaseSession({ apiBaseUrl, cookie: responseCookie });
          if (cancelled) return;
          setStreamingProfile(null);
          setStreamingPlaylists([]);
          setStreamingTracks([]);
          setStreamingCookie(responseCookie);
          setStreamingSessionOrigin(apiBaseUrl);
          setStreamingQrCookie('');
          setStreamingQrKey('');
          setStreamingQrUrl('');
          setStreamingStatusText(appLanguage === 'en' ? 'Signed in.' : '登录成功');
          return;
        }
        if (response.code === 803) {
          setStreamingQrCookie('');
          setStreamingQrKey('');
          setStreamingQrUrl('');
          setStreamingStatusText(appLanguage === 'en'
            ? 'Signed in, but iOS did not return the session cookie. Please try again.'
            : '已确认登录，但 iOS 未返回会话凭据，请重新扫码。');
          return;
        }
        if (response.code === 800) {
          setStreamingQrCookie('');
          setStreamingQrKey('');
          setStreamingQrUrl('');
          setStreamingStatusText(appLanguage === 'en' ? 'QR code expired.' : '二维码已过期，请重新生成');
          return;
        }
        setStreamingStatusText(response.code === 802
          ? (appLanguage === 'en' ? 'Confirm sign-in on your phone.' : '请在手机上确认登录')
          : (appLanguage === 'en' ? 'Waiting for scan.' : '等待扫码'));
      } catch (pollError) {
        if (!cancelled) setStreamingStatusText(formatRequestError(pollError));
      }
      if (!cancelled) timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [appLanguage, streamingApiBaseUrl, streamingQrCookie, streamingQrKey, streamingQrPollToken]);

  const importLocalLibrary = useCallback(async () => {
    setLocalLibraryBusy(true);
    setLocalLibraryError(null);
    try {
      const previousIds = new Set(localTracks.map((track) => track.id));
      const result = await importLocalMusicFiles();
      if (!result) {
        return;
      }
      setLocalTracks(result.tracks);
      setLocalStorageBytes(await getLocalMusicStorageUsage());
      setLocalLibraryLoaded(true);
      setLibrarySource('local');
      if (autoQueueImportedLocalTracks) {
        const importedIds = result.tracks
          .map((track) => track.id)
          .filter((id) => !previousIds.has(id));
        if (importedIds.length > 0) {
          setLocalQueueActive(true);
          setLocalQueueTrackIds((current) => [...current, ...importedIds.filter((id) => !current.includes(id))]);
        }
      }
      if (result.importedCount === 0) {
        showErrorAlert(text.importNoFilesTitle, text.importNoFilesMessage);
      }
    } catch (importError) {
      setLocalLibraryError(formatRequestError(importError));
    } finally {
      setLocalLibraryBusy(false);
    }
  }, [autoQueueImportedLocalTracks, localTracks, showErrorAlert, text.importNoFilesMessage, text.importNoFilesTitle]);

  const markLocalTrackPlayed = useCallback((trackId: string) => {
    setRecentLocalTrackIds((current) => [trackId, ...current.filter((id) => id !== trackId)].slice(0, 50));
  }, []);

  const markEchoTrackPlayed = useCallback((trackId: string) => {
    setRecentEchoTrackIds((current) => [trackId, ...current.filter((id) => id !== trackId)].slice(0, 50));
  }, []);

  const markPowerampTrackPlayed = useCallback((trackId: string) => {
    setRecentPowerampTrackIds((current) => [trackId, ...current.filter((id) => id !== trackId)].slice(0, 50));
  }, []);

  const toggleLocalFavorite = useCallback((track: LocalMusicTrack) => {
    setFavoriteLocalTrackIds((current) => (
      current.includes(track.id)
        ? current.filter((id) => id !== track.id)
        : [track.id, ...current]
    ));
  }, []);

  const toggleEchoFavorite = useCallback((trackId: string) => {
    setFavoriteEchoTrackIds((current) => (
      current.includes(trackId) ? current.filter((id) => id !== trackId) : [trackId, ...current]
    ));
  }, []);

  const togglePowerampFavorite = useCallback((trackId: string) => {
    setFavoritePowerampTrackIds((current) => (
      current.includes(trackId) ? current.filter((id) => id !== trackId) : [trackId, ...current]
    ));
  }, []);

  const addLocalTrackToQueue = useCallback((track: LocalMusicTrack) => {
    setLocalQueueActive(true);
    setLocalQueueTrackIds((current) => [...current.filter((id) => id !== track.id), track.id]);
    setLibrarySource('local');
  }, []);

  const playLocalTrackNext = useCallback((track: LocalMusicTrack) => {
    setLocalQueueActive(true);
    setLocalQueueTrackIds((current) => {
      const queue = localQueueActive || current.length > 0 ? current : localTracks.map((item) => item.id);
      const next = queue.filter((id) => id !== track.id);
      const currentIndex = localTrack?.id ? next.indexOf(localTrack.id) : -1;
      const insertIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
      next.splice(insertIndex, 0, track.id);
      return next;
    });
    setLibrarySource('local');
  }, [localQueueActive, localTrack?.id, localTracks]);

  const moveLocalQueueTrack = useCallback((track: LocalMusicTrack, direction: -1 | 1) => {
    setLocalQueueActive(true);
    setLocalQueueTrackIds((current) => {
      const queue = localQueueActive || current.length > 0 ? current : localTracks.map((item) => item.id);
      const index = queue.indexOf(track.id);
      return moveItem(queue, index, direction);
    });
  }, [localQueueActive, localTracks]);

  const performDeleteLocalTrack = useCallback(async (track: LocalMusicTrack) => {
    setLocalLibraryBusy(true);
    try {
      if (localTrack?.id === track.id) {
        devicePlaybackRequestRef.current += 1;
        phonePlayer.pause();
        phonePlayer.clearLockScreenControls();
        await stopDspPlayback();
      }
      const nextTracks = await deleteLocalMusicTrack(track);
      setLocalTracks(nextTracks);
      setLocalStorageBytes(await getLocalMusicStorageUsage());
      setFavoriteLocalTrackIds((current) => current.filter((id) => id !== track.id));
      setLocalQueueTrackIds((current) => current.filter((id) => id !== track.id));
      setPlaylists((current) => current.map((playlist) => ({
        ...playlist,
        tracks: playlist.tracks.filter((item) => !(item.source === 'local' && item.id === track.id)),
      })));
      setRecentLocalTrackIds((current) => current.filter((id) => id !== track.id));
      if (localTrack?.id === track.id) {
        setLocalTrack(null);
        setPhoneSeekPreviewMs(null);
        setDspStatus((current) => ({ ...current, currentTime: 0, didJustFinish: false, playing: false }));
      }
    } catch (deleteError) {
      setLocalLibraryError(formatRequestError(deleteError));
    } finally {
      setLocalLibraryBusy(false);
    }
  }, [localTrack?.id, phonePlayer, stopDspPlayback]);

  const deleteLocalTrack = useCallback((track: LocalMusicTrack) => {
    if (!confirmBeforeDeletingLocalTracks) {
      void performDeleteLocalTrack(track);
      return;
    }
    Alert.alert(text.deleteLocalTrackTitle, `${text.confirmDeleteLocalTrackMessagePrefix}「${track.title}」${text.confirmDeleteLocalTrackMessageSuffix}`, [
      { style: 'cancel', text: text.alertCancel },
      {
        style: 'destructive',
        text: text.deleteConfirmAction,
        onPress: () => void performDeleteLocalTrack(track),
      },
    ]);
  }, [
    confirmBeforeDeletingLocalTracks,
    performDeleteLocalTrack,
    text.alertCancel,
    text.confirmDeleteLocalTrackMessagePrefix,
    text.confirmDeleteLocalTrackMessageSuffix,
    text.deleteConfirmAction,
    text.deleteLocalTrackTitle,
  ]);

  const importLyricsForLocalTrack = useCallback(async (track: LocalMusicTrack) => {
    setLocalLibraryBusy(true);
    setLocalLibraryError(null);
    try {
      const nextTracks = await importLocalLyricFile(track);
      if (!nextTracks) {
        return;
      }
      setLocalTracks(nextTracks);
      setLocalStorageBytes(await getLocalMusicStorageUsage());
      setLyricsTrackId(null);
      setLyricsText('');
      setLyricsError(null);
    } catch (lyricsImportError) {
      setLocalLibraryError(formatRequestError(lyricsImportError));
    } finally {
      setLocalLibraryBusy(false);
    }
  }, []);

  const sendCommand = useCallback(async (command: Parameters<NonNullable<typeof client>['sendPlaybackCommand']>[0]) => {
    if (!client) {
      return null;
    }
    beginBusy();
    setError(null);
    try {
      const nextStatus = await client.sendPlaybackCommand(command);
      if (activeClientRef.current !== client) return null;
      applyStatus(nextStatus);
      return nextStatus;
    } catch (commandError) {
      if (activeClientRef.current === client) setError(formatRequestError(commandError));
      return null;
    } finally {
      endBusy();
    }
  }, [applyStatus, beginBusy, client, endBusy]);

  const sendPowerampCommand = useCallback(async (command: Parameters<NonNullable<typeof powerampClient>['sendCommand']>[0]) => {
    if (!powerampClient) return null;
    setPowerampBusy(true);
    setPowerampError(null);
    try {
      const nextStatus = await powerampClient.sendCommand(command);
      if (activePowerampClientRef.current !== powerampClient) return null;
      setPowerampStatus(nextStatus);
      setPowerampStatusReceivedAtMs(Date.now());
      return nextStatus;
    } catch (commandError) {
      if (activePowerampClientRef.current === powerampClient) setPowerampError(formatRequestError(commandError));
      return null;
    } finally {
      if (activePowerampClientRef.current === powerampClient) setPowerampBusy(false);
    }
  }, [powerampClient]);

  const playTrackOnPc = useCallback((track: EchoLinkTrackPreview) => {
    if (!client) {
      setConnectPanelMode('echo');
      switchPage('connect');
      return;
    }
    const requestId = ++devicePlaybackRequestRef.current;
    setPhoneAudioBusy(false);
    void sendCommand({ command: 'playTrack', trackId: track.id, output: 'pc' }).then((nextStatus) => {
      if (!nextStatus || devicePlaybackRequestRef.current !== requestId) return;
      phonePlayer.pause();
      phonePlayer.clearLockScreenControls();
      void stopDspPlayback();
      setPhoneSeekPreviewMs(null);
      setPhoneAudioError(null);
      setPlaybackOutputMode('pc');
      markEchoTrackPlayed(track.id);
    });
  }, [client, markEchoTrackPlayed, phonePlayer, sendCommand, stopDspPlayback, switchPage]);

  const nowPlaying = status?.playback.track;
  const powerampNowPlaying = powerampStatus?.playback.track;
  const playbackQueue = status?.playback.queue;
  const isLocalOutput = playbackOutputMode === 'local';
  const isPhoneOutput = playbackOutputMode === 'phone';
  const isPowerampControlOutput = playbackOutputMode === 'remoteControl';
  const isPowerampStreamOutput = playbackOutputMode === 'remoteStream';
  const isStreamingOutput = playbackOutputMode === 'streaming';
  const isDeviceOutput = isLocalOutput || isPhoneOutput || isPowerampStreamOutput || isStreamingOutput;
  const useDspPlayback = echoAudioDsp.isAvailable && dspPlaybackActive;
  const nativePlayerEnabled = Platform.OS === 'ios' && echoAudioDsp.isAvailable;
  const currentEqOption = useMemo(() => (
    eqPresetOptions.find((option) => option.key === eqPreset) ?? defaultEqOption
  ), [eqPreset]);
  const currentEqLabel = eqPreset === 'custom'
    ? text.customEq
    : languageIsEnglish ? currentEqOption.labelEn : currentEqOption.labelZh;
  const localTrackById = useMemo(() => new Map(localTracks.map((track) => [track.id, track])), [localTracks]);
  const echoTrackById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const powerampTrackById = useMemo(() => new Map(powerampTracks.map((track) => [track.id, track])), [powerampTracks]);
  const favoriteEchoTrackIdSet = useMemo(() => new Set(favoriteEchoTrackIds), [favoriteEchoTrackIds]);
  const favoriteLocalTrackIdSet = useMemo(() => new Set(favoriteLocalTrackIds), [favoriteLocalTrackIds]);
  const favoritePowerampTrackIdSet = useMemo(() => new Set(favoritePowerampTrackIds), [favoritePowerampTrackIds]);
  const localQueueTracks = useMemo(() => (
    localQueueTrackIds
      .map((id) => localTrackById.get(id))
      .filter((track): track is LocalMusicTrack => Boolean(track))
  ), [localQueueTrackIds, localTrackById]);
  const localPlaybackItems = localQueueActive ? localQueueTracks : localTracks;
  const activePlaybackPlaylist = activePlaybackPlaylistId
    ? playlists.find((playlist) => playlist.id === activePlaybackPlaylistId) ?? null
    : null;
  const playlistItems: PlaybackListTrack[] = activePlaybackPlaylist
    ? activePlaybackPlaylist.tracks
    : isLocalOutput
      ? localPlaybackItems
      : isStreamingOutput ? streamingTracks
        : isPowerampStreamOutput ? powerampTracks
          : isPowerampControlOutput ? (powerampNowPlaying ? [powerampNowPlaying] : []) : playbackQueue?.items ?? [];
  const activeStreamingPlaylist = selectedStreamingPlaylistId
    ? streamingPlaylists.find((playlist) => playlist.id === selectedStreamingPlaylistId) ?? null
    : null;
  const queueCanEdit = Boolean(
    activePlaybackPlaylist
    || isLocalOutput
    || isStreamingOutput
    || isPowerampStreamOutput
    || (playbackOutputMode === 'pc' && client && playlistItems.length > 0)
  );
  const queueSource: 'echo' | 'local' | 'remote' | 'streaming' = isStreamingOutput
    ? 'streaming'
    : isPowerampStreamOutput || isPowerampControlOutput ? 'remote' : isLocalOutput ? 'local' : 'echo';
  const queueSubtitle = activePlaybackPlaylist
    ? `${languageIsEnglish ? 'Playlist' : '歌单'} · ${activePlaybackPlaylist.name}`
    : isStreamingOutput && activeStreamingPlaylist
      ? `${languageIsEnglish ? 'NetEase' : '网易云'} · ${activeStreamingPlaylist.name}`
      : isPowerampStreamOutput || isPowerampControlOutput
        ? `${languageIsEnglish ? 'Poweramp' : 'Poweramp'} · ${powerampConnection?.name ?? 'Android'}`
      : isLocalOutput
        ? (localQueueActive
          ? (languageIsEnglish ? 'Local queue' : '本地播放队列')
          : (languageIsEnglish ? 'Local library' : '本地曲库'))
        : status?.device.name
          ? `ECHO · ${status.device.name}`
          : 'ECHO';
  const visiblePlaylistItems = playlistItems.slice(0, 8);
  const hiddenPlaylistItemCount = Math.max(0, playlistItems.length - visiblePlaylistItems.length);
  const displayTrack = isLocalOutput
    ? localTrack
    : isStreamingOutput ? streamingTrack
      : isPowerampStreamOutput ? powerampStreamTrack
        : isPowerampControlOutput ? powerampNowPlaying : isPhoneOutput ? phoneTrack ?? nowPlaying : nowPlaying;
  const currentTrackFavorite = Boolean(displayTrack && (
    isLocalOutput
      ? favoriteLocalTrackIdSet.has(displayTrack.id)
      : isPowerampStreamOutput || isPowerampControlOutput
        ? favoritePowerampTrackIdSet.has(displayTrack.id)
        : isStreamingOutput ? false : favoriteEchoTrackIdSet.has(displayTrack.id)
  ));
  const toggleCurrentFavorite = useCallback(() => {
    if (!displayTrack) return;
    if (isLocalOutput) {
      const track = localTrackById.get(displayTrack.id);
      if (track) toggleLocalFavorite(track);
      return;
    }
    if (isPowerampStreamOutput || isPowerampControlOutput) {
      togglePowerampFavorite(displayTrack.id);
      return;
    }
    if (!isStreamingOutput) toggleEchoFavorite(displayTrack.id);
  }, [displayTrack, isLocalOutput, isPowerampControlOutput, isPowerampStreamOutput, isStreamingOutput, localTrackById, toggleEchoFavorite, toggleLocalFavorite, togglePowerampFavorite]);
  const replaceEchoQueue = useCallback((items: PlaybackListTrack[], startTrackId: string | null = displayTrack?.id ?? null) => {
    if (!client) return;
    const requestId = ++devicePlaybackRequestRef.current;
    setPhoneAudioBusy(false);
    void sendCommand({
      command: 'queueReplace',
      output: 'pc',
      ...(startTrackId ? { startTrackId } : {}),
      trackIds: items.map((track) => track.id),
    }).then((nextStatus) => {
      if (!nextStatus || devicePlaybackRequestRef.current !== requestId) return;
      phonePlayer.pause();
      phonePlayer.clearLockScreenControls();
      void stopDspPlayback();
      setPhoneSeekPreviewMs(null);
      setPhoneAudioError(null);
      setPlaybackOutputMode('pc');
    });
  }, [client, displayTrack?.id, phonePlayer, sendCommand, stopDspPlayback]);
  const reorderEchoQueue = useCallback((items: PlaybackListTrack[], startTrackId: string | null = displayTrack?.id ?? null) => {
    if (items.length === 0) {
      void sendCommand({ command: 'queueClear', output: 'pc' });
      return;
    }
    void sendCommand({
      command: 'queueReorder',
      output: 'pc',
      ...(startTrackId ? { startTrackId } : {}),
      trackIds: items.map((track) => track.id),
    });
  }, [displayTrack?.id, sendCommand]);
  const playEchoTrackOnPc = useCallback((track: EchoLinkTrackPreview, playlistId?: string) => {
    if (!client) {
      playTrackOnPc(track);
      return;
    }
    const playlist = playlistId ? playlists.find((item) => item.id === playlistId) : null;
    const echoTracks = playlist?.tracks.filter((item) => item.source === 'echo') ?? [];
    if (echoTracks.some((item) => item.id === track.id)) {
      replaceEchoQueue(echoTracks, track.id);
    } else {
      playTrackOnPc(track);
    }
  }, [client, playTrackOnPc, playlists, replaceEchoQueue]);
  const deviceTrack = isLocalOutput
    ? localTrack
    : isStreamingOutput ? streamingTrack : isPowerampStreamOutput ? powerampStreamTrack : isPhoneOutput ? phoneTrack : null;
  const externalMetadataKey = externalMetadataKeyForTrack(displayTrack);
  activeExternalMetadataKeyRef.current = externalMetadataKey;
  const currentExternalMetadata = externalMetadataKey ? externalMetadataByKey[externalMetadataKey] : undefined;
  const currentExternalFieldSources = externalMetadataKey
    ? externalMetadataFieldSourcesByKey[externalMetadataKey]
    : undefined;
  const displayArtist = currentExternalFieldSources?.artist
    ? currentExternalMetadata?.artist?.trim() || displayTrack?.artist?.trim() || ''
    : displayTrack?.artist?.trim() || currentExternalMetadata?.artist?.trim() || '';
  const nativeArtworkUrl = resolveArtworkUrl(displayTrack?.artworkUrl);
  const nativeArtworkVisible = artworkUrlIsVisible(nativeArtworkUrl);
  const externalArtworkUrl = resolveArtworkUrl(currentExternalMetadata?.albumArt);
  const externalArtworkVisible = artworkUrlIsVisible(externalArtworkUrl);
  const lyricsTextIsUsable = lyricsTrackId === displayTrack?.id
    && Boolean(lyricsText.trim())
    && lyricsText !== text.noLyrics
    && !lyricsError;
  const hasExistingArtworkOrLyrics = nativeArtworkVisible
    || externalArtworkVisible
    || Boolean(currentExternalMetadata?.lyrics?.trim())
    || Boolean(isLocalOutput && localTrack?.hasLyrics)
    || lyricsTextIsUsable;
  const hasManualExternalMetadataRefresh = Boolean(
    externalMetadataKey && externalMetadataManualRefreshKey === externalMetadataKey,
  );
  const displayArtworkUrl = currentExternalFieldSources?.albumArt && externalArtworkVisible
    ? externalArtworkUrl
    : nativeArtworkVisible
      ? nativeArtworkUrl
      : externalArtworkVisible ? externalArtworkUrl : null;
  const shouldSearchExternalMetadata = (externalMetadataSearchEnabled || hasManualExternalMetadataRefresh)
    && (!externalMetadataSkipExisting || hasManualExternalMetadataRefresh || !hasExistingArtworkOrLyrics);
  const echoConnectionBroken = echoConnectionEnabled && Boolean(error);
  const echoConnectionOnline = echoConnectionEnabled && Boolean(status && !echoConnectionBroken);
  const powerampConnectionOnline = powerampRemoteEnabled && Boolean(powerampStatus && !powerampError);
  const connectedLabel = isPowerampControlOutput || isPowerampStreamOutput
    ? (powerampConnectionOnline
      ? `${languageIsEnglish ? 'Connected to' : '已连接'} ${powerampConnection?.name ?? 'Poweramp'}`
      : (languageIsEnglish ? 'Poweramp not connected' : 'Poweramp 未连接'))
    : !echoConnectionEnabled
    ? text.echoOff
    : echoConnectionBroken
    ? text.echoNotConnected
    : status
      ? `${text.connectedPrefix} ${status.device.name}`
      : client
        ? text.connectingLabel
        : text.echoNotConnected;
  const playerConnectionDetail = isPowerampControlOutput || isPowerampStreamOutput
    ? powerampConnection?.name ?? 'Poweramp'
    : status?.device.name ?? 'ECHO Link';
  const pcPlaybackPositionMs = status
    ? Math.max(0, Math.min(
      status.playback.durationMs || Number.MAX_SAFE_INTEGER,
      status.playback.positionMs + (status.playback.state === 'playing' ? Math.max(0, clockMs - statusReceivedAtMs) : 0),
    ))
    : 0;
  const powerampPlaybackPositionMs = powerampStatus
    ? Math.max(0, Math.min(
      powerampStatus.playback.durationMs || Number.MAX_SAFE_INTEGER,
      powerampStatus.playback.positionMs + (powerampStatus.playback.state === 'playing'
        ? Math.max(0, clockMs - powerampStatusReceivedAtMs)
        : 0),
    ))
    : 0;
  const phonePlaybackPositionMs = useDspPlayback
    ? Math.max(0, Math.round(dspStatus.currentTime * 1000))
    : Math.max(0, Math.round(phonePlayerStatus.currentTime * 1000));
  const playbackPositionMs = isDeviceOutput
    ? phoneSeekPreviewMs ?? phonePlaybackPositionMs
    : isPowerampControlOutput ? powerampPlaybackPositionMs : pcPlaybackPositionMs;
  const playbackDurationMs = isDeviceOutput
    ? Math.max(0, Math.round((useDspPlayback ? dspStatus.duration : phonePlayerStatus.duration) * 1000) || displayTrack?.durationMs || 0)
    : isPowerampControlOutput ? powerampStatus?.playback.durationMs ?? 0 : status?.playback.durationMs ?? 0;
  const progressRatio = playbackDurationMs
    ? clamp01(playbackPositionMs / playbackDurationMs)
    : 0;
  const outputVolume = isDeviceOutput ? phoneVolume : isPowerampControlOutput ? powerampStatus?.playback.volume ?? 0 : status?.playback.volume ?? 0;
  const volumePercent = Math.round(outputVolume * 100);
  const isPlaybackActive = isDeviceOutput
    ? (useDspPlayback ? dspStatus.playing : phonePlayerStatus.playing)
    : isPowerampControlOutput ? powerampStatus?.playback.state === 'playing' : status?.playback.state === 'playing';
  const remotePlaybackState = isPowerampControlOutput
    ? powerampStatus?.playback.state
    : status?.playback.state;
  const shouldPublishNativeNowPlaying = Boolean(displayTrack) && (
    isDeviceOutput
      ? dspPlaybackActive
      : Boolean(remotePlaybackState && remotePlaybackState !== 'idle' && remotePlaybackState !== 'stopped' && remotePlaybackState !== 'error')
  );

  useEffect(() => {
    if (!echoAudioDsp.isAvailable) {
      return;
    }
    if (!shouldPublishNativeNowPlaying || !displayTrack) {
      if (nativeNowPlayingPublishedRef.current) {
        void clearNativeNowPlaying();
      }
      return;
    }

    const artist = displayArtist || (languageIsEnglish ? 'Unknown Artist' : '未知艺术家');
    const positionSeconds = Math.max(0, playbackPositionMs / 1000);
    const signature = [
      displayTrack.id,
      displayTrack.title,
      artist,
      displayTrack.album,
      displayArtworkUrl ?? '',
      Math.round(playbackDurationMs),
      Math.round(positionSeconds),
      isPlaybackActive ? 'playing' : 'paused',
    ].join('|');
    if (nativeNowPlayingSnapshotRef.current === signature) {
      return;
    }

    nativeNowPlayingPublishedRef.current = true;
    nativeNowPlayingSnapshotRef.current = signature;
    void echoAudioDsp.updateNowPlaying({
      album: displayTrack.album?.trim() ?? '',
      artist,
      artworkUrl: displayArtworkUrl ?? '',
      durationSeconds: playbackDurationMs / 1000,
      isPlaying: isPlaybackActive,
      positionSeconds,
      title: displayTrack.title,
    }).catch(() => {
      nativeNowPlayingPublishedRef.current = false;
    });
  }, [
    clearNativeNowPlaying,
    displayArtist,
    displayArtworkUrl,
    displayTrack,
    dspPlaybackActive,
    isPlaybackActive,
    languageIsEnglish,
    playbackDurationMs,
    playbackPositionMs,
    shouldPublishNativeNowPlaying,
  ]);
  const playbackControlsEnabled = !phoneAudioBusy && (isLocalOutput
    ? Boolean(localTrack || localTracks.length > 0)
    : isPhoneOutput
      ? Boolean(phoneTrack)
      : isPowerampStreamOutput
        ? Boolean(powerampStreamTrack)
      : isStreamingOutput
        ? Boolean(streamingTrack)
        : isPowerampControlOutput ? Boolean(powerampClient) : Boolean(client));
  const playbackTags = tagsForTrack(displayTrack, {
    outputMode: isLocalOutput
      ? '本地'
      : isStreamingOutput ? '网易云'
        : isPowerampStreamOutput ? 'Poweramp 串流'
          : isPowerampControlOutput ? 'Poweramp 控制'
            : isPhoneOutput ? '串流' : status?.playback.outputMode,
    visibleAudioTags: audioTagVisibility,
  });

  useEffect(() => {
    const shouldLookupLrcApi = shouldSearchExternalMetadata && lrcApiExternalDataEnabled;
    const shouldLookupLrclib = shouldSearchExternalMetadata && lrclibExternalDataEnabled;
    const shouldLookupNetease = shouldSearchExternalMetadata && neteaseExternalDataEnabled;
    if ((!shouldLookupLrcApi && !shouldLookupLrclib && !shouldLookupNetease) || !displayTrack || !externalMetadataKey
      || ignoredExternalMetadataKeysRef.current.has(externalMetadataKey)) {
      return undefined;
    }
    const lookupKey = `${externalMetadataKey}::lrcapi:${shouldLookupLrcApi ? '1' : '0'}::lrclib:${shouldLookupLrclib ? '1' : '0'}::netease:${shouldLookupNetease ? '1' : '0'}`;
    if (externalMetadataLookupKeysRef.current.has(lookupKey)) {
      return undefined;
    }
    externalMetadataLookupKeysRef.current.add(lookupKey);

    setExternalMetadataByKey((current) => ({
      ...current,
      [externalMetadataKey]: {
        albumArt: current[externalMetadataKey]?.albumArt ?? null,
        artist: current[externalMetadataKey]?.artist ?? null,
        error: null,
        lyrics: current[externalMetadataKey]?.lyrics ?? null,
        sourceTitle: current[externalMetadataKey]?.sourceTitle ?? null,
        status: 'loading',
      },
    }));

    const lookupTrack = displayTrack;
    let cancelled = false;
    void lookupExternalMetadataCandidates(lookupTrack, {
      lrcapi: shouldLookupLrcApi,
      lrclib: shouldLookupLrclib,
      netease: shouldLookupNetease,
    }, {
      includeNeteaseLyrics: neteaseExternalDataEnabled,
    })
      .then((candidates) => {
        if (cancelled) return;
        if (candidates.length > 0 && externalDataSelectionMode === 'ask') {
          if (activeExternalMetadataKeyRef.current !== externalMetadataKey) {
            externalMetadataLookupKeysRef.current.delete(lookupKey);
            return;
          }
          setPendingExternalMetadataSelection({
            candidates,
            id: lookupKey,
            metadataKey: externalMetadataKey,
          });
          return;
        }
        const sourcePriority: Record<ExternalMetadataField, ExternalMetadataSource[]> = {
          albumArt: ['netease', 'lrcapi', 'lrclib'],
          artist: ['lrcapi', 'netease', 'lrclib'],
          lyrics: ['lrclib', 'lrcapi', 'netease'],
        };
        const selected = (field: ExternalMetadataField) => sourcePriority[field]
          .map((source) => candidates.find((candidate) => candidate.source === source && Boolean(candidate[field])))
          .find(Boolean);
        const artworkCandidate = nativeArtworkVisible ? undefined : selected('albumArt');
        const artistCandidate = selected('artist');
        const lyricsCandidate = selected('lyrics');
        const candidate = artworkCandidate ?? lyricsCandidate ?? artistCandidate;
        const fieldSources: Partial<Record<ExternalMetadataField, ExternalMetadataSource>> = {};
        if (artworkCandidate) fieldSources.albumArt = artworkCandidate.source;
        if (artistCandidate) fieldSources.artist = artistCandidate.source;
        if (lyricsCandidate) fieldSources.lyrics = lyricsCandidate.source;
        if (candidate) setExternalMetadataFieldSourcesByKey((sources) => ({
          ...sources,
          [externalMetadataKey]: fieldSources,
        }));
        setExternalMetadataByKey((current) => {
          const existing = current[externalMetadataKey];
          if (candidate) {
            return {
              ...current,
              [externalMetadataKey]: {
                albumArt: artworkCandidate?.albumArt ?? existing?.albumArt ?? null,
                artist: artistCandidate?.artist ?? existing?.artist ?? null,
                error: null,
                lyrics: lyricsCandidate?.lyrics ?? existing?.lyrics ?? null,
                sourceTitle: candidate.title,
                status: 'ready',
              },
            };
          }
          const hasMetadata = Boolean(existing?.albumArt || existing?.lyrics);
          return {
            ...current,
            [externalMetadataKey]: {
              albumArt: existing?.albumArt ?? null,
              artist: existing?.artist ?? null,
              error: hasMetadata ? null : 'No external metadata found.',
              lyrics: existing?.lyrics ?? null,
              sourceTitle: existing?.sourceTitle ?? null,
              status: hasMetadata ? 'ready' : 'error',
            },
          };
        });
      })
      .catch((externalError) => {
        if (cancelled) return;
        externalMetadataLookupKeysRef.current.delete(lookupKey);
        setExternalMetadataByKey((current) => {
          const existing = current[externalMetadataKey];
          const hasMetadata = Boolean(existing?.albumArt || existing?.lyrics);
          return {
            ...current,
            [externalMetadataKey]: {
              albumArt: existing?.albumArt ?? null,
              artist: existing?.artist ?? null,
              error: hasMetadata ? null : formatRequestError(externalError),
              lyrics: existing?.lyrics ?? null,
              sourceTitle: existing?.sourceTitle ?? null,
              status: hasMetadata ? 'ready' : 'error',
            },
          };
        });
      })
      .finally(() => {
        setExternalMetadataManualRefreshKey((current) => (
          current === externalMetadataKey ? null : current
        ));
      });
    return () => {
      cancelled = true;
      externalMetadataLookupKeysRef.current.delete(lookupKey);
    };
  }, [
    displayTrack,
    externalDataSelectionMode,
    externalMetadataKey,
    externalMetadataManualRefreshKey,
    externalMetadataRefreshToken,
    externalMetadataSearchEnabled,
    externalMetadataSkipExisting,
    hasExistingArtworkOrLyrics,
    lrcApiExternalDataEnabled,
    lrclibExternalDataEnabled,
    neteaseExternalDataEnabled,
    nativeArtworkVisible,
  ]);

  useEffect(() => {
    const pending = pendingExternalMetadataSelection;
    if (!pending || pending.metadataKey === externalMetadataKey) return;
    externalMetadataLookupKeysRef.current.delete(pending.id);
    setExternalMetadataByKey((current) => {
      const existing = current[pending.metadataKey];
      if (!existing || existing.status !== 'loading') return current;
      return {
        ...current,
        [pending.metadataKey]: {
          ...existing,
          status: existing.albumArt || existing.artist || existing.lyrics ? 'ready' : 'error',
        },
      };
    });
    setPendingExternalMetadataSelection(null);
  }, [externalMetadataKey, pendingExternalMetadataSelection]);

  useEffect(() => {
    externalMetadataLookupKeysRef.current.clear();
    ignoredExternalMetadataKeysRef.current.clear();
    libraryArtworkLookupKeysRef.current.clear();
    setExternalMetadataManualRefreshKey(null);
    setExternalMetadataByKey({});
    setExternalMetadataFieldSourcesByKey({});
    setPendingExternalMetadataSelection(null);
  }, [externalDataSelectionMode, externalMetadataSearchEnabled, lrcApiExternalDataEnabled, lrclibExternalDataEnabled, neteaseExternalDataEnabled]);

  useEffect(() => {
    if (!echoAudioDsp.isAvailable) {
      return;
    }
    void echoAudioDsp.setEq(eqGains).catch((dspError) => {
      setPhoneAudioError(formatPhoneAudioError(dspError));
    });
  }, [eqGains]);

  useEffect(() => {
    if (!echoAudioDsp.isAvailable) {
      return;
    }
    void echoAudioDsp.setLoudness(loudnessNormalizationEnabled).catch((dspError) => {
      setPhoneAudioError(formatPhoneAudioError(dspError));
    });
  }, [loudnessNormalizationEnabled]);

  useEffect(() => {
    if (!useDspPlayback) {
      return undefined;
    }

    let cancelled = false;
    const pollDspStatus = async () => {
      try {
        const nextStatus = await echoAudioDsp.getStatus();
        if (!cancelled) {
          setDspStatus(nextStatus);
          setPhoneVolume(nextStatus.volume);
        }
      } catch (dspError) {
        if (!cancelled) {
          setPhoneAudioError(formatPhoneAudioError(dspError));
        }
      }
    };

    void pollDspStatus();
    const interval = setInterval(() => {
      void pollDspStatus();
    }, 250);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [useDspPlayback]);

  const queryFilteredEchoTracks = useMemo(() => tracks.filter((track) => {
    const normalizedQuery = query.trim().toLowerCase();
    return !normalizedQuery || (
      track.title.toLowerCase().includes(normalizedQuery)
      || track.artist.toLowerCase().includes(normalizedQuery)
      || track.album.toLowerCase().includes(normalizedQuery)
      || track.albumArtist.toLowerCase().includes(normalizedQuery)
    );
  }), [query, tracks]);
  const filteredEchoTracks = useMemo(() => queryFilteredEchoTracks.filter((track) => {
    if (libraryFilter === 'streamable') {
      return track.canPlayOnPhone;
    }
    if (libraryFilter === 'local') {
      return formatSourceTag(track.sourceLabel) === 'Local';
    }
    return true;
  }), [libraryFilter, queryFilteredEchoTracks]);
  const visibleTracks = useMemo(() => {
    if (echoLibraryView === 'favorites') return filteredEchoTracks.filter((track) => favoriteEchoTrackIdSet.has(track.id));
    if (echoLibraryView === 'recent') {
      return recentEchoTrackIds
        .map((id) => filteredEchoTracks.find((track) => track.id === id))
        .filter((track): track is EchoLinkTrackPreview => Boolean(track));
    }
    return filteredEchoTracks;
  }, [echoLibraryView, favoriteEchoTrackIdSet, filteredEchoTracks, recentEchoTrackIds]);
  const organizedEchoTracks = useMemo(() => {
    if (echoLibraryView === 'albums') {
      return sortTracksBy(visibleTracks, (track) => track.album || (languageIsEnglish ? 'Uncategorized' : '未归类专辑'));
    }
    if (echoLibraryView === 'artists') {
      return sortTracksBy(visibleTracks, (track) => track.artist || (languageIsEnglish ? 'Unknown Artist' : '未知艺术家'));
    }
    return visibleTracks;
  }, [echoLibraryView, languageIsEnglish, visibleTracks]);
  const recentLocalTrackIdSet = useMemo(() => new Set(recentLocalTrackIds), [recentLocalTrackIds]);
  const queryFilteredPowerampTracks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return powerampTracks.filter((track) => !normalizedQuery || (
      track.title.toLowerCase().includes(normalizedQuery)
      || track.artist.toLowerCase().includes(normalizedQuery)
      || track.album.toLowerCase().includes(normalizedQuery)
      || track.albumArtist.toLowerCase().includes(normalizedQuery)
    ));
  }, [powerampTracks, query]);
  const filteredPowerampTracks = useMemo(() => queryFilteredPowerampTracks.filter((track) => {
    if (libraryFilter === 'streamable') return track.canPlayOnPhone;
    if (libraryFilter === 'local') return formatSourceTag(track.sourceLabel) === 'Local';
    return true;
  }), [libraryFilter, queryFilteredPowerampTracks]);
  const visiblePowerampTracks = useMemo(() => {
    if (powerampLibraryView === 'favorites') return filteredPowerampTracks.filter((track) => favoritePowerampTrackIdSet.has(track.id));
    if (powerampLibraryView === 'recent') {
      return recentPowerampTrackIds
        .map((id) => filteredPowerampTracks.find((track) => track.id === id))
        .filter((track): track is PowerampRemoteTrack => Boolean(track));
    }
    if (powerampLibraryView === 'albums') {
      return sortTracksBy(filteredPowerampTracks, (track) => track.album || (languageIsEnglish ? 'Uncategorized' : '未归类专辑'));
    }
    if (powerampLibraryView === 'artists') {
      return sortTracksBy(filteredPowerampTracks, (track) => track.artist || (languageIsEnglish ? 'Unknown Artist' : '未知艺术家'));
    }
    return filteredPowerampTracks;
  }, [favoritePowerampTrackIdSet, filteredPowerampTracks, languageIsEnglish, powerampLibraryView, recentPowerampTrackIds]);
  const queryFilteredLocalTracks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return localTracks;
    }
    return localTracks.filter((track) => (
      track.title.toLowerCase().includes(normalizedQuery)
      || track.artist.toLowerCase().includes(normalizedQuery)
      || track.album.toLowerCase().includes(normalizedQuery)
      || track.fileName.toLowerCase().includes(normalizedQuery)
    ));
  }, [localTracks, query]);
  const visibleLocalTracks = useMemo(() => {
    if (localLibraryView === 'favorites') {
      return queryFilteredLocalTracks.filter((track) => favoriteLocalTrackIdSet.has(track.id));
    }
    if (localLibraryView === 'recent') {
      return recentLocalTrackIds
        .map((id) => queryFilteredLocalTracks.find((track) => track.id === id))
        .filter((track): track is LocalMusicTrack => Boolean(track));
    }
    if (localLibraryView === 'albums') {
      return sortTracksBy(queryFilteredLocalTracks, (track) => track.album || (languageIsEnglish ? 'Uncategorized' : '未归类专辑'));
    }
    if (localLibraryView === 'artists') {
      return sortTracksBy(queryFilteredLocalTracks, (track) => track.artist || (languageIsEnglish ? 'Unknown Artist' : '未知艺术家'));
    }
    if (localLibraryView === 'formats') {
      return [...queryFilteredLocalTracks].sort((a, b) => (
        (formatAudioQualityTag(a) || 'Unknown').localeCompare(formatAudioQualityTag(b) || 'Unknown') || a.title.localeCompare(b.title)
      ));
    }
    return queryFilteredLocalTracks;
  }, [favoriteLocalTrackIdSet, languageIsEnglish, localLibraryView, queryFilteredLocalTracks, recentLocalTrackIds]);
  const echoCollections = useMemo<LibraryCollectionPreview[]>(() => {
    const albumByTitle = new Map(albums.map((album) => [album.title, album]));
    return buildTrackCollections(
      visibleTracks,
      (track) => track.album?.trim() || (languageIsEnglish ? 'Uncategorized' : '未归类专辑'),
      (title) => `echo:${albumByTitle.get(title)?.id ?? title}`,
      (count) => `${text.echoLibrary} · ${count} ${languageIsEnglish ? 'tracks' : '首'}`,
      (title) => albumByTitle.get(title)?.artworkUrl ?? null,
    );
  }, [albums, languageIsEnglish, text.echoLibrary, visibleTracks]);
  const localCollections = useMemo(() => buildTrackCollections(
    queryFilteredLocalTracks,
    (track) => track.album?.trim() || (languageIsEnglish ? 'Uncategorized' : '未归类专辑'),
    (title) => `local:${title}`,
    (count) => `${text.localLibrary} · ${count} ${languageIsEnglish ? 'tracks' : '首'}`,
  ), [languageIsEnglish, queryFilteredLocalTracks, text.localLibrary]);
  const echoArtistCollections = useMemo(() => buildTrackCollections(
    visibleTracks,
    (track) => artistNamesForTrack(track, languageIsEnglish ? 'Unknown Artist' : '未知艺术家'),
    (title) => `echo-artist:${title}`,
    (count) => `${text.echoLibrary} · ${count} ${languageIsEnglish ? 'tracks' : '首'}`,
  ), [languageIsEnglish, text.echoLibrary, visibleTracks]);
  const localArtistCollections = useMemo(() => buildTrackCollections(
    queryFilteredLocalTracks,
    (track) => artistNamesForTrack(track, languageIsEnglish ? 'Unknown Artist' : '未知艺术家'),
    (title) => `local-artist:${title}`,
    (count) => `${text.localLibrary} · ${count} ${languageIsEnglish ? 'tracks' : '首'}`,
  ), [languageIsEnglish, queryFilteredLocalTracks, text.localLibrary]);
  const powerampCollections = useMemo(() => {
    const albumsByTitle = new Map(powerampAlbums.map((album) => [album.title, album]));
    return buildTrackCollections(
      filteredPowerampTracks,
      (track) => track.album?.trim() || (languageIsEnglish ? 'Uncategorized' : '未归类专辑'),
      (title) => `remote:${albumsByTitle.get(title)?.id ?? title}`,
      (count) => `${text.remoteLibrary} · ${count} ${languageIsEnglish ? 'tracks' : '首'}`,
      (title) => albumsByTitle.get(title)?.artworkUrl ?? null,
    );
  }, [filteredPowerampTracks, languageIsEnglish, powerampAlbums, text.remoteLibrary]);
  const powerampArtistCollections = useMemo(() => buildTrackCollections(
    filteredPowerampTracks,
    (track) => artistNamesForTrack(track, languageIsEnglish ? 'Unknown Artist' : '未知艺术家'),
    (title) => `remote-artist:${title}`,
    (count) => `${text.remoteLibrary} · ${count} ${languageIsEnglish ? 'tracks' : '首'}`,
  ), [filteredPowerampTracks, languageIsEnglish, text.remoteLibrary]);
  const sortedPlaylists = useMemo(() => [...playlists]
      .sort((a, b) => (
        Number(b.pinned) - Number(a.pinned)
        || Number(b.favorite) - Number(a.favorite)
        || b.createdAt - a.createdAt
      )), [playlists]);
  const sortedStreamingPlaylists = useMemo(() => [...streamingPlaylists].sort((a, b) => (
    Number(pinnedStreamingPlaylistIds.includes(b.id)) - Number(pinnedStreamingPlaylistIds.includes(a.id))
    || Number(favoriteStreamingPlaylistIds.includes(b.id)) - Number(favoriteStreamingPlaylistIds.includes(a.id))
    || a.name.localeCompare(b.name)
  )), [favoriteStreamingPlaylistIds, pinnedStreamingPlaylistIds, streamingPlaylists]);
  const queryFilteredStreamingPlaylists = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery
      ? sortedStreamingPlaylists.filter((playlist) => playlist.name.toLowerCase().includes(normalizedQuery))
      : sortedStreamingPlaylists;
  }, [query, sortedStreamingPlaylists]);
  const streamableTrackCount = useMemo(() => (
    tracks.filter((track) => track.canPlayOnPhone).length
  ), [tracks]);
  const pcLocalTrackCount = useMemo(() => (
    tracks.filter((track) => formatSourceTag(track.sourceLabel) === 'Local').length
  ), [tracks]);
  const showingAllLibrary = page === 'search' || librarySource === 'all';
  const browsingCollections = !showingAllLibrary
    && !selectedLibraryCollectionId
    && ((librarySource === 'echo' && (echoLibraryView === 'albums' || echoLibraryView === 'artists'))
      || (librarySource === 'remote' && (powerampLibraryView === 'albums' || powerampLibraryView === 'artists'))
      || (librarySource === 'local' && (localLibraryView === 'albums' || localLibraryView === 'artists')));
  const sourceLibraryTracks: EchoLinkTrackPreview[] = librarySource === 'streaming'
    ? streamingSessionMatchesApi ? streamingTracks : []
    : showingAllLibrary
      ? [
        ...(echoConnectionEnabled ? queryFilteredEchoTracks : []),
        ...queryFilteredLocalTracks,
        ...(powerampRemoteEnabled ? queryFilteredPowerampTracks : []),
      ]
      : librarySource === 'local'
        ? visibleLocalTracks
        : librarySource === 'remote' ? visiblePowerampTracks : organizedEchoTracks;
  const activeLibraryTracks = browsingCollections
    ? []
    : selectedLibraryCollectionId && libraryAlbumSort !== 'default'
    ? libraryAlbumSort === 'track'
      ? sortTracksByAlbumOrder(sourceLibraryTracks)
      : [...sourceLibraryTracks].sort((a, b) => {
        if (libraryAlbumSort === 'duration') return a.durationMs - b.durationMs || a.title.localeCompare(b.title);
        const left = libraryAlbumSort === 'artist' ? a.artist : a.title;
        const right = libraryAlbumSort === 'artist' ? b.artist : b.title;
        return left.localeCompare(right) || a.title.localeCompare(b.title);
      })
    : sourceLibraryTracks;
  const activeLibraryCollections = browsingCollections
    ? librarySource === 'echo'
      ? echoLibraryView === 'albums' ? echoCollections : echoLibraryView === 'artists' ? echoArtistCollections : []
      : librarySource === 'local'
        ? localLibraryView === 'albums' ? localCollections : localLibraryView === 'artists' ? localArtistCollections : []
        : librarySource === 'remote'
          ? powerampLibraryView === 'albums' ? powerampCollections : powerampLibraryView === 'artists' ? powerampArtistCollections : []
          : []
    : [];
  const libraryPaginationKind = selectedLibraryCollectionId
    ? 'tracks'
    : librarySource === 'streaming' && streamingLibraryMode === 'playlists' && !selectedStreamingPlaylistId
      ? 'streamingPlaylists'
      : activeLibraryCollections.length > 0 ? 'collections' : 'tracks';
  const activeLibraryTotal = activeLibraryTracks.length;
  const libraryPageSize = 20;
  const libraryPaginationTotal = libraryPaginationKind === 'collections'
    ? activeLibraryCollections.length
    : libraryPaginationKind === 'streamingPlaylists'
      ? queryFilteredStreamingPlaylists.length
      : activeLibraryTotal;
  const libraryPaginationScope = libraryPaginationKind === 'collections'
    ? 'collections'
    : libraryPaginationKind === 'streamingPlaylists' ? 'streaming' : 'tracks';
  const libraryTotalPages = Math.max(1, Math.ceil(libraryPaginationTotal / libraryPageSize));
  const effectiveLibraryPageIndex = Math.min(libraryPageIndex, libraryTotalPages - 1);
  const libraryPageStart = libraryExpanded ? effectiveLibraryPageIndex * libraryPageSize : 0;
  const displayedLibraryTracks = activeLibraryTracks.slice(libraryPageStart, libraryPageStart + libraryPageSize);
  const displayedLibraryCollections = activeLibraryCollections.slice(libraryPageStart, libraryPageStart + libraryPageSize);
  const displayedStreamingPlaylists = queryFilteredStreamingPlaylists.slice(libraryPageStart, libraryPageStart + libraryPageSize);
  const libraryIndexTitles = libraryPaginationKind === 'collections'
    ? activeLibraryCollections.map((collection) => collection.title)
    : libraryPaginationKind === 'streamingPlaylists'
      ? queryFilteredStreamingPlaylists.map((playlist) => playlist.name)
      : activeLibraryTracks.map((track) => track.title);
  const libraryArtworkLookupSignature = displayedLibraryTracks
    .map((track) => `${track.id}:${track.artworkUrl ?? ''}`)
    .join('|');

  useEffect(() => {
    if (page !== 'library' && page !== 'search') return undefined;
    if (!externalMetadataSearchEnabled || (!lrcApiExternalDataEnabled && !neteaseExternalDataEnabled)) return undefined;
    let cancelled = false;
    void (async () => {
      for (const track of displayedLibraryTracks) {
        if (cancelled || artworkUrlIsVisible(resolveArtworkUrl(track.artworkUrl))) continue;
        const metadataKey = externalMetadataKeyForTrack(track);
        if (!metadataKey || artworkUrlIsVisible(resolveArtworkUrl(externalMetadataByKey[metadataKey]?.albumArt))) continue;
        const isLocalTrackWithLyrics = 'hasLyrics' in track && Boolean((track as LocalMusicTrack).hasLyrics);
        if (externalMetadataSkipExisting && (isLocalTrackWithLyrics || Boolean(externalMetadataByKey[metadataKey]?.lyrics?.trim()))) continue;
        const lookupKey = `library-artwork:${metadataKey}`;
        if (libraryArtworkLookupKeysRef.current.has(lookupKey)) continue;
        libraryArtworkLookupKeysRef.current.add(lookupKey);
        try {
          const candidates = await lookupExternalMetadataCandidates(track, {
            lrcapi: lrcApiExternalDataEnabled,
            lrclib: false,
            netease: neteaseExternalDataEnabled,
          }, { includeNeteaseLyrics: false });
          if (cancelled) return;
          const candidate = candidates.find((item) => item.source === 'netease' && item.albumArt)
            ?? candidates.find((item) => item.albumArt);
          if (!candidate?.albumArt) continue;
          setExternalMetadataByKey((current) => ({
            ...current,
            [metadataKey]: {
              albumArt: candidate.albumArt,
              artist: current[metadataKey]?.artist ?? null,
              error: null,
              lyrics: current[metadataKey]?.lyrics ?? null,
              sourceTitle: candidate.title,
              status: 'ready',
            },
          }));
          setExternalMetadataFieldSourcesByKey((current) => ({
            ...current,
            [metadataKey]: { ...current[metadataKey], albumArt: candidate.source },
          }));
        } catch {
          // A library refresh clears the lookup marker and retries misses.
        }
      }
    })();
    return () => { cancelled = true; };
  }, [
    externalMetadataRefreshToken,
    externalMetadataSearchEnabled,
    externalMetadataSkipExisting,
    externalMetadataByKey,
    libraryArtworkLookupSignature,
    lrcApiExternalDataEnabled,
    neteaseExternalDataEnabled,
    page,
  ]);
  const localGroupLabel = useCallback((track: LocalMusicTrack): string | null => {
    if (localLibraryView === 'albums') {
      return track.album || '未归类专辑';
    }
    if (localLibraryView === 'artists') {
      return track.artist || '未知艺术家';
    }
    if (localLibraryView === 'formats') {
      return formatAudioQualityTag(track) || 'Unknown';
    }
    return null;
  }, [localLibraryView]);
  const echoGroupLabel = useCallback((track: EchoLinkTrackPreview): string | null => {
    if (echoLibraryView === 'albums') return track.album || (languageIsEnglish ? 'Uncategorized' : '未归类专辑');
    if (echoLibraryView === 'artists') return track.artist || (languageIsEnglish ? 'Unknown Artist' : '未知艺术家');
    return null;
  }, [echoLibraryView, languageIsEnglish]);
  const visibleAudioTagCount = audioTagOptions.filter((option) => audioTagVisibility[option.key]).length;
  const lyricLines = useMemo(() => {
    if (lyricsLoading) {
      return [{ id: 'loading', text: text.lyricsLoadingText, timeMs: null }];
    }
    if (lyricsError) {
      return [{ id: 'error', text: text.lyricsUnavailable, timeMs: null }];
    }
    const parsedLyrics = parseLyrics(lyricsText);
    return parsedLyrics.length > 0 ? parsedLyrics : [{ id: 'empty', text: text.noLyrics, timeMs: null }];
  }, [lyricsError, lyricsLoading, lyricsText, text.lyricsLoadingText, text.lyricsUnavailable, text.noLyrics]);
  const activeLyricIndex = useMemo(() => {
    let activeIndex = 0;
    lyricLines.forEach((line, index) => {
      if (line.timeMs !== null && line.timeMs <= playbackPositionMs + 250) {
        activeIndex = index;
      }
    });
    return activeIndex;
  }, [lyricLines, playbackPositionMs]);
  const defaultPlayerAnimatedStyle = {
    opacity: lyricsTransition.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0.22],
    }),
    transform: [
      {
        scale: lyricsTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.96],
        }),
      },
      {
        translateY: lyricsTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -8],
        }),
      },
    ],
  };
  const lyricsPanelAnimatedStyle = {
    opacity: lyricsTransition,
    transform: [
      {
        translateY: lyricsTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0],
        }),
      },
      {
        scale: lyricsTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [0.985, 1],
        }),
      },
    ],
  };
  const volumeExpandedAnimatedStyle = {
    opacity: volumeTransition,
    transform: [
      {
        scaleX: volumeTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [0.74, 1],
        }),
      },
    ],
  };
  const playlistBackdropAnimatedStyle = {
    opacity: playlistTransition.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
  };
  const playlistPopoverAnimatedStyle = {
    opacity: playlistTransition,
    transform: [
      {
        translateY: playlistTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [22, 0],
        }),
      },
      {
        scale: playlistTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1],
        }),
      },
    ],
  };
  const eqBackdropAnimatedStyle = {
    opacity: eqTransition,
  };
  const eqModalAnimatedStyle = {
    opacity: eqTransition,
    transform: [
      {
        translateY: eqTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
      {
        scale: eqTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1],
        }),
      },
    ],
  };
  const isCompactPlayer = windowWidth < 390 || windowHeight < 820;
  const eqTrackHeight = windowHeight < 760 ? 170 : 216;
  const lyricsViewportTargetHeight = Math.max(200, Math.round(windowHeight * 0.42));
  const playerCoverSize = isCompactPlayer ? Math.min(windowWidth - 118, 184) : Math.min(windowWidth - 96, 236);
  const playerShellPadding = isCompactPlayer ? 12 : 16;
  const playerShellGap = isCompactPlayer ? 9 : 12;
  const playerTitleSize = isCompactPlayer ? 20 : 23;
  const renderButtonBlur = (intensity = 22) => (
    <BlurView
      intensity={intensity}
      pointerEvents="none"
      style={styles.glassButtonBlur}
      tint="light"
    />
  );
  useEffect(() => {
    if (!displayArtworkUrl) {
      setStableArtworkUrl(null);
    }
  }, [displayArtworkUrl]);

  useEffect(() => {
    if (!lyricsVisible || !lyricsScrollRef.current || lyricLineLayoutsRef.current == null) {
      return;
    }
    const activeLine = lyricLines[activeLyricIndex];
    if (!activeLine?.id) {
      return;
    }
    const layout = lyricLineLayoutsRef.current[activeLine.id];
    if (!layout) {
      return;
    }
    const targetY = Math.max(0, layout.y - Math.max(24, lyricsViewportTargetHeight * 0.34));
    lyricsScrollRef.current.scrollTo({ animated: true, y: targetY });
  }, [activeLyricIndex, lyricLines, lyricsVisible, lyricsViewportTargetHeight]);
  const renderOutputSwitch = () => (
    <View style={styles.outputSwitch}>
      <Pressable
        accessibilityLabel={text.localPlaybackA11y}
        accessibilityRole="button"
        disabled={phoneAudioBusy || localLibraryBusy}
        onPress={switchToLocalPlayback}
        style={[styles.outputSwitchButton, isLocalOutput ? styles.outputSwitchButtonActive : null]}
      >
        {renderButtonBlur(isLocalOutput ? 12 : 18)}
        <AnimatedButtonContent motionKey={`local-${isLocalOutput}-${localLibraryBusy}`} style={styles.buttonMotionCenter}>
          <Text style={[styles.outputSwitchText, isLocalOutput ? styles.outputSwitchTextActive : null]}>
            {text.localPlayback}
          </Text>
        </AnimatedButtonContent>
      </Pressable>
      <Pressable
        accessibilityLabel={text.controlComputerPlayback}
        accessibilityRole="button"
        disabled={!client || phoneAudioBusy}
        onPress={switchToPcPlayback}
        style={[styles.outputSwitchButton, playbackOutputMode === 'pc' ? styles.outputSwitchButtonActive : null]}
      >
        {renderButtonBlur(playbackOutputMode === 'pc' ? 12 : 18)}
        <AnimatedButtonContent motionKey={`pc-${playbackOutputMode}`} style={styles.buttonMotionCenter}>
          <Text style={[styles.outputSwitchText, playbackOutputMode === 'pc' ? styles.outputSwitchTextActive : null]}>
            {text.control}
          </Text>
        </AnimatedButtonContent>
      </Pressable>
      <Pressable
        accessibilityLabel={text.streamToPhonePlayback}
        accessibilityRole="button"
        disabled={!client || phoneAudioBusy}
        onPress={switchToPhonePlayback}
        style={[styles.outputSwitchButton, isPhoneOutput ? styles.outputSwitchButtonActive : null]}
      >
        {renderButtonBlur(isPhoneOutput ? 12 : 18)}
        <AnimatedButtonContent motionKey={`phone-${isPhoneOutput}-${phoneAudioBusy}`} style={styles.buttonMotionCenter}>
          <Text style={[styles.outputSwitchText, isPhoneOutput ? styles.outputSwitchTextActive : null]}>
            {phoneAudioBusy ? '...' : text.stream}
          </Text>
        </AnimatedButtonContent>
      </Pressable>
    </View>
  );

  useEffect(() => {
    if (!lyricsVisible || !isLocalOutput || !localTrack?.id) {
      return;
    }
    if (lyricsTrackId === localTrack.id && (lyricsText || lyricsError)) {
      return;
    }

    let cancelled = false;
    setLyricsLoading(true);
    setLyricsError(null);
    void readLocalLyrics(localTrack)
      .then((lyrics) => {
        if (cancelled) {
          return;
        }
        setLyricsText(lyrics || text.noLyrics);
        setLyricsTrackId(localTrack.id);
      })
      .catch((lyricsLoadError) => {
        if (cancelled) {
          return;
        }
        setLyricsText('');
        setLyricsTrackId(localTrack.id);
        setLyricsError(formatRequestError(lyricsLoadError));
      })
      .finally(() => {
        if (!cancelled) {
          setLyricsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isLocalOutput, localTrack, lyricsError, lyricsText, lyricsTrackId, lyricsVisible, text.noLyrics]);

  useEffect(() => {
    if (!lyricsVisible || isLocalOutput || isStreamingOutput || !client || !displayTrack?.id) {
      return;
    }
    if (lyricsTrackId === displayTrack.id && (lyricsText || lyricsError)) {
      return;
    }

    let cancelled = false;
    setLyricsLoading(true);
    setLyricsError(null);
    void client.getLyrics(displayTrack.id)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setLyricsText(response.lyrics || text.noLyrics);
        setLyricsTrackId(displayTrack.id);
      })
      .catch((lyricsLoadError) => {
        if (cancelled) {
          return;
        }
        setLyricsText('');
        setLyricsTrackId(displayTrack.id);
        setLyricsError(formatRequestError(lyricsLoadError));
      })
      .finally(() => {
        if (!cancelled) {
          setLyricsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, displayTrack?.id, isLocalOutput, isStreamingOutput, lyricsError, lyricsText, lyricsTrackId, lyricsVisible, text.noLyrics]);

  useEffect(() => {
    if (
      !lyricsVisible
      || !displayTrack?.id
      || lyricsLoading
      || (lyricsTrackId !== displayTrack.id && !currentExternalFieldSources?.lyrics)
      || currentExternalMetadata?.status !== 'ready'
      || !currentExternalMetadata.lyrics
    ) {
      return;
    }
    if (!currentExternalFieldSources?.lyrics && lyricsText && lyricsText !== text.noLyrics && !lyricsError) {
      return;
    }
    setLyricsText(currentExternalMetadata.lyrics);
    setLyricsTrackId(displayTrack.id);
    setLyricsError(null);
    setLyricsLoading(false);
  }, [
    currentExternalMetadata?.lyrics,
    currentExternalMetadata?.status,
    currentExternalFieldSources?.lyrics,
    displayTrack?.id,
    lyricsError,
    lyricsLoading,
    lyricsText,
    lyricsTrackId,
    lyricsVisible,
    text.noLyrics,
  ]);

  const playTrackOnLocal = useCallback(async (track: LocalMusicTrack, positionMs = 0) => {
    const requestId = ++devicePlaybackRequestRef.current;
    setPhoneAudioBusy(true);
    setPhoneAudioError(null);
    setPhoneSeekPreviewMs(null);
    try {
      phonePlayer.pause();
      phonePlayer.clearLockScreenControls();
      if (echoAudioDsp.isAvailable) {
        await echoAudioDsp.playFile(track.uri, {
          gains: eqGains,
          loudnessEnabled: loudnessNormalizationEnabled,
          positionMs,
          volume: phoneVolume,
        });
        setDspPlaybackActive(true);
        setDspStatus(await echoAudioDsp.getStatus());
      } else {
        phonePlayer.replace({
          name: track.title,
          uri: track.uri,
        });
        phonePlayer.volume = phoneVolume;
        phonePlayer.setActiveForLockScreen(true, {
          albumTitle: track.album,
          artist: track.artist,
          artworkUrl: track.artworkUrl ?? undefined,
          title: track.title,
        }, {
          showSeekBackward: true,
          showSeekForward: true,
        });
        if (positionMs > 0) {
          await phonePlayer.seekTo(positionMs / 1000).catch(() => undefined);
        }
        phonePlayer.play();
      }
      if (devicePlaybackRequestRef.current !== requestId) return;
      setLocalTrack(track);
      markLocalTrackPlayed(track.id);
      setPlaybackOutputMode('local');
      if (autoOpenLyricsForLocalTracks && track.hasLyrics) setLyricsVisible(true);
    } catch (localPlaybackError) {
      if (devicePlaybackRequestRef.current === requestId) {
        void stopDspPlayback();
        void clearNativeNowPlaying();
        setPhoneAudioError(formatPhoneAudioError(localPlaybackError));
      }
    } finally {
      if (devicePlaybackRequestRef.current === requestId) setPhoneAudioBusy(false);
    }
  }, [autoOpenLyricsForLocalTracks, clearNativeNowPlaying, eqGains, loudnessNormalizationEnabled, markLocalTrackPlayed, phonePlayer, phoneVolume, stopDspPlayback]);

  const playNeteaseTrack = useCallback(async (track: EchoLinkTrackPreview, positionMs = 0) => {
    if (!streamingApiBaseUrl || !streamingCookie || !streamingSessionMatchesApi) {
      setConnectPanelMode('streaming');
      switchPage('connect');
      setStreamingStatusText(appLanguage === 'en' ? 'Sign in to NetEase Cloud Music first.' : '请先登录网易云音乐');
      return;
    }
    const requestId = ++devicePlaybackRequestRef.current;
    beginStreamingBusy();
    setPhoneAudioBusy(true);
    setActivePlaybackPlaylistId(null);
    setPhoneAudioError(null);
    setPhoneSeekPreviewMs(null);
    try {
      const url = await getNeteasePlaybackUrl(streamingApiBaseUrl, streamingCookie, track.id);
      const cachedStreamUri = echoAudioDsp.isAvailable
        ? await downloadStreamForDsp(url, track, 'netease')
        : null;
      if (devicePlaybackRequestRef.current !== requestId) return;
      await stopDspPlayback();
      phonePlayer.pause();
      if (echoAudioDsp.isAvailable && cachedStreamUri) {
        phonePlayer.clearLockScreenControls();
        await echoAudioDsp.playFile(cachedStreamUri, {
          gains: eqGains,
          loudnessEnabled: loudnessNormalizationEnabled,
          positionMs,
          volume: phoneVolume,
        });
        setDspPlaybackActive(true);
        setDspStatus(await echoAudioDsp.getStatus());
      } else {
        await clearNativeNowPlaying();
        phonePlayer.replace({ name: `${track.title} - ${track.artist}`, uri: url });
        phonePlayer.volume = phoneVolume;
        phonePlayer.setActiveForLockScreen(true, {
          albumTitle: track.album,
          artist: track.artist,
          artworkUrl: track.artworkUrl ?? undefined,
          title: track.title,
        }, {
          showSeekBackward: true,
          showSeekForward: true,
        });
        if (positionMs > 0) await phonePlayer.seekTo(positionMs / 1000).catch(() => undefined);
        phonePlayer.play();
      }
      if (devicePlaybackRequestRef.current !== requestId) return;
      setStreamingTrack(track);
      setPlaybackOutputMode('streaming');
      switchPage('control');
    } catch (streamingError) {
      if (devicePlaybackRequestRef.current === requestId) {
        void stopDspPlayback();
        void clearNativeNowPlaying();
        setPhoneAudioError(formatPhoneAudioError(streamingError));
      }
    } finally {
      endStreamingBusy();
      if (devicePlaybackRequestRef.current === requestId) setPhoneAudioBusy(false);
    }
  }, [appLanguage, beginStreamingBusy, clearNativeNowPlaying, endStreamingBusy, eqGains, loudnessNormalizationEnabled, phonePlayer, phoneVolume, stopDspPlayback, streamingApiBaseUrl, streamingCookie, streamingSessionMatchesApi, switchPage]);

  const switchToStreamingPlayback = useCallback(() => {
    if (isStreamingOutput) return;
    setActivePlaybackPlaylistId(null);
    if (streamingTrack) {
      void playNeteaseTrack(streamingTrack, 0);
      return;
    }
    setLibrarySource('streaming');
    switchPage('library');
  }, [isStreamingOutput, playNeteaseTrack, streamingTrack, switchPage]);

  const switchToLocalPlayback = useCallback(() => {
    if (isLocalOutput) {
      return;
    }
    const track = localTrack ?? localTracks[0];
    if (!track) {
      setLibrarySource('local');
      switchPage('library');
      showErrorAlert(text.localMusicMissingTitle, text.localMusicMissingMessage);
      return;
    }
    setActivePlaybackPlaylistId(null);
    void playTrackOnLocal(track, 0);
  }, [isLocalOutput, localTrack, localTracks, playTrackOnLocal, showErrorAlert, switchPage, text.localMusicMissingMessage, text.localMusicMissingTitle]);

  const playTrackOnPhone = useCallback(async (
    track: EchoLinkTrackPreview,
    positionMs = 0,
    pausePcAfterStart = false,
  ) => {
    if (!client) {
      setPhoneAudioError(text.echoNotConnected);
      return;
    }
    if (!track.canPlayOnPhone) {
      setPhoneAudioError(text.streamUnsupportedMessage);
      return;
    }

    const requestId = ++devicePlaybackRequestRef.current;
    setPhoneAudioBusy(true);
    setPhoneAudioError(null);
    setPhoneSeekPreviewMs(null);
    try {
      const stream = await client.createPhoneStream(track.id);
      const nextVolume = isDeviceOutput
        ? phoneVolume
        : status?.playback.volume ?? phoneVolume;
      const cachedStreamUri = echoAudioDsp.isAvailable
        ? await downloadStreamForDsp(stream.streamUrl, stream.track, `echo-${connection.host}-${connection.port}`)
        : null;
      if (devicePlaybackRequestRef.current !== requestId) return;

      phonePlayer.pause();
      setPhoneVolume(nextVolume);

      if (echoAudioDsp.isAvailable && cachedStreamUri) {
        phonePlayer.clearLockScreenControls();
        await echoAudioDsp.playFile(cachedStreamUri, {
          gains: eqGains,
          loudnessEnabled: loudnessNormalizationEnabled,
          positionMs,
          volume: nextVolume,
        });
        setDspPlaybackActive(true);
        setDspStatus(await echoAudioDsp.getStatus());
      } else {
        await stopDspPlayback();
        await clearNativeNowPlaying();
        phonePlayer.replace({
          name: `${stream.track.title} - ${stream.track.artist}`,
          uri: stream.streamUrl,
        });
        phonePlayer.volume = nextVolume;
        phonePlayer.setActiveForLockScreen(true, {
          albumTitle: stream.track.album,
          artist: stream.track.artist,
          artworkUrl: stream.track.artworkUrl ?? undefined,
          title: stream.track.title,
        }, {
          showSeekBackward: true,
          showSeekForward: true,
        });
        if (positionMs > 0) {
          await phonePlayer.seekTo(positionMs / 1000).catch(() => undefined);
        }
        phonePlayer.play();
      }
      if (devicePlaybackRequestRef.current !== requestId) return;
      setPhoneTrack(stream.track);
      setPlaybackOutputMode('phone');
      markEchoTrackPlayed(stream.track.id);

      if (pausePcAfterStart && (status?.playback.state === 'playing' || status?.playback.state === 'loading')) {
        void client.sendPlaybackCommand({ command: 'playPause' })
          .then(applyStatus)
          .catch((handoffError) => setPhoneAudioError(formatPhoneAudioError(handoffError)));
      }
    } catch (phoneError) {
      if (devicePlaybackRequestRef.current === requestId) {
        void stopDspPlayback();
        void clearNativeNowPlaying();
        setPhoneAudioError(formatPhoneAudioError(phoneError));
      }
    } finally {
      if (devicePlaybackRequestRef.current === requestId) setPhoneAudioBusy(false);
    }
  }, [applyStatus, clearNativeNowPlaying, client, connection.host, connection.port, eqGains, isDeviceOutput, loudnessNormalizationEnabled, markEchoTrackPlayed, phonePlayer, phoneVolume, status, stopDspPlayback, text.echoNotConnected, text.streamUnsupportedMessage]);

  const playPowerampTrackOnPhone = useCallback(async (track: PowerampRemoteTrack, positionMs = 0) => {
    if (!powerampClient) {
      setPhoneAudioError(languageIsEnglish ? 'Connect Poweramp Remote in Settings first.' : '请先在设置中连接 Poweramp 远程服务。');
      return;
    }
    if (!track.canPlayOnPhone) {
      setPhoneAudioError(text.streamUnsupportedMessage);
      return;
    }
    const requestId = ++devicePlaybackRequestRef.current;
    setPhoneAudioBusy(true);
    setPhoneAudioError(null);
    setPhoneSeekPreviewMs(null);
    try {
      const stream = await powerampClient.createStream(track.id);
      const cachedStreamUri = echoAudioDsp.isAvailable
        ? await downloadStreamForDsp(stream.streamUrl, stream.track, `poweramp-${powerampConnection?.host ?? 'remote'}`)
        : null;
      if (devicePlaybackRequestRef.current !== requestId) return;
      phonePlayer.pause();
      if (echoAudioDsp.isAvailable && cachedStreamUri) {
        phonePlayer.clearLockScreenControls();
        await echoAudioDsp.playFile(cachedStreamUri, {
          gains: eqGains,
          loudnessEnabled: loudnessNormalizationEnabled,
          positionMs,
          volume: phoneVolume,
        });
        setDspPlaybackActive(true);
        setDspStatus(await echoAudioDsp.getStatus());
      } else {
        await stopDspPlayback();
        await clearNativeNowPlaying();
        phonePlayer.replace({ name: `${stream.track.title} - ${stream.track.artist}`, uri: stream.streamUrl });
        phonePlayer.volume = phoneVolume;
        phonePlayer.setActiveForLockScreen(true, {
          albumTitle: stream.track.album,
          artist: stream.track.artist,
          artworkUrl: stream.track.artworkUrl ?? undefined,
          title: stream.track.title,
        }, { showSeekBackward: true, showSeekForward: true });
        if (positionMs > 0) await phonePlayer.seekTo(positionMs / 1000).catch(() => undefined);
        phonePlayer.play();
      }
      if (devicePlaybackRequestRef.current !== requestId) return;
      setPowerampStreamTrack(stream.track);
      setPlaybackOutputMode('remoteStream');
      markPowerampTrackPlayed(stream.track.id);
      switchPage('control');
    } catch (remoteError) {
      if (devicePlaybackRequestRef.current === requestId) {
        void stopDspPlayback();
        void clearNativeNowPlaying();
        setPhoneAudioError(formatPhoneAudioError(remoteError));
      }
    } finally {
      if (devicePlaybackRequestRef.current === requestId) setPhoneAudioBusy(false);
    }
  }, [clearNativeNowPlaying, echoAudioDsp.isAvailable, eqGains, languageIsEnglish, loudnessNormalizationEnabled, markPowerampTrackPlayed, phonePlayer, phoneVolume, powerampClient, powerampConnection?.host, stopDspPlayback, switchPage, text.streamUnsupportedMessage]);

  const playPowerampTrackOnDevice = useCallback((track: PowerampRemoteTrack) => {
    if (!powerampClient) {
      setLibrarySource('remote');
      switchPage('settings');
      return;
    }
    void sendPowerampCommand({ command: 'playTrack', trackId: track.id }).then((nextStatus) => {
      if (!nextStatus) return;
      devicePlaybackRequestRef.current += 1;
      phonePlayer.pause();
      phonePlayer.clearLockScreenControls();
      void stopDspPlayback();
      setPowerampStreamTrack(null);
      setPlaybackOutputMode('remoteControl');
      markPowerampTrackPlayed(track.id);
    });
  }, [markPowerampTrackPlayed, phonePlayer, powerampClient, sendPowerampCommand, stopDspPlayback, switchPage]);

  const playPowerampTrack = useCallback((track: PowerampRemoteTrack, positionMs = 0) => {
    if (playbackOutputMode === 'remoteControl') {
      playPowerampTrackOnDevice(track);
      return;
    }
    void playPowerampTrackOnPhone(track, positionMs);
  }, [playPowerampTrackOnDevice, playPowerampTrackOnPhone, playbackOutputMode]);

  const switchToPowerampStream = useCallback(() => {
    if (isPowerampStreamOutput) return;
    const track = powerampStreamTrack ?? powerampNowPlaying ?? powerampTracks[0];
    if (!track) {
      setLibrarySource('remote');
      switchPage(powerampClient ? 'library' : 'settings');
      return;
    }
    void playPowerampTrackOnPhone(track, 0);
  }, [isPowerampStreamOutput, playPowerampTrackOnPhone, powerampClient, powerampNowPlaying, powerampStreamTrack, powerampTracks, switchPage]);

  const switchToPowerampControl = useCallback(() => {
    if (isPowerampControlOutput) return;
    if (!powerampClient) {
      setLibrarySource('remote');
      switchPage('settings');
      return;
    }
    const track = powerampNowPlaying ?? powerampTracks[0];
    if (track) {
      playPowerampTrackOnDevice(track);
    } else {
      setLibrarySource('remote');
      switchPage('library');
    }
  }, [isPowerampControlOutput, playPowerampTrackOnDevice, powerampClient, powerampNowPlaying, powerampTracks, switchPage]);

  const switchToPhonePlayback = useCallback(() => {
    if (isPhoneOutput) {
      return;
    }
    if (!client) {
      setConnectPanelMode('echo');
      switchPage('connect');
      return;
    }
    setActivePlaybackPlaylistId(null);
    const track = nowPlaying ?? phoneTrack;
    if (!track) {
      setPhoneAudioError(text.noPlayableTrackMessage);
      return;
    }
    void playTrackOnPhone(track, nowPlaying?.id === track.id ? pcPlaybackPositionMs : 0, true);
  }, [client, isPhoneOutput, nowPlaying, pcPlaybackPositionMs, phoneTrack, playTrackOnPhone, switchPage, text.noPlayableTrackMessage]);

  const switchToPcPlayback = useCallback(() => {
    if (playbackOutputMode === 'pc') {
      return;
    }
    if (!client) {
      setConnectPanelMode('echo');
      switchPage('connect');
      return;
    }
    const track = phoneTrack ?? nowPlaying;
    const positionMs = Math.max(0, Math.round((useDspPlayback ? dspStatus.currentTime : phonePlayerStatus.currentTime) * 1000));

    if (isPhoneOutput && track) {
      const requestId = ++devicePlaybackRequestRef.current;
      setPhoneAudioBusy(false);
      void sendCommand({
        command: 'handoff',
        positionMs,
        target: 'pc',
        trackId: track.id,
      })
        .then((nextStatus) => {
          if (!nextStatus || devicePlaybackRequestRef.current !== requestId) return;
          setActivePlaybackPlaylistId(null);
          phonePlayer.pause();
          phonePlayer.clearLockScreenControls();
          void stopDspPlayback();
          setPlaybackOutputMode('pc');
          setPhoneSeekPreviewMs(null);
          setPhoneAudioError(null);
        });
      return;
    }
    devicePlaybackRequestRef.current += 1;
    setActivePlaybackPlaylistId(null);
    setPhoneAudioBusy(false);
    phonePlayer.pause();
    phonePlayer.clearLockScreenControls();
    void stopDspPlayback();
    setPlaybackOutputMode('pc');
    setPhoneSeekPreviewMs(null);
    setPhoneAudioError(null);
  }, [client, dspStatus.currentTime, isPhoneOutput, nowPlaying, phonePlayer, phonePlayerStatus.currentTime, phoneTrack, playbackOutputMode, sendCommand, stopDspPlayback, switchPage, useDspPlayback]);

  const togglePlayPause = useCallback(() => {
    if (isPowerampControlOutput) {
      void sendPowerampCommand({ command: 'playPause' });
      return;
    }
    if (isDeviceOutput) {
      if (isLocalOutput && !localTrack) {
        switchToLocalPlayback();
        return;
      }
      if (isPhoneOutput && !phoneTrack) {
        switchToPhonePlayback();
        return;
      }
      if (isStreamingOutput && !streamingTrack) {
        switchToStreamingPlayback();
        return;
      }
      if (isPowerampStreamOutput && !powerampStreamTrack) {
        switchToPowerampStream();
        return;
      }
      if (useDspPlayback) {
        void (dspStatus.playing ? echoAudioDsp.pause() : echoAudioDsp.resume())
          .then(() => echoAudioDsp.getStatus())
          .then(setDspStatus)
          .catch((dspError) => setPhoneAudioError(formatPhoneAudioError(dspError)));
      } else if (phonePlayerStatus.playing) {
        phonePlayer.pause();
      } else {
        phonePlayer.play();
      }
      return;
    }
    void sendCommand({ command: 'playPause' });
  }, [
    isDeviceOutput,
    isLocalOutput,
    isPhoneOutput,
    isPowerampControlOutput,
    isPowerampStreamOutput,
    isStreamingOutput,
    localTrack,
    dspStatus.playing,
    phonePlayer,
    phonePlayerStatus.playing,
    phoneTrack,
    powerampStreamTrack,
    sendCommand,
    sendPowerampCommand,
    switchToLocalPlayback,
    switchToPhonePlayback,
    switchToPowerampStream,
    switchToStreamingPlayback,
    useDspPlayback,
  ]);

  const playRelativePhoneQueueTrack = useCallback((direction: -1 | 1) => {
    const currentTrackId = phoneTrack?.id ?? nowPlaying?.id ?? playbackQueue?.currentTrackId;
    const currentIndex = playlistItems.findIndex((item) => item.id === currentTrackId);
    const nextTrack = currentIndex >= 0 ? playlistItems[currentIndex + direction] : null;
    if (!nextTrack) {
      setPhoneAudioError(direction > 0 ? text.nextPhoneQueueMissing : text.previousPhoneQueueMissing);
      return;
    }
    void playTrackOnPhone(nextTrack, 0, false);
  }, [nowPlaying, phoneTrack, playbackQueue?.currentTrackId, playlistItems, playTrackOnPhone, text.nextPhoneQueueMissing, text.previousPhoneQueueMissing]);

  const playRelativeLocalTrack = useCallback((direction: -1 | 1) => {
    const currentIndex = localPlaybackItems.findIndex((item) => item.id === localTrack?.id);
    const nextTrack = currentIndex >= 0 ? localPlaybackItems[currentIndex + direction] : localPlaybackItems[0];
    if (!nextTrack) {
      setPhoneAudioError(direction > 0 ? text.localNextMissing : text.localPreviousMissing);
      return;
    }
    void playTrackOnLocal(nextTrack, 0);
  }, [localPlaybackItems, localTrack?.id, playTrackOnLocal, text.localNextMissing, text.localPreviousMissing]);

  const playRelativeStreamingTrack = useCallback((direction: -1 | 1) => {
    const currentIndex = streamingTracks.findIndex((item) => item.id === streamingTrack?.id);
    const nextTrack = currentIndex >= 0 ? streamingTracks[currentIndex + direction] : streamingTracks[0];
    if (!nextTrack) {
      setPhoneAudioError(appLanguage === 'en' ? 'No more streaming tracks.' : '没有更多流媒体歌曲');
      return;
    }
    void playNeteaseTrack(nextTrack, 0);
  }, [appLanguage, playNeteaseTrack, streamingTrack?.id, streamingTracks]);

  const playRelativePowerampTrack = useCallback((direction: -1 | 1) => {
    if (isPowerampControlOutput) {
      void sendPowerampCommand({ command: direction > 0 ? 'next' : 'previous' });
      return;
    }
    const currentIndex = powerampTracks.findIndex((item) => item.id === powerampStreamTrack?.id);
    const nextTrack = currentIndex >= 0 ? powerampTracks[currentIndex + direction] : powerampTracks[0];
    if (!nextTrack) {
      setPhoneAudioError(appLanguage === 'en' ? 'No more Poweramp tracks.' : '没有更多 Poweramp 歌曲');
      return;
    }
    void playPowerampTrackOnPhone(nextTrack, 0);
  }, [appLanguage, isPowerampControlOutput, playPowerampTrackOnPhone, powerampStreamTrack?.id, powerampTracks, sendPowerampCommand]);

  const playRelativeSavedPlaylistTrack = useCallback((direction: -1 | 1) => {
    if (!activePlaybackPlaylist) return;
    const currentSource = isPowerampControlOutput || isPowerampStreamOutput
      ? 'remote'
      : isLocalOutput ? 'local' : 'echo';
    const currentIndex = activePlaybackPlaylist.tracks.findIndex((item) => (
      item.id === displayTrack?.id && item.source === currentSource
    ));
    const nextTrack = currentIndex >= 0
      ? activePlaybackPlaylist.tracks[currentIndex + direction]
      : activePlaybackPlaylist.tracks[0];
    if (!nextTrack) {
      setPhoneAudioError(appLanguage === 'en' ? 'No more tracks in this playlist.' : '歌单中没有更多歌曲');
      return;
    }
    if (nextTrack.source === 'local') {
      const localItem = localTracks.find((item) => item.id === nextTrack.id);
      if (localItem) void playTrackOnLocal(localItem, 0);
      return;
    }
    if (nextTrack.source === 'remote') {
      const remoteItem = powerampTracks.find((item) => item.id === nextTrack.id);
      if (!remoteItem) return;
      if (isPowerampControlOutput) {
        playPowerampTrackOnDevice(remoteItem);
      } else {
        void playPowerampTrackOnPhone(remoteItem, 0);
      }
      return;
    }
    if (isPhoneOutput && nextTrack.canPlayOnPhone) {
      void playTrackOnPhone(nextTrack, 0, false);
    } else {
      playTrackOnPc(nextTrack);
    }
  }, [activePlaybackPlaylist, appLanguage, displayTrack?.id, isLocalOutput, isPhoneOutput, isPowerampControlOutput, isPowerampStreamOutput, localTracks, playPowerampTrackOnDevice, playPowerampTrackOnPhone, playTrackOnLocal, playTrackOnPhone, playTrackOnPc, powerampTracks]);

  const playPrevious = useCallback(() => {
    if (activePlaybackPlaylist) {
      playRelativeSavedPlaylistTrack(-1);
      return;
    }
    if (isLocalOutput) {
      playRelativeLocalTrack(-1);
      return;
    }
    if (isPhoneOutput) {
      playRelativePhoneQueueTrack(-1);
      return;
    }
    if (isStreamingOutput) {
      playRelativeStreamingTrack(-1);
      return;
    }
    if (isPowerampControlOutput || isPowerampStreamOutput) {
      playRelativePowerampTrack(-1);
      return;
    }
    void sendCommand({ command: 'previous' });
  }, [activePlaybackPlaylist, isLocalOutput, isPhoneOutput, isPowerampControlOutput, isPowerampStreamOutput, isStreamingOutput, playRelativeLocalTrack, playRelativePhoneQueueTrack, playRelativePowerampTrack, playRelativeSavedPlaylistTrack, playRelativeStreamingTrack, sendCommand]);

  const playNext = useCallback(() => {
    if (activePlaybackPlaylist) {
      playRelativeSavedPlaylistTrack(1);
      return;
    }
    if (isLocalOutput) {
      playRelativeLocalTrack(1);
      return;
    }
    if (isPhoneOutput) {
      playRelativePhoneQueueTrack(1);
      return;
    }
    if (isStreamingOutput) {
      playRelativeStreamingTrack(1);
      return;
    }
    if (isPowerampControlOutput || isPowerampStreamOutput) {
      playRelativePowerampTrack(1);
      return;
    }
    void sendCommand({ command: 'next' });
  }, [activePlaybackPlaylist, isLocalOutput, isPhoneOutput, isPowerampControlOutput, isPowerampStreamOutput, isStreamingOutput, playRelativeLocalTrack, playRelativePhoneQueueTrack, playRelativePowerampTrack, playRelativeSavedPlaylistTrack, playRelativeStreamingTrack, sendCommand]);

  useEffect(() => {
    if (!repeatOneEnabled || !isDeviceOutput || !deviceTrack) {
      phoneRepeatArmedRef.current = true;
      return;
    }

    const durationSeconds = Number(useDspPlayback ? dspStatus.duration : phonePlayerStatus.duration) || 0;
    const currentSeconds = Number(useDspPlayback ? dspStatus.currentTime : phonePlayerStatus.currentTime) || 0;
    const devicePlaying = useDspPlayback ? dspStatus.playing : phonePlayerStatus.playing;
    const didJustFinish = useDspPlayback ? dspStatus.didJustFinish : phonePlayerStatus.didJustFinish;
    if (devicePlaying && (!durationSeconds || currentSeconds < Math.max(0, durationSeconds - 1))) {
      phoneRepeatArmedRef.current = true;
    }

    if (!didJustFinish || !phoneRepeatArmedRef.current) {
      return;
    }

    phoneRepeatArmedRef.current = false;
    if (useDspPlayback) {
      void echoAudioDsp.seekTo(0)
        .then(() => echoAudioDsp.resume())
        .then(() => echoAudioDsp.getStatus())
        .then(setDspStatus)
        .catch((dspError) => setPhoneAudioError(formatPhoneAudioError(dspError)));
      return;
    }
    void phonePlayer.seekTo(0)
      .catch(() => undefined)
      .finally(() => {
        phonePlayer.play();
      });
  }, [
    deviceTrack,
    dspStatus.currentTime,
    dspStatus.didJustFinish,
    dspStatus.duration,
    dspStatus.playing,
    isDeviceOutput,
    phonePlayer,
    phonePlayerStatus.currentTime,
    phonePlayerStatus.didJustFinish,
    phonePlayerStatus.duration,
    phonePlayerStatus.playing,
    repeatOneEnabled,
    useDspPlayback,
  ]);

  useEffect(() => {
    if (repeatOneEnabled || !isDeviceOutput || !deviceTrack) {
      phoneAutoAdvanceArmedRef.current = true;
      return;
    }
    const devicePlaying = useDspPlayback ? dspStatus.playing : phonePlayerStatus.playing;
    const didJustFinish = useDspPlayback ? dspStatus.didJustFinish : phonePlayerStatus.didJustFinish;
    if (devicePlaying) phoneAutoAdvanceArmedRef.current = true;
    if (!didJustFinish || !phoneAutoAdvanceArmedRef.current) return;
    phoneAutoAdvanceArmedRef.current = false;
    playNext();
  }, [
    deviceTrack,
    dspStatus.didJustFinish,
    dspStatus.playing,
    isDeviceOutput,
    phonePlayerStatus.didJustFinish,
    phonePlayerStatus.playing,
    playNext,
    repeatOneEnabled,
    useDspPlayback,
  ]);

  useEffect(() => {
    if (!repeatOneEnabled || isDeviceOutput || !client || !status?.playback.track) {
      pcRepeatArmedRef.current = true;
      return;
    }

    const { durationMs, positionMs, state, track } = status.playback;
    const hasDuration = durationMs > 0;
    const nearEnd = hasDuration && positionMs >= Math.max(0, durationMs - 1500);
    if (state === 'playing' || state === 'loading' || (hasDuration && positionMs < Math.max(0, durationMs - 2500))) {
      pcRepeatArmedRef.current = true;
    }

    if (state !== 'stopped' || !nearEnd || !pcRepeatArmedRef.current) {
      return;
    }

    pcRepeatArmedRef.current = false;
    void client.sendPlaybackCommand({ command: 'playTrack', trackId: track.id, output: 'pc' })
      .then(applyStatus)
      .catch((repeatError) => setError(formatRequestError(repeatError)));
  }, [
    applyStatus,
    client,
    isDeviceOutput,
    repeatOneEnabled,
    status?.playback.durationMs,
    status?.playback.positionMs,
    status?.playback.state,
    status?.playback.track,
  ]);

  useEffect(() => {
    if (repeatOneEnabled || isDeviceOutput || !activePlaybackPlaylist || !status?.playback.track) {
      pcAutoAdvanceArmedRef.current = true;
      return;
    }
    const { durationMs, positionMs, state } = status.playback;
    const nearEnd = durationMs > 0 && positionMs >= Math.max(0, durationMs - 1500);
    if (state === 'playing' || state === 'loading' || positionMs < Math.max(0, durationMs - 2500)) {
      pcAutoAdvanceArmedRef.current = true;
    }
    if (state !== 'stopped' || !nearEnd || !pcAutoAdvanceArmedRef.current) return;
    pcAutoAdvanceArmedRef.current = false;
    playNext();
  }, [
    activePlaybackPlaylist,
    isDeviceOutput,
    playNext,
    repeatOneEnabled,
    status?.playback.durationMs,
    status?.playback.positionMs,
    status?.playback.state,
    status?.playback.track,
  ]);

  const seekToPosition = useCallback((requestedPositionMs: number, commit: boolean) => {
    if ((!status && !powerampStatus && !isDeviceOutput) || !playbackDurationMs) {
      return;
    }
    const positionMs = Math.max(0, Math.min(playbackDurationMs, Math.round(requestedPositionMs)));
    if (isDeviceOutput) {
      setPhoneSeekPreviewMs(commit ? null : positionMs);
      if (commit) {
        if (useDspPlayback) {
          void echoAudioDsp.seekTo(positionMs / 1000)
            .then(() => echoAudioDsp.getStatus())
            .then(setDspStatus)
            .catch((dspError) => setPhoneAudioError(formatPhoneAudioError(dspError)));
        } else {
          void phonePlayer.seekTo(positionMs / 1000);
        }
      }
      return;
    }
    if (isPowerampControlOutput) {
      if (commit) void sendPowerampCommand({ command: 'seekTo', positionMs });
      return;
    }
    sliderInteractionInFlight.current = true;
    patchPlayback({ positionMs });
    if (commit) {
      pendingPcSeekRef.current = {
        positionMs,
        requestedAtMs: Date.now(),
        trackId: status?.playback.track?.id ?? null,
      };
      void sendCommand({ command: 'seekTo', positionMs }).finally(() => {
        sliderInteractionInFlight.current = false;
      });
    }
  }, [isDeviceOutput, isPowerampControlOutput, patchPlayback, phonePlayer, playbackDurationMs, powerampStatus, sendCommand, sendPowerampCommand, status, useDspPlayback]);

  const updateSeekFromGesture = useCallback((event: GestureResponderEvent, commit: boolean) => {
    if (progressTrackWidth <= 0) {
      return;
    }
    seekToPosition(playbackDurationMs * ratioFromGesture(event, progressTrackWidth), commit);
  }, [playbackDurationMs, progressTrackWidth, seekToPosition]);

  nativeRemoteCommandHandlerRef.current = (command) => {
    switch (command.action) {
      case 'next':
        playNext();
        break;
      case 'pause':
        if (isPlaybackActive) togglePlayPause();
        break;
      case 'play':
        if (!isPlaybackActive) togglePlayPause();
        break;
      case 'previous':
        playPrevious();
        break;
      case 'seek':
        if (typeof command.positionSeconds === 'number' && Number.isFinite(command.positionSeconds)) {
          seekToPosition(command.positionSeconds * 1000, true);
        }
        break;
      case 'toggle':
        togglePlayPause();
        break;
    }
  };

  useEffect(() => {
    const subscription = echoAudioDsp.addRemoteCommandListener((command) => {
      nativeRemoteCommandHandlerRef.current(command);
    });
    return () => {
      subscription?.remove();
    };
  }, []);

  const seekToLyric = useCallback((line: LyricLine) => {
    if (line.timeMs === null || (!status && !powerampStatus && !isDeviceOutput)) {
      return;
    }
    if (isDeviceOutput) {
      if (useDspPlayback) {
        void echoAudioDsp.seekTo(line.timeMs / 1000)
          .then(() => echoAudioDsp.getStatus())
          .then(setDspStatus)
          .catch((dspError) => setPhoneAudioError(formatPhoneAudioError(dspError)));
      } else {
        void phonePlayer.seekTo(line.timeMs / 1000);
      }
      return;
    }
    if (isPowerampControlOutput) {
      void sendPowerampCommand({ command: 'seekTo', positionMs: line.timeMs });
      return;
    }
    pendingPcSeekRef.current = {
      positionMs: line.timeMs,
      requestedAtMs: Date.now(),
      trackId: status?.playback.track?.id ?? null,
    };
    patchPlayback({ positionMs: line.timeMs });
    void sendCommand({ command: 'seekTo', positionMs: line.timeMs });
  }, [isDeviceOutput, isPowerampControlOutput, patchPlayback, phonePlayer, powerampStatus, sendCommand, sendPowerampCommand, status, useDspPlayback]);

  const setPlaybackVolume = useCallback((requestedVolume: number, commit: boolean) => {
    if (!status && !powerampStatus && !isDeviceOutput) {
      return;
    }
    const volume = clamp01(requestedVolume);
    if (isDeviceOutput) {
      setPhoneVolume(volume);
      if (useDspPlayback) {
        void echoAudioDsp.setVolume(volume)
          .then(() => echoAudioDsp.getStatus())
          .then(setDspStatus)
          .catch((dspError) => setPhoneAudioError(formatPhoneAudioError(dspError)));
      } else {
        phonePlayer.volume = volume;
      }
      return;
    }
    if (isPowerampControlOutput) {
      if (commit) void sendPowerampCommand({ command: 'setVolume', volume });
      return;
    }
    sliderInteractionInFlight.current = !commit;
    patchPlayback({ volume });
    if (commit) {
      void sendCommand({ command: 'setVolume', volume });
    }
  }, [isDeviceOutput, isPowerampControlOutput, patchPlayback, phonePlayer, powerampStatus, sendCommand, sendPowerampCommand, status, useDspPlayback]);

  const updateVolumeFromGesture = useCallback((event: GestureResponderEvent, commit: boolean) => {
    if (volumeTrackWidth <= 0) {
      return;
    }
    setPlaybackVolume(ratioFromGesture(event, volumeTrackWidth), commit);
  }, [setPlaybackVolume, volumeTrackWidth]);

  const handleProgressLayout = useCallback((event: LayoutChangeEvent) => {
    setProgressTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const handleVolumeLayout = useCallback((event: LayoutChangeEvent) => {
    setVolumeTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const toggleAudioTagVisibility = useCallback((key: AudioTagKey) => {
    setAudioTagVisibility((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const pageTitle = page === 'connect'
    ? text.connect
    : page === 'library'
      ? text.library
      : page === 'search'
        ? text.search
      : page === 'settings'
        ? text.settings
        : text.playback;
  const playbackModeLabel = isLocalOutput
    ? text.localMode
    : isStreamingOutput
      ? (languageIsEnglish ? 'Streaming Service' : '流媒体播放')
      : isPowerampStreamOutput
        ? (languageIsEnglish ? 'Poweramp Stream' : 'Poweramp 串流')
        : isPowerampControlOutput
          ? (languageIsEnglish ? 'Poweramp Control' : 'Poweramp 控制')
      : isPhoneOutput
      ? text.streamingMode
      : text.controllingMode;
  const pageAnimatedStyle = {
    opacity: pageTransition,
    transform: [
      {
        translateX: pageTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [24 * pageSlideDirection, 0],
        }),
      },
      {
        scale: pageTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [0.985, 1],
        }),
      },
    ],
  };
  const pageSettingOptions: Array<[AppPage, string]> = [
    ['control', text.playback],
    ['library', text.library],
    ['connect', text.connect],
    ['settings', text.settings],
  ];
  const connectPanelOptions: Array<[ConnectPanelMode, string]> = [
    ['echo', text.connectEcho],
  ];
  if (showPowerampRemoteConnection) connectPanelOptions.push(['remote', languageIsEnglish ? 'Remote' : '远程']);
  connectPanelOptions.push(['streaming', text.streamingServices]);
  const fallbackLibrarySourceOptions: Array<[LibrarySource, string]> = [];
  if (echoConnectionEnabled) fallbackLibrarySourceOptions.push(['echo', `${text.echoLibrary} ${tracks.length}`]);
  fallbackLibrarySourceOptions.push(['local', `${text.localLibrary} ${localTracks.length}`]);
  if (powerampRemoteEnabled) fallbackLibrarySourceOptions.push(['remote', `${text.remoteLibrary} ${powerampTracks.length}`]);
  const librarySourceSettingOptions: Array<[LibrarySource, string]> = [['all', text.all]];
  if (echoConnectionEnabled) librarySourceSettingOptions.push(['echo', text.echoLibrary]);
  librarySourceSettingOptions.push(['local', text.localLibrary]);
  if (powerampRemoteEnabled) librarySourceSettingOptions.push(['remote', text.remoteLibrary]);
  librarySourceSettingOptions.push(['streaming', text.streamingServices]);
  const labelForLocalLibraryView = useCallback((view: LocalLibraryView) => {
    const labels: Record<LocalLibraryView, string> = {
      albums: text.albums,
      artists: text.artists,
      favorites: text.favorites,
      formats: text.formats,
      recent: text.recent,
      songs: text.songs,
    };
    return labels[view];
  }, [text.albums, text.artists, text.favorites, text.formats, text.recent, text.songs]);
  const settingsSections = useMemo<Array<{
    description: string;
    key: SettingsSectionKey;
    summary: string;
    title: string;
  }>>(() => [
    {
      description: text.interfaceDescription,
      key: 'interface',
      summary: `${appLanguage === 'en' ? 'English' : '中文'} · ${pageSettingOptions.find(([value]) => value === defaultPage)?.[1] ?? text.playback} · ${followSystemAppearance ? (languageIsEnglish ? 'System' : '系统') : (darkModeEnabled ? (languageIsEnglish ? 'Dark' : '深色') : (languageIsEnglish ? 'Light' : '浅色'))}`,
      title: text.interface,
    },
    {
      description: text.playbackSettingsDescription,
      key: 'playback',
      summary: `${currentEqLabel} · ${loudnessNormalizationEnabled ? text.loudness : 'DSP'}`,
      title: text.playback,
    },
    {
      description: text.externalDataDescription,
      key: 'externalData',
      summary: externalMetadataSearchEnabled
        ? [
          externalDataSelectionMode === 'ask'
            ? (languageIsEnglish ? 'Ask' : '每次选择')
            : (languageIsEnglish ? 'Auto' : '自动匹配'),
          lrcApiExternalDataEnabled ? 'LrcAPI' : null,
          lrclibExternalDataEnabled ? 'LRCLIB' : null,
          neteaseExternalDataEnabled ? (languageIsEnglish ? 'NetEase' : '网易云') : null,
        ].filter(Boolean).join(' · ')
        : (languageIsEnglish ? 'Off' : '关闭'),
      title: text.externalData,
    },
    {
      description: text.librarySettingsDescription,
      key: 'library',
      summary: `${librarySourceSettingOptions.find(([value]) => value === defaultLibrarySource)?.[1] ?? text.localLibrary} · ${labelForLocalLibraryView(defaultLocalLibraryView)}`,
      title: text.library,
    },
    {
      description: text.powerampRemoteVisibilityDescription,
      key: 'remote',
      summary: showPowerampRemoteConnection
        ? (languageIsEnglish ? 'Visible' : '已显示')
        : (languageIsEnglish ? 'Off' : '关闭'),
      title: text.remoteLibrary,
    },
    {
      description: text.audioTagsDescription,
      key: 'audioTags',
      summary: languageIsEnglish ? `${visibleAudioTagCount} visible` : `已显示 ${visibleAudioTagCount} 项`,
      title: text.audioTags,
    },
    {
      description: text.storageDescription,
      key: 'storage',
      summary: formatStorageSize(localStorageBytes),
      title: text.storage,
    },
  ], [
    appLanguage,
    autoOpenLyricsForLocalTracks,
    currentEqLabel,
    defaultLibrarySource,
    defaultLocalLibraryView,
    defaultPage,
    labelForLocalLibraryView,
    languageIsEnglish,
    externalDataSelectionMode,
    externalMetadataSearchEnabled,
    localStorageBytes,
    loudnessNormalizationEnabled,
    lrcApiExternalDataEnabled,
    lrclibExternalDataEnabled,
    neteaseExternalDataEnabled,
    neteaseAccessMode,
    pageSettingOptions,
    showArtworkGlow,
    showPowerampRemoteConnection,
    followSystemAppearance,
    darkModeEnabled,
    text,
    visibleAudioTagCount,
  ]);
  const toggleSettingsSection = useCallback((section: SettingsSectionKey) => {
    setOpenSettingsSection((current) => (current === section ? 'interface' : section));
  }, []);
  const renderSegmentOptions = <T extends string,>(
    options: Array<[T, string]>,
    currentValue: T,
    onChange: (value: T) => void,
    disabled = false,
  ) => (
    <View style={[styles.segmentRow, disabled ? styles.settingRowDisabled : null]}>
      {options.map(([value, label]) => (
        <Pressable
          accessibilityLabel={label}
          accessibilityRole="button"
          key={value}
          disabled={disabled}
          onPress={() => onChange(value)}
           style={[styles.segmentButton, currentValue === value ? styles.segmentButtonActive : null]}
        >
          {renderButtonBlur(currentValue === value ? 10 : 20)}
          <AnimatedButtonContent motionKey={currentValue === value} style={styles.buttonMotionCenter}>
            <Text style={[styles.segmentButtonText, currentValue === value ? styles.segmentButtonTextActive : null]}>{label}</Text>
          </AnimatedButtonContent>
        </Pressable>
      ))}
    </View>
  );
  const openEqPanel = () => {
    setPlaylistOpen(false);
    setVolumeExpanded(false);
    setEqPanelOpen(true);
  };
  const applyEqPreset = (option: (typeof eqPresetOptions)[number]) => {
    setEqPreset(option.key);
    setEqGains([...option.gains]);
  };
  const updateEqBand = (index: number, gain: number) => {
    setEqPreset('custom');
    setEqGains((current) => normalizeEqGains(current).map((value, bandIndex) => (
      bandIndex === index ? clampEqGain(gain) : value
    )));
  };
  const handleNativeAction = (event: { nativeEvent: EchoNativeAction }) => {
    const action = event.nativeEvent;
    switch (action.action) {
      case 'artworkError':
        markArtworkUrlFailed(action.url);
        break;
      case 'eqChange':
        if (typeof action.index === 'number' && typeof action.value === 'number') {
          updateEqBand(action.index, action.value);
        }
        break;
      case 'eqPreset': {
        const option = eqPresetOptions.find((item) => item.key === action.preset);
        if (option) {
          applyEqPreset(option);
        }
        break;
      }
      case 'externalFieldSourcesSelect': {
        const pending = pendingExternalMetadataSelection;
        const selections = action.selections;
        if (!pending || !selections) break;
        const requiredFields = externalMetadataFields.filter((field) => (
          pending.candidates.some((candidate) => Boolean(candidate[field]))
        ));
        const selectedCandidates = requiredFields.map((field) => ({
          candidate: pending.candidates.find((item) => item.id === selections[field] && Boolean(item[field])),
          field,
        }));
        if (selectedCandidates.some(({ candidate }) => !candidate)) break;

        const metadata: ExternalTrackMetadata = {
          albumArt: null,
          artist: null,
          error: null,
          lyrics: null,
          sourceTitle: selectedCandidates[0]?.candidate?.title ?? null,
          status: 'ready',
        };
        const appliedSources: Partial<Record<ExternalMetadataField, ExternalMetadataSource>> = {};
        selectedCandidates.forEach(({ candidate, field }) => {
          if (!candidate) return;
          if (field === 'albumArt') metadata.albumArt = candidate.albumArt;
          if (field === 'artist') metadata.artist = candidate.artist;
          if (field === 'lyrics') metadata.lyrics = candidate.lyrics;
          appliedSources[field] = candidate.source;
        });
        setExternalMetadataByKey((current) => ({ ...current, [pending.metadataKey]: metadata }));
        setExternalMetadataFieldSourcesByKey((current) => ({
          ...current,
          [pending.metadataKey]: appliedSources,
        }));
        setPendingExternalMetadataSelection(null);
        break;
      }
      case 'externalSourcePickerDismiss': {
        const pending = pendingExternalMetadataSelection;
        if (!pending) break;
        setExternalMetadataByKey((current) => {
          const existing = current[pending.metadataKey];
          return {
            ...current,
            [pending.metadataKey]: {
              albumArt: existing?.albumArt ?? null,
              artist: existing?.artist ?? null,
              error: null,
              lyrics: existing?.lyrics ?? null,
              sourceTitle: existing?.sourceTitle ?? null,
              status: 'ready',
            },
          };
        });
        setPendingExternalMetadataSelection(null);
        break;
      }
      case 'externalSourcePickerIgnore': {
        const pending = pendingExternalMetadataSelection;
        if (!pending) break;
        ignoredExternalMetadataKeysRef.current.add(pending.metadataKey);
        setExternalMetadataByKey((current) => ({
          ...current,
          [pending.metadataKey]: {
            albumArt: null,
            artist: null,
            error: null,
            lyrics: null,
            sourceTitle: null,
            status: 'ready',
          },
        }));
        setExternalMetadataFieldSourcesByKey((current) => {
          const next = { ...current };
          delete next[pending.metadataKey];
          return next;
        });
        setPendingExternalMetadataSelection(null);
        break;
      }
      case 'externalMetadataRefresh': {
        if (!externalMetadataKey) break;
        setFailedArtworkUrls(new Set());
        ignoredExternalMetadataKeysRef.current.delete(externalMetadataKey);
        externalMetadataLookupKeysRef.current.clear();
        setExternalMetadataByKey((current) => {
          const next = { ...current };
          delete next[externalMetadataKey];
          return next;
        });
        setExternalMetadataFieldSourcesByKey((current) => {
          const next = { ...current };
          delete next[externalMetadataKey];
          return next;
        });
        setPendingExternalMetadataSelection(null);
        setExternalMetadataManualRefreshKey(externalMetadataKey);
        setExternalMetadataRefreshToken((value) => value + 1);
        break;
      }
      case 'lyrics':
        setLyricsVisible(true);
        break;
      case 'lyricsClose':
        setLyricsVisible(false);
        break;
      case 'librarySource':
        if (action.selection === 'all' || action.selection === 'echo' || action.selection === 'local' || action.selection === 'remote' || action.selection === 'streaming') {
          if (action.selection === 'echo' && !echoConnectionEnabled) break;
          if (action.selection === 'remote' && !powerampRemoteEnabled) break;
          if (action.selection !== librarySource) setQuery('');
          setLibrarySource(action.selection);
          setLibraryExpanded(false);
          setLibraryPageIndex(0);
          setSelectedLibraryCollectionId('');
        }
        break;
      case 'streamingLibraryMode':
        if (action.selection === 'search' || action.selection === 'playlists') {
          setQuery('');
          setStreamingLibraryMode(action.selection);
          setStreamingTracks([]);
          setSelectedStreamingPlaylistId(null);
          setLibraryExpanded(false);
          setLibraryPageIndex(0);
        }
        break;
      case 'streamingPlaylistOpen':
        if (action.id && streamingApiBaseUrl && streamingCookie && streamingSessionMatchesApi) {
          beginStreamingBusy();
          setQuery('');
          setSelectedStreamingPlaylistId(action.id);
          setLibraryExpanded(false);
          setLibraryPageIndex(0);
          void getNeteasePlaylistTracks(streamingApiBaseUrl, streamingCookie, action.id)
            .then(setStreamingTracks)
            .catch((playlistError) => setStreamingStatusText(formatRequestError(playlistError)))
            .finally(endStreamingBusy);
        }
        break;
      case 'streamingPlaylistFavorite':
        if (action.id) {
          setFavoriteStreamingPlaylistIds((current) => current.includes(action.id!)
            ? current.filter((id) => id !== action.id)
            : [action.id!, ...current]);
        }
        break;
      case 'streamingPlaylistPin':
        if (action.id) {
          setPinnedStreamingPlaylistIds((current) => current.includes(action.id!)
            ? current.filter((id) => id !== action.id)
            : [action.id!, ...current]);
        }
        break;
      case 'libraryView':
        if (librarySource === 'echo' && echoLibraryViewOptions.includes(action.selection as EchoLibraryView)) {
          setEchoLibraryView(action.selection as EchoLibraryView);
        } else if (librarySource === 'remote' && echoLibraryViewOptions.includes(action.selection as EchoLibraryView)) {
          setPowerampLibraryView(action.selection as EchoLibraryView);
        } else if (localLibraryViewOptions.includes(action.selection as LocalLibraryView)) {
          setLocalLibraryView(action.selection as LocalLibraryView);
        }
        setLibraryExpanded(false);
        setLibraryPageIndex(0);
        setSelectedLibraryCollectionId('');
        break;
      case 'libraryFilter':
        if (action.selection === 'all' || action.selection === 'streamable' || action.selection === 'local') {
          setLibraryFilter(action.selection);
          setLibraryPageIndex(0);
          setSelectedLibraryCollectionId('');
        }
        break;
      case 'libraryQuery':
        setQuery(action.text ?? '');
        setLibraryPageIndex(0);
        setSelectedLibraryCollectionId('');
        break;
      case 'libraryCollectionSelect':
        setQuery(action.text ?? '');
        setLibraryExpanded(false);
        setLibraryPageIndex(0);
        setSelectedLibraryCollectionId(action.id ?? '');
        if (action.selection === 'default' || action.selection === 'title' || action.selection === 'artist' || action.selection === 'duration' || action.selection === 'track') {
          setLibraryAlbumSort(action.selection);
        }
        break;
      case 'libraryAlbumSort':
        if (action.selection === 'default' || action.selection === 'title' || action.selection === 'artist' || action.selection === 'duration' || action.selection === 'track') {
          setLibraryAlbumSort(action.selection);
          setLibraryPageIndex(0);
        }
        break;
      case 'libraryExpand':
        setLibraryExpanded(action.enabled === true);
        setLibraryPageIndex(0);
        break;
      case 'libraryPage':
        if (typeof action.index === 'number') {
          setLibraryPageIndex(Math.max(0, Math.min(libraryTotalPages - 1, action.index)));
        }
        break;
      case 'libraryIndex':
        if (typeof action.index === 'number') {
          setLibraryExpanded(true);
          setLibraryPageIndex(Math.max(0, Math.min(libraryTotalPages - 1, action.index)));
        }
        break;
      case 'libraryRefresh':
        setFailedArtworkUrls(new Set());
        libraryArtworkLookupKeysRef.current.clear();
        setExternalMetadataRefreshToken((value) => value + 1);
        if (librarySource === 'streaming' && streamingProfile && streamingApiBaseUrl && streamingCookie && streamingSessionMatchesApi) {
          beginStreamingBusy();
          void getNeteasePlaylists(streamingApiBaseUrl, streamingCookie, streamingProfile.userId)
            .then(setStreamingPlaylists)
            .catch((streamingError) => setStreamingStatusText(formatRequestError(streamingError)))
            .finally(endStreamingBusy);
        } else if (librarySource === 'remote') {
          void refreshPowerampRemote();
        } else if (page === 'search' || librarySource === 'all') {
          void Promise.all([refresh(), refreshLocalLibrary(), refreshPowerampRemote()]);
        } else if (librarySource === 'local') {
          void refreshLocalLibrary();
        } else {
          void refresh();
        }
        break;
      case 'libraryImport':
        void importLocalLibrary();
        break;
      case 'libraryPlayFirst':
        switchToLocalPlayback();
        break;
      case 'collectionPlay': {
        const queueTracks = action.selection === 'track'
          ? sortTracksByAlbumOrder(activeLibraryTracks)
          : activeLibraryTracks;
        if (action.source === 'local') {
          const albumTracks = queueTracks
            .map((track) => localTrackById.get(track.id))
            .filter((track): track is LocalMusicTrack => Boolean(track));
          const firstTrack = albumTracks[0];
          if (!firstTrack) break;
          setActivePlaybackPlaylistId(null);
          setLocalQueueTrackIds(albumTracks.map((track) => track.id));
          setLocalQueueActive(true);
          void playTrackOnLocal(firstTrack, 0);
          break;
        }
        if (action.source === 'remote') {
          const albumTracks = queueTracks
            .map((track) => powerampTrackById.get(track.id))
            .filter((track): track is PowerampRemoteTrack => Boolean(track));
          const firstTrack = albumTracks[0];
          if (!firstTrack) break;
          setActivePlaybackPlaylistId(null);
          playPowerampTrack(firstTrack, 0);
          break;
        }
        if (action.source === 'echo') {
          const albumTracks = queueTracks
            .map((track) => echoTrackById.get(track.id))
            .filter((track): track is EchoLinkTrackPreview => Boolean(track));
          const firstTrack = albumTracks[0];
          if (!firstTrack) break;
          setActivePlaybackPlaylistId(null);
          if (client) {
            replaceEchoQueue(albumTracks, firstTrack.id);
          } else {
            playTrackOnPc(firstTrack);
          }
        }
        break;
      }
      case 'collectionPlaylistAdd':
      case 'collectionPlaylistCreate': {
        const collectionSource = action.source;
        if (collectionSource !== 'echo' && collectionSource !== 'local' && collectionSource !== 'remote') break;
        const collectionTracks: EchoLinkTrackPreview[] = collectionSource === 'local'
          ? activeLibraryTracks
            .map((track) => localTrackById.get(track.id))
            .filter((track): track is LocalMusicTrack => Boolean(track))
          : collectionSource === 'remote'
            ? activeLibraryTracks
              .map((track) => powerampTrackById.get(track.id))
              .filter((track): track is PowerampRemoteTrack => Boolean(track))
          : activeLibraryTracks
            .map((track) => echoTrackById.get(track.id))
            .filter((track): track is EchoLinkTrackPreview => Boolean(track));
        const snapshots = collectionTracks.map((track) => playlistTrackFromPreview(track, collectionSource));
        if (snapshots.length === 0) break;

        if (action.action === 'collectionPlaylistCreate') {
          const createdAt = Date.now();
          setPlaylists((current) => [{
            createdAt,
            favorite: false,
            id: `playlist-${createdAt}`,
            name: action.text?.trim() || (languageIsEnglish ? 'Album' : '专辑'),
            pinned: false,
            tracks: snapshots,
          }, ...current]);
          break;
        }

        if (!action.playlistId) break;
        setPlaylists((current) => current.map((playlist) => {
          if (playlist.id !== action.playlistId) return playlist;
          const existingTrackKeys = new Set(playlist.tracks.map((track) => `${track.source}:${track.id}`));
          const additions = snapshots.filter((track) => !existingTrackKeys.has(`${track.source}:${track.id}`));
          return additions.length > 0 ? { ...playlist, tracks: [...playlist.tracks, ...additions] } : playlist;
        }));
        break;
      }
      case 'playlistCreate': {
        const name = action.text?.trim();
        if (!name) break;
        const createdAt = Date.now();
        const selectedTrack = action.source === 'local'
          ? localTracks.find((track) => track.id === action.id)
          : action.source === 'remote'
            ? powerampTracks.find((track) => track.id === action.id)
            : action.source === 'echo' ? tracks.find((track) => track.id === action.id) : null;
        setPlaylists((current) => [{
          createdAt,
          favorite: false,
          id: `playlist-${createdAt}`,
          name,
          pinned: false,
          tracks: selectedTrack && (action.source === 'echo' || action.source === 'local' || action.source === 'remote')
            ? [playlistTrackFromPreview(selectedTrack, action.source)]
            : [],
        }, ...current]);
        break;
      }
      case 'playlistRename': {
        const name = action.text?.trim();
        if (!action.playlistId || !name) break;
        setPlaylists((current) => current.map((playlist) => (
          playlist.id === action.playlistId ? { ...playlist, name } : playlist
        )));
        break;
      }
      case 'playlistDelete':
        if (action.playlistId) {
          setPlaylists((current) => current.filter((playlist) => playlist.id !== action.playlistId));
          if (activePlaylistId === action.playlistId) setActivePlaylistId(null);
          if (activePlaybackPlaylistId === action.playlistId) setActivePlaybackPlaylistId(null);
        }
        break;
      case 'playlistFavorite':
        if (action.playlistId) {
          setPlaylists((current) => current.map((playlist) => (
            playlist.id === action.playlistId ? { ...playlist, favorite: !playlist.favorite } : playlist
          )));
        }
        break;
      case 'playlistPin':
        if (action.playlistId) {
          setPlaylists((current) => current.map((playlist) => (
            playlist.id === action.playlistId ? { ...playlist, pinned: !playlist.pinned } : playlist
          )));
        }
        break;
      case 'playlistOpen':
        if (action.playlistId) setActivePlaylistId(action.playlistId);
        break;
      case 'playlistClose':
        setActivePlaylistId(null);
        break;
      case 'playlistAddTrack': {
        if (!action.playlistId || !action.id || (action.source !== 'echo' && action.source !== 'local' && action.source !== 'remote')) break;
        const track = action.source === 'local'
          ? localTracks.find((item) => item.id === action.id)
          : action.source === 'remote'
            ? powerampTracks.find((item) => item.id === action.id)
            : tracks.find((item) => item.id === action.id);
        if (!track) break;
        const snapshot = playlistTrackFromPreview(track, action.source);
        setPlaylists((current) => current.map((playlist) => {
          if (playlist.id !== action.playlistId) return playlist;
          if (playlist.tracks.some((item) => item.source === snapshot.source && item.id === snapshot.id)) return playlist;
          return {
            ...playlist,
            tracks: [...playlist.tracks, snapshot],
          };
        }));
        break;
      }
      case 'playlistRemoveTrack':
        if (action.playlistId && action.trackId && (action.source === 'echo' || action.source === 'local' || action.source === 'remote')) {
          setPlaylists((current) => current.map((playlist) => (
            playlist.id === action.playlistId
              ? {
                ...playlist,
                tracks: playlist.tracks.filter((track) => !(track.source === action.source && track.id === action.trackId)),
              }
              : playlist
          )));
        }
        break;
      case 'trackPlay': {
        setActivePlaybackPlaylistId(
          action.playlistId && playlists.some((playlist) => playlist.id === action.playlistId)
            ? action.playlistId
            : null,
        );
        if (action.source === 'streaming') {
          const track = streamingTracks.find((item) => item.id === action.id);
          if (track) void playNeteaseTrack(track, 0);
          break;
        }
        if (action.source === 'local') {
          const track = localTracks.find((item) => item.id === action.id);
          if (track) void playTrackOnLocal(track, 0);
          break;
        }
        if (action.source === 'remote') {
          const track = powerampTracks.find((item) => item.id === action.id);
          if (track) playPowerampTrack(track, 0);
          break;
        }
        const track = tracks.find((item) => item.id === action.id)
          ?? playlists.flatMap((playlist) => playlist.tracks).find((item) => item.source === 'echo' && item.id === action.id);
        if (track) {
          if (isPhoneOutput && track.canPlayOnPhone) {
            void playTrackOnPhone(track, 0, false);
          } else {
            playEchoTrackOnPc(track, action.playlistId);
          }
        }
        break;
      }
      case 'trackFavorite': {
        if (action.source === 'echo') {
          if (action.id) toggleEchoFavorite(action.id);
          break;
        }
        if (action.source === 'remote') {
          if (action.id) togglePowerampFavorite(action.id);
          break;
        }
        const track = localTracks.find((item) => item.id === action.id);
        if (track) toggleLocalFavorite(track);
        break;
      }
      case 'trackFavoriteCurrent':
        toggleCurrentFavorite();
        break;
      case 'remoteTrackControl': {
        const track = powerampTracks.find((item) => item.id === action.id);
        if (track) playPowerampTrackOnDevice(track);
        break;
      }
      case 'remoteTrackStream': {
        const track = powerampTracks.find((item) => item.id === action.id);
        if (track) void playPowerampTrackOnPhone(track, 0);
        break;
      }
      case 'trackQueue': {
        const track = localTracks.find((item) => item.id === action.id);
        if (track) addLocalTrackToQueue(track);
        break;
      }
      case 'trackNext': {
        const track = localTracks.find((item) => item.id === action.id);
        if (track) playLocalTrackNext(track);
        break;
      }
      case 'trackLyrics': {
        const track = localTracks.find((item) => item.id === action.id);
        if (track) void importLyricsForLocalTrack(track);
        break;
      }
      case 'trackDelete': {
        const track = localTracks.find((item) => item.id === action.id);
        if (track) deleteLocalTrack(track);
        break;
      }
      case 'connectMode':
        if (action.selection === 'echo' || action.selection === 'streaming' || (action.selection === 'remote' && showPowerampRemoteConnection)) {
          setConnectPanelMode(action.selection);
        }
        break;
      case 'streamingApiUrl':
        setStreamingApiInput(action.text ?? '');
        break;
      case 'streamingAccessMode':
        if (action.selection === 'direct' || action.selection === 'selfHosted') {
          setNeteaseAccessMode(action.selection);
          setStreamingQrCookie('');
          setStreamingQrKey('');
          setStreamingQrUrl('');
          setStreamingStatusText('');
        }
        break;
      case 'streamingLogin':
        void startNeteaseLogin();
        break;
      case 'streamingQrResume':
        setStreamingQrPollToken((value) => value + 1);
        break;
      case 'streamingLogout':
        void logoutNetease();
        break;
      case 'streamingConnect':
        setConnectPanelMode('streaming');
        switchPage('connect');
        break;
      case 'echoConnectionEnabled':
        if (typeof action.enabled === 'boolean') setEchoConnectionEnabled(action.enabled);
        break;
      case 'powerampRemoteEnabled':
        if (typeof action.enabled === 'boolean') setPowerampRemoteEnabled(action.enabled);
        break;
      case 'powerampRemoteField':
        if (action.field === 'host') {
          setPowerampConnectionDraft((current) => ({ ...current, host: action.text ?? '' }));
        } else if (action.field === 'name') {
          setPowerampConnectionDraft((current) => ({ ...current, name: action.text ?? '' }));
        } else if (action.field === 'port') {
          setPowerampConnectionDraft((current) => ({ ...current, port: action.text ?? '' }));
        } else if (action.field === 'token') {
          setPowerampConnectionDraft((current) => ({ ...current, token: action.text ?? '' }));
        }
        break;
      case 'pairingText':
        setPairingText(action.text ?? '');
        break;
      case 'pairConnection':
        void applyPairingText();
        break;
      case 'pairScanned':
        if (action.text) void applyPairingValue(action.text);
        break;
      case 'powerampPairScanned':
        if (action.text) applyPowerampPairingValue(action.text);
        break;
      case 'connectionField':
        if (action.field === 'host') {
          setConnectionDraft((current) => ({ ...current, host: action.text ?? '' }));
        } else if (action.field === 'port') {
          setConnectionDraft((current) => ({ ...current, port: action.text ?? '' }));
        } else if (action.field === 'token') {
          setConnectionDraft((current) => ({ ...current, token: action.text ?? '' }));
        }
        break;
      case 'connectionSave':
        void saveManualConnection();
        break;
      case 'connectionTest':
        void refresh();
        break;
      case 'powerampRemoteTest':
        void refreshPowerampRemote();
        break;
      case 'settingToggle':
        if (typeof action.enabled !== 'boolean') break;
        if (action.key === 'loudness') setLoudnessNormalizationEnabled(action.enabled);
        if (action.key === 'externalMetadataSearch') setExternalMetadataSearchEnabled(action.enabled);
        if (action.key === 'externalMetadataSkipExisting') setExternalMetadataSkipExisting(action.enabled);
        if (action.key === 'autoLyrics') setAutoOpenLyricsForLocalTracks(action.enabled);
        if (action.key === 'artworkGlow') setShowArtworkGlow(action.enabled);
        if (action.key === 'artworkBackground') setArtworkBackgroundEnabled(action.enabled);
        if (action.key === 'lrcapi') setLrcApiExternalDataEnabled(action.enabled);
        if (action.key === 'lrclib') setLrclibExternalDataEnabled(action.enabled);
        if (action.key === 'netease') setNeteaseExternalDataEnabled(action.enabled);
        if (action.key === 'autoQueueImports') setAutoQueueImportedLocalTracks(action.enabled);
        if (action.key === 'confirmDelete') setConfirmBeforeDeletingLocalTracks(action.enabled);
        if (action.key === 'showPowerampRemoteConnection') setShowPowerampRemoteConnection(action.enabled);
        if (action.key === 'followSystemAppearance') setFollowSystemAppearance(action.enabled);
        if (action.key?.startsWith('audioTag.')) {
          const key = action.key.slice('audioTag.'.length) as AudioTagKey;
          if (audioTagOptions.some((option) => option.key === key)) {
            setAudioTagVisibility((current) => ({ ...current, [key]: action.enabled! }));
          }
        }
        break;
      case 'settingSelect':
        if (action.key === 'language' && (action.selection === 'zh' || action.selection === 'en')) {
          setAppLanguage(action.selection);
        }
        if (action.key === 'defaultPage' && appPages.includes(action.selection as AppPage)) {
          setDefaultPage(action.selection as AppPage);
        }
        if (action.key === 'defaultLibrarySource' && (action.selection === 'all' || action.selection === 'echo' || action.selection === 'local' || action.selection === 'remote' || action.selection === 'streaming')) {
          setDefaultLibrarySource(action.selection);
          setLibrarySource(action.selection);
        }
        if (action.key === 'defaultLocalView' && localLibraryViewOptions.includes(action.selection as LocalLibraryView)) {
          setDefaultLocalLibraryView(action.selection as LocalLibraryView);
          setLocalLibraryView(action.selection as LocalLibraryView);
        }
        if (action.key === 'externalSelectionMode' && (action.selection === 'ask' || action.selection === 'automatic')) {
          setExternalDataSelectionMode(action.selection);
        }
        if (action.key === 'neteaseAccessMode' && (action.selection === 'direct' || action.selection === 'selfHosted')) {
          setNeteaseAccessMode(action.selection);
        }
        if (action.key === 'manualAppearance' && (action.selection === 'light' || action.selection === 'dark')) {
          setDarkModeEnabled(action.selection === 'dark');
        }
        break;
      case 'settingAction':
        if (action.key === 'resetTags') setAudioTagVisibility(defaultAudioTagVisibility);
        if (action.key === 'rescanMetadata') void refreshLocalLibrary();
        if (action.key === 'clearLocalQueue') {
          setLocalQueueActive(true);
          setLocalQueueTrackIds([]);
        }
        if (action.key === 'clearRecent') setRecentLocalTrackIds([]);
        break;
      case 'powerampRemoteSave': {
        const host = normalizePowerampRemoteHost(action.host ?? '');
        const token = normalizePowerampRemoteToken(action.token ?? '');
        const port = Number(action.port ?? 0);
        if (!host || !token || !Number.isInteger(port) || port < 1 || port > 65535) {
          setPowerampError(languageIsEnglish ? 'Enter a valid Poweramp Remote address, port, and token.' : '请输入有效的 Poweramp 远程地址、端口和令牌。');
          break;
        }
        const nextConnection: PowerampRemoteConnection = {
          host,
          name: action.name?.trim() || 'Poweramp',
          port,
          scheme: action.scheme === 'https' ? 'https' : 'http',
          token,
        };
        setPowerampConnection(nextConnection);
        setPowerampConnectionDraft(powerampConnectionDraftFrom(nextConnection));
        setPowerampRemoteEnabled(true);
        setPowerampError(null);
        break;
      }
      case 'next':
        playNext();
        break;
      case 'output':
        if (action.mode === 'local') switchToLocalPlayback();
        if (action.mode === 'streaming') switchToStreamingPlayback();
        if (action.mode === 'pc') switchToPcPlayback();
        if (action.mode === 'phone') switchToPhonePlayback();
        if (action.mode === 'remoteControl') switchToPowerampControl();
        if (action.mode === 'remoteStream') switchToPowerampStream();
        break;
      case 'page':
        if (action.page) switchPage(action.page);
        break;
      case 'playPause':
        togglePlayPause();
        break;
      case 'playlist':
        setPlaylistOpen(true);
        break;
      case 'queuePlay': {
        if (action.playlistId && playlists.some((playlist) => playlist.id === action.playlistId)) {
          setActivePlaybackPlaylistId(action.playlistId);
        }
        if (action.source === 'streaming') {
          const track = streamingTracks.find((item) => item.id === action.id);
          if (track) void playNeteaseTrack(track, 0);
          break;
        }
        if (action.source === 'local') {
          const track = localTracks.find((item) => item.id === action.id);
          if (track) void playTrackOnLocal(track, 0);
          break;
        }
        if (action.source === 'remote') {
          const track = powerampTracks.find((item) => item.id === action.id);
          if (track) playPowerampTrack(track, 0);
          break;
        }
        const track = tracks.find((item) => item.id === action.id)
          ?? playlistItems.find((item) => item.id === action.id);
        if (track) {
          if (isPhoneOutput) {
            void playTrackOnPhone(track, 0, false);
          } else {
            playEchoTrackOnPc(track, action.playlistId);
          }
        }
        break;
      }
      case 'queueMove': {
        if (!action.id || (action.value !== -1 && action.value !== 1)) break;
        if (action.playlistId && (action.source === 'echo' || action.source === 'local' || action.source === 'remote')) {
          const playlist = playlists.find((item) => item.id === action.playlistId);
          const index = playlist?.tracks.findIndex((track) => track.id === action.id && track.source === action.source) ?? -1;
          const nextTracks = playlist ? moveItem(playlist.tracks, index, action.value as -1 | 1) : [];
          setPlaylists((current) => current.map((playlist) => {
            if (playlist.id !== action.playlistId) return playlist;
            return { ...playlist, tracks: nextTracks };
          }));
          if (playbackOutputMode === 'pc' && action.playlistId === activePlaybackPlaylistId) {
            reorderEchoQueue(nextTracks.filter((track) => track.source === 'echo'));
          }
          break;
        }
        if (action.source === 'streaming') {
          setStreamingTracks((current) => moveItem(
            current,
            current.findIndex((track) => track.id === action.id),
            action.value as -1 | 1,
          ));
          break;
        }
        if (action.source === 'echo' && playbackOutputMode === 'pc') {
          reorderEchoQueue(moveItem(
            playlistItems,
            playlistItems.findIndex((track) => track.id === action.id),
            action.value as -1 | 1,
          ));
          break;
        }
        const track = localTracks.find((item) => item.id === action.id);
        if (track) moveLocalQueueTrack(track, action.value);
        break;
      }
      case 'queueRemove':
        if (!action.id) break;
        if (action.playlistId && (action.source === 'echo' || action.source === 'local' || action.source === 'remote')) {
          const playlist = playlists.find((item) => item.id === action.playlistId);
          const nextTracks = playlist?.tracks.filter((track) => !(track.id === action.id && track.source === action.source)) ?? [];
          setPlaylists((current) => current.map((playlist) => playlist.id === action.playlistId
            ? {
              ...playlist,
              tracks: nextTracks,
            }
            : playlist));
          if (playbackOutputMode === 'pc' && action.playlistId === activePlaybackPlaylistId) {
            reorderEchoQueue(nextTracks.filter((track) => track.source === 'echo'));
          }
        } else if (action.source === 'streaming') {
          setStreamingTracks((current) => current.filter((track) => track.id !== action.id));
        } else if (action.source === 'echo' && playbackOutputMode === 'pc') {
          const next = playlistItems.filter((track) => track.id !== action.id);
          reorderEchoQueue(next, displayTrack?.id === action.id ? next[0]?.id ?? null : displayTrack?.id ?? null);
        } else {
          setLocalQueueActive(true);
          setLocalQueueTrackIds((current) => (
            localQueueActive || current.length > 0 ? current : localTracks.map((track) => track.id)
          ).filter((id) => id !== action.id));
        }
        break;
      case 'queueClear':
        if (action.playlistId) {
          setPlaylists((current) => current.map((playlist) => playlist.id === action.playlistId
            ? { ...playlist, tracks: [] }
            : playlist));
          if (playbackOutputMode === 'pc' && action.playlistId === activePlaybackPlaylistId) {
            void sendCommand({ command: 'queueClear', output: 'pc' });
          }
        } else if (action.source === 'streaming') {
          setStreamingTracks([]);
        } else if (action.source === 'echo' && playbackOutputMode === 'pc') {
          void sendCommand({ command: 'queueClear', output: 'pc' });
        } else {
          setLocalQueueActive(true);
          setLocalQueueTrackIds([]);
        }
        break;
      case 'previous':
        playPrevious();
        break;
      case 'repeat':
        setRepeatOneEnabled((current) => !current);
        break;
      case 'seek':
        if (typeof action.value === 'number') {
          seekToPosition(action.value, true);
        }
        break;
      case 'volume':
        if (typeof action.value === 'number') {
          setPlaybackVolume(action.value, action.commit ?? true);
        }
        break;
    }
  };
  const renderSettingSwitch = (
    title: string,
    description: string,
    enabled: boolean,
    onChange: (enabled: boolean) => void,
  ) => (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      onPress={() => onChange(!enabled)}
      style={styles.settingRow}
    >
      <View style={styles.settingText}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <View style={[styles.switchTrack, enabled ? styles.switchTrackActive : null]}>
        <View style={[styles.switchThumb, enabled ? styles.switchThumbActive : null]} />
      </View>
    </Pressable>
  );
  const renderSettingAction = (
    title: string,
    description: string,
    onPress: () => void,
    disabled = false,
  ) => (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.settingRow, disabled ? styles.settingRowDisabled : null]}
    >
      <View style={styles.settingText}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <SuperconIcon glyph="view-forward" size={18} color="rgba(248, 250, 252, 0.64)" />
    </Pressable>
  );
  const renderSettingsBody = (section: SettingsSectionKey) => {
    if (section === 'interface') {
      return (
        <View style={styles.settingsList}>
          <View style={styles.settingGroupBlock}>
            <Text style={styles.settingGroupTitle}>{text.language}</Text>
            {renderSegmentOptions<AppLanguage>([
              ['zh', '中文'],
              ['en', 'English'],
            ], appLanguage, setAppLanguage)}
            <Text style={styles.settingDescription}>
              {text.languageHint}
            </Text>
          </View>
          <View style={styles.settingGroupBlock}>
            <Text style={styles.settingGroupTitle}>{text.defaultPage}</Text>
            {renderSegmentOptions<AppPage>(pageSettingOptions, defaultPage, setDefaultPage)}
            <Text style={styles.settingDescription}>
              {text.defaultPageHint}
            </Text>
          </View>
          {renderSettingSwitch(
            text.followSystemAppearance,
            text.followSystemAppearanceDescription,
            followSystemAppearance,
            setFollowSystemAppearance,
          )}
          <View style={styles.settingGroupBlock}>
            <Text style={styles.settingGroupTitle}>{text.manualAppearance}</Text>
            {renderSegmentOptions(
              [['light', languageIsEnglish ? 'Light' : '浅色'], ['dark', languageIsEnglish ? 'Dark' : '深色']] as Array<['light' | 'dark', string]>,
              darkModeEnabled ? 'dark' : 'light',
              (value) => setDarkModeEnabled(value === 'dark'),
              followSystemAppearance,
            )}
            <Text style={styles.settingDescription}>{text.manualAppearanceDescription}</Text>
          </View>
        </View>
      );
    }

    if (section === 'playback') {
      return (
        <View style={styles.settingsList}>
          {nativePlayerEnabled ? (
            <EchoNativeEqLauncherView
              description={text.eqDescription}
              eqGains={eqGains}
              eqPreset={eqPreset}
              label={currentEqLabel}
              language={appLanguage}
              onAction={handleNativeAction}
              style={styles.nativeEqLauncher}
              title={text.eq}
            />
          ) : renderSettingAction(text.eq, `${currentEqLabel} · ${text.eqDescription}`, openEqPanel)}
          {renderSettingSwitch(text.loudness, text.loudnessDescription, loudnessNormalizationEnabled, setLoudnessNormalizationEnabled)}
          {renderSettingSwitch(text.autoLyrics, text.autoLyricsDescription, autoOpenLyricsForLocalTracks, setAutoOpenLyricsForLocalTracks)}
          {renderSettingSwitch(text.glow, text.glowDescription, showArtworkGlow, setShowArtworkGlow)}
        </View>
      );
    }

    if (section === 'library') {
      return (
        <View style={styles.settingsList}>
          <View style={styles.settingGroupBlock}>
            <Text style={styles.settingGroupTitle}>{text.defaultLibrarySource}</Text>
            {renderSegmentOptions<LibrarySource>(librarySourceSettingOptions, defaultLibrarySource, (value) => {
              setDefaultLibrarySource(value);
              setLibrarySource(value);
            })}
            <Text style={styles.settingDescription}>
              {text.defaultLibrarySourceHint}
            </Text>
          </View>
          <View style={styles.settingGroupBlock}>
            <Text style={styles.settingGroupTitle}>{text.defaultLocalView}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.localViewRow}>
              {localLibraryViewOptions.map((value) => {
                const label = labelForLocalLibraryView(value);
                return (
                  <Pressable
                    accessibilityLabel={label}
                    accessibilityRole="button"
                    key={value}
                    onPress={() => {
                      setDefaultLocalLibraryView(value);
                      setLocalLibraryView(value);
                    }}
                    style={[styles.localViewChip, defaultLocalLibraryView === value ? styles.localViewChipActive : null]}
                  >
                    {renderButtonBlur(defaultLocalLibraryView === value ? 10 : 20)}
                    <Text style={[styles.libraryFilterText, defaultLocalLibraryView === value ? styles.libraryFilterTextActive : null]}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.settingDescription}>
              {text.defaultLocalViewHint}
            </Text>
          </View>
          {renderSettingSwitch(text.autoQueueImports, text.autoQueueImportsDescription, autoQueueImportedLocalTracks, setAutoQueueImportedLocalTracks)}
        </View>
      );
    }

    if (section === 'externalData') {
      return (
        <View style={styles.settingsList}>
          {renderSettingSwitch(
            languageIsEnglish ? 'Search metadata online' : '从网络搜索元数据',
            languageIsEnglish ? 'Search the enabled sources only when this is on, or when you refresh a track manually.' : '开启后才会自动查询已启用的来源；关闭时仅可通过播放器刷新按钮手动查询。',
            externalMetadataSearchEnabled,
            setExternalMetadataSearchEnabled,
          )}
          {renderSettingSwitch(
            languageIsEnglish ? 'Skip tracks with existing artwork or lyrics' : '已有封面或歌词时不联网获取',
            languageIsEnglish ? 'Keep the current artwork or lyrics and skip automatic online matching. Manual refresh can still search once.' : '保留当前封面或歌词，不自动联网匹配；播放器的刷新按钮仍可单次强制查询。',
            externalMetadataSkipExisting,
            setExternalMetadataSkipExisting,
          )}
          {renderSettingSwitch(text.lrcApiSource, text.lrcApiSourceHint, lrcApiExternalDataEnabled, setLrcApiExternalDataEnabled)}
          {renderSettingSwitch(text.lrclibSource, text.lrclibSourceHint, lrclibExternalDataEnabled, setLrclibExternalDataEnabled)}
          {renderSettingSwitch(text.neteaseSource, text.neteaseSourceHint, neteaseExternalDataEnabled, setNeteaseExternalDataEnabled)}
          <Text style={styles.settingDescription}>{text.externalDataDescription}</Text>
        </View>
      );
    }

    if (section === 'remote') {
      return (
        <View style={styles.settingsList}>
          {renderSettingSwitch(
            text.powerampRemoteVisibility,
            text.powerampRemoteVisibilityDescription,
            showPowerampRemoteConnection,
            setShowPowerampRemoteConnection,
          )}
        </View>
      );
    }

    if (section === 'audioTags') {
      return (
        <View style={styles.settingsList}>
          {audioTagOptions.map((option) => {
            const enabled = audioTagVisibility[option.key];
            return (
              <View key={option.key}>
                {renderSettingSwitch(
                  languageIsEnglish ? option.labelEn : option.labelZh,
                  languageIsEnglish ? option.descriptionEn : option.descriptionZh,
                  enabled,
                  () => toggleAudioTagVisibility(option.key),
                )}
              </View>
            );
          })}
          {renderSettingAction(text.resetTags, text.resetTagsDescription, () => setAudioTagVisibility(defaultAudioTagVisibility))}
        </View>
      );
    }

    return (
      <View style={styles.settingsList}>
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>{text.storageUsed}</Text>
            <Text style={styles.settingDescription}>{formatStorageSize(localStorageBytes)}</Text>
          </View>
        </View>
        {renderSettingSwitch(text.confirmDelete, text.confirmDeleteDescription, confirmBeforeDeletingLocalTracks, setConfirmBeforeDeletingLocalTracks)}
        {renderSettingAction(text.rescanMetadata, text.rescanMetadataDescription, () => void refreshLocalLibrary(), localLibraryBusy)}
        {renderSettingAction(text.clearLocalQueue, text.clearLocalQueueDescription, () => {
          setLocalQueueActive(true);
          setLocalQueueTrackIds([]);
        }, localQueueActive && localQueueTrackIds.length === 0)}
        {renderSettingAction(text.clearRecent, text.clearRecentDescription, () => setRecentLocalTrackIds([]), recentLocalTrackIds.length === 0)}
      </View>
    );
  };
  const renderArtwork = (variant: 'default' | 'lyrics') => {
    const artworkSize = variant === 'lyrics' ? (isCompactPlayer ? 88 : 104) : playerCoverSize;
    return (
    <View
      style={[
        styles.artworkShell,
        { borderRadius: variant === 'lyrics' ? 24 : 34, height: artworkSize, width: artworkSize },
      ]}
    >
      <View style={styles.artworkFallback}>
        <Text style={[styles.artworkFallbackText, variant === 'lyrics' ? styles.artworkFallbackTextLyrics : null]}>
          ECHO
        </Text>
      </View>
      {stableArtworkUrl ? (
        <RNImage
          fadeDuration={0}
          onError={() => markArtworkUrlFailed(stableArtworkUrl)}
          onLoad={() => markArtworkUrlLoaded(stableArtworkUrl)}
          resizeMode="cover"
          source={{ uri: stableArtworkUrl }}
          style={[
            styles.artworkImage,
            artworkUrlHasLoaded(stableArtworkUrl) ? null : styles.artworkImageHidden,
          ]}
        />
      ) : null}
      {artworkUrlIsVisible(displayArtworkUrl) && displayArtworkUrl !== stableArtworkUrl ? (
        <RNImage
          fadeDuration={0}
          onError={() => markArtworkUrlFailed(displayArtworkUrl)}
          onLoad={() => markArtworkUrlLoaded(displayArtworkUrl)}
          resizeMode="cover"
          source={{ uri: displayArtworkUrl }}
          style={[styles.artworkImage, styles.artworkImageHidden]}
        />
      ) : null}
    </View>
    );
  };
  const renderConnectionChip = (variant: 'floating' | 'inline') => (
    <View style={[
      styles.playerConnectionChip,
      variant === 'inline' ? styles.playerConnectionChipInline : null,
      echoConnectionBroken ? styles.playerConnectionChipError : null,
    ]}>
      <Text style={[
        styles.playerConnectionKicker,
        echoConnectionBroken ? styles.playerConnectionKickerError : null,
      ]}>ECHO</Text>
      <View style={styles.playerConnectionStatusRow}>
        <View style={[
          styles.statusDot,
          echoConnectionOnline ? styles.statusDotOnline : null,
          echoConnectionBroken ? styles.statusDotError : null,
        ]} />
        <Text style={[
          styles.playerConnectionText,
          echoConnectionBroken ? styles.playerConnectionTextError : null,
        ]}>{connectedLabel}</Text>
      </View>
      <Text style={[
        styles.playerConnectionDetail,
        echoConnectionBroken ? styles.playerConnectionDetailError : null,
      ]} numberOfLines={1}>{playerConnectionDetail}</Text>
    </View>
  );
  const renderProgressScrubber = (compact = false) => (
    <View style={compact ? styles.compactProgressShell : null}>
      <View
        style={[styles.sliderTouchArea, compact ? styles.compactSliderTouchArea : null]}
        onLayout={handleProgressLayout}
        onStartShouldSetResponderCapture={() => Boolean((client || isDeviceOutput) && playbackDurationMs)}
        onStartShouldSetResponder={() => Boolean((client || isDeviceOutput) && playbackDurationMs)}
        onMoveShouldSetResponder={() => Boolean((client || isDeviceOutput) && playbackDurationMs)}
        onResponderGrant={(event) => {
          beginSliderInteraction();
          updateSeekFromGesture(event, false);
        }}
        onResponderMove={(event) => {
          beginSliderInteraction();
          updateSeekFromGesture(event, false);
        }}
        onResponderRelease={(event) => {
          updateSeekFromGesture(event, true);
          endSliderInteraction();
        }}
        onResponderTerminationRequest={() => false}
        onResponderTerminate={(event) => {
          updateSeekFromGesture(event, true);
          endSliderInteraction();
        }}
      >
        <View style={[styles.progressTrack, compact ? styles.compactProgressTrack : null]}>
          <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
        </View>
      </View>
      <View style={compact ? styles.compactTimeRow : styles.timeRow}>
        <Text style={styles.progressText}>{displayTrack ? formatTime(playbackPositionMs) : '0:00'}</Text>
        <Text style={styles.progressText}>{displayTrack ? formatTime(playbackDurationMs) : '0:00'}</Text>
      </View>
    </View>
  );
  const renderVolumeSlider = (compact = false) => (
    <View
      style={[styles.sliderTouchArea, compact ? styles.compactSliderTouchArea : null]}
      onLayout={handleVolumeLayout}
      onStartShouldSetResponderCapture={() => Boolean(client || isDeviceOutput)}
      onStartShouldSetResponder={() => Boolean(client || isDeviceOutput)}
      onMoveShouldSetResponder={() => Boolean(client || isDeviceOutput)}
      onResponderGrant={(event) => {
        beginSliderInteraction();
        updateVolumeFromGesture(event, false);
      }}
      onResponderMove={(event) => {
        beginSliderInteraction();
        updateVolumeFromGesture(event, false);
      }}
      onResponderRelease={(event) => {
        updateVolumeFromGesture(event, true);
        endSliderInteraction();
      }}
      onResponderTerminationRequest={() => false}
      onResponderTerminate={(event) => {
        updateVolumeFromGesture(event, true);
        endSliderInteraction();
      }}
    >
      <View style={[styles.volumeTrack, compact ? styles.compactVolumeTrack : null]}>
        <View style={[styles.volumeFill, { width: `${volumePercent}%` }]} />
      </View>
    </View>
  );
  const renderExpandableVolume = () => (
    <View style={styles.compactVolumeShell}>
      <Pressable
        accessibilityLabel={volumeExpanded ? text.collapseVolume : text.expandVolume}
        accessibilityRole="button"
        onPress={() => setVolumeExpanded((current) => !current)}
        style={[styles.volumeMiniButton, volumeExpanded ? styles.volumeMiniButtonActive : null]}
      >
        {renderButtonBlur(20)}
        <AnimatedButtonContent motionKey={volumeExpanded} style={styles.buttonMotionRow}>
          <SuperconIcon glyph="headphones" size={13} color="rgba(248, 250, 252, 0.58)" />
          <Text style={styles.volumeMiniValue}>{volumePercent}%</Text>
        </AnimatedButtonContent>
      </Pressable>
      {volumeExpanded ? (
        <Animated.View style={[styles.volumeExpandedPanel, volumeExpandedAnimatedStyle]}>
          <View style={styles.volumeExpandedSlider}>
            {renderVolumeSlider(true)}
          </View>
          <Text style={styles.volumeExpandedValue}>{volumePercent}%</Text>
        </Animated.View>
      ) : null}
    </View>
  );
  const renderEqModal = () => (
    eqPanelVisible ? (
      <View style={styles.eqOverlay}>
        <Animated.View style={[styles.eqBackdrop, eqBackdropAnimatedStyle]}>
          <Pressable
            accessibilityLabel={text.closeEqPanel}
            accessibilityRole="button"
            onPress={() => setEqPanelOpen(false)}
            style={styles.eqBackdropPressable}
          />
        </Animated.View>
        <Animated.View
          accessibilityLabel={text.eqTenBand}
          accessibilityViewIsModal
          style={[styles.eqModal, eqModalAnimatedStyle]}
        >
          <BlurView intensity={54} pointerEvents="none" style={styles.eqModalBlur} tint="dark" />
          <View style={styles.eqModalHeader}>
            <View style={styles.eqModalHeading}>
              <Text style={styles.eqModalTitle}>{text.eq}</Text>
              <Text style={styles.eqModalSubtitle}>{isDeviceOutput ? text.eqTenBand : text.eqUnavailable}</Text>
            </View>
            <View style={styles.eqModalHeaderActions}>
              <Text style={styles.eqPanelBadge}>{currentEqLabel}</Text>
              <Pressable
                accessibilityLabel={text.closeEqPanel}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setEqPanelOpen(false)}
                style={styles.eqCloseButton}
              >
                <SuperconIcon glyph="view-close-small" size={18} color="#f8fafc" />
              </Pressable>
            </View>
          </View>

          <View style={styles.eqReadout}>
            <Text style={styles.eqReadoutFrequency}>{formatEqFrequency(eqFrequencyLabels[activeEqBand]!)}</Text>
            <Text style={styles.eqReadoutGain}>{formatEqGain(eqGains[activeEqBand] ?? 0)} dB</Text>
          </View>

          <View style={styles.eqChartRow}>
            <View style={[styles.eqYAxis, { height: eqTrackHeight }]}>
              {[12, 6, 0, -6, -12].map((gain) => (
                <Text key={gain} style={styles.eqYAxisLabel}>{gain > 0 ? '+' : ''}{gain}dB</Text>
              ))}
            </View>
            <View style={styles.eqPlotColumn}>
              <View pointerEvents="none" style={[styles.eqGrid, { height: eqTrackHeight }]}>
                {[0, 1, 2, 3, 4].map((line) => (
                  <View key={line} style={[styles.eqGridLine, { top: line * eqTrackHeight / 4 }]} />
                ))}
              </View>
              <View style={styles.eqBandsRow}>
                {eqFrequencyLabels.map((label, index) => (
                  <EqBandSlider
                    gain={eqGains[index] ?? 0}
                    key={label}
                    label={label}
                    onChange={(gain) => updateEqBand(index, gain)}
                    onFocus={() => setActiveEqBand(index)}
                    trackHeight={eqTrackHeight}
                  />
                ))}
              </View>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eqPresetRow}>
            {eqPresetOptions.map((option) => {
              const active = option.key === eqPreset;
              const label = languageIsEnglish ? option.labelEn : option.labelZh;
              return (
                <Pressable
                  accessibilityLabel={`${text.eq} ${label}`}
                  accessibilityRole="button"
                  key={option.key}
                  onPress={() => applyEqPreset(option)}
                  style={[styles.eqPresetButton, active ? styles.eqPresetButtonActive : null]}
                >
                  {renderButtonBlur(active ? 10 : 20)}
                  <Text style={[styles.eqPresetText, active ? styles.eqPresetTextActive : null]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {loudnessNormalizationEnabled ? <Text style={styles.eqHint}>{text.loudnessEnabled}</Text> : null}
        </Animated.View>
      </View>
    ) : null
  );
  const renderTransportControls = (lyricsMode = false) => (
    <View style={[styles.transportRow, lyricsMode ? styles.lyricsTransportRow : null]}>
      <Pressable
        accessibilityLabel={text.previousTrack}
        accessibilityRole="button"
        style={[styles.roundButton, lyricsMode ? styles.roundButtonLyrics : null]}
        onPress={playPrevious}
        disabled={!client && !isDeviceOutput}
      >
        {renderButtonBlur(24)}
        <SuperconIcon glyph="view-back" size={lyricsMode ? 31 : 25} color="#f8fafc" />
      </Pressable>
      <Pressable
        accessibilityLabel={isPlaybackActive ? text.pausePlayback : text.startPlayback}
        accessibilityRole="button"
        style={[styles.playButton, lyricsMode ? styles.playButtonLyrics : null]}
        onPress={togglePlayPause}
        disabled={!client && !isDeviceOutput}
      >
        {renderButtonBlur(14)}
        <AnimatedButtonContent motionKey={`${lyricsMode}-${isPlaybackActive}`} style={styles.buttonMotionCenter}>
          <SuperconIcon
            glyph={isPlaybackActive ? 'pause-circle' : 'play-circle'}
            size={lyricsMode ? 48 : 44}
            color="#101014"
          />
        </AnimatedButtonContent>
      </Pressable>
      <Pressable
        accessibilityLabel={text.nextTrack}
        accessibilityRole="button"
        style={[styles.roundButton, lyricsMode ? styles.roundButtonLyrics : null]}
        onPress={playNext}
        disabled={!client && !isDeviceOutput}
      >
        {renderButtonBlur(24)}
        <SuperconIcon glyph="view-forward" size={lyricsMode ? 31 : 25} color="#f8fafc" />
      </Pressable>
    </View>
  );
  const renderLyricsHeader = () => (
    <View style={styles.lyricsTopBar}>
      {renderArtwork('lyrics')}
      <View style={styles.lyricsHeroText}>
        <Text style={[styles.trackTitleLyrics, { fontSize: playerTitleSize }]} numberOfLines={2}>
          {displayTrack?.title ?? text.noTrack}
        </Text>
        <Text style={[
          styles.lyricsConnectionText,
          echoConnectionBroken ? styles.lyricsConnectionTextError : null,
        ]} numberOfLines={1}>
          {connectedLabel}
        </Text>
        <View style={[styles.playbackTagRow, styles.playbackTagRowLyrics]}>
          {playbackTags.map((tag) => (
            <Text key={tag} style={[styles.playbackTag, styles.playbackTagDark]}>{tag}</Text>
          ))}
        </View>
      </View>
      <Pressable
        accessibilityLabel={text.closeLyrics}
        accessibilityRole="button"
        onPress={() => setLyricsVisible(false)}
        style={styles.lyricsCloseButton}
      >
        {renderButtonBlur(18)}
        <SuperconIcon glyph="view-close" size={22} color="#f8fafc" />
      </Pressable>
    </View>
  );
  const renderSecondaryControls = (compact = false) => (
    <View style={[styles.secondaryControlsRow, compact ? styles.secondaryControlsRowCompact : null]}>
      <Pressable
        accessibilityLabel={repeatOneEnabled ? text.closeRepeatOne : text.openRepeatOne}
        accessibilityRole="button"
        onPress={() => setRepeatOneEnabled((current) => !current)}
        style={[styles.repeatButton, compact ? styles.repeatButtonCompact : null, repeatOneEnabled ? styles.repeatButtonActive : null]}
      >
        {renderButtonBlur(repeatOneEnabled ? 10 : 22)}
        <AnimatedButtonContent motionKey={`${compact}-${repeatOneEnabled}`} style={styles.buttonMotionCenter}>
          <SuperconIcon
            glyph="view-reload"
            size={compact ? 18 : 21}
            color={repeatOneEnabled ? '#ffffff' : '#f8fafc'}
          />
        </AnimatedButtonContent>
        {repeatOneEnabled ? (
          <Text style={styles.repeatButtonBadge}>1</Text>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityLabel={lyricsVisible ? text.closeLyrics : text.openLyrics}
        accessibilityRole="button"
        onPress={() => setLyricsVisible((current) => !current)}
        style={[styles.lyricsButton, compact ? styles.lyricsButtonCompact : null, lyricsVisible ? styles.lyricsButtonActive : null]}
      >
        {renderButtonBlur(lyricsVisible ? 10 : 22)}
        <AnimatedButtonContent motionKey={`${compact}-${lyricsVisible}`} style={styles.buttonMotionCenter}>
          <Text style={[styles.lyricsButtonText, lyricsVisible ? styles.lyricsButtonTextActive : null]}>词</Text>
        </AnimatedButtonContent>
      </Pressable>
      <Pressable
        accessibilityLabel={playlistOpen ? text.closePlaylistPreview : text.openPlaylistPreview}
        accessibilityRole="button"
        onPress={() => setPlaylistOpen((current) => !current)}
        style={[styles.playlistMiniButton, compact ? styles.playlistMiniButtonCompact : null, playlistOpen ? styles.playlistMiniButtonActive : null]}
      >
        {renderButtonBlur(22)}
        <AnimatedButtonContent motionKey={`${compact}-${playlistOpen}`} style={styles.buttonMotionRow}>
          <SuperconIcon glyph="list" size={16} color="#f8fafc" />
          <Text style={styles.playlistMiniCount}>{playlistItems.length}</Text>
        </AnimatedButtonContent>
      </Pressable>
      <Pressable
        accessibilityLabel={eqPanelOpen ? text.closeEqPanel : text.openEqPanel}
        accessibilityRole="button"
        onPress={() => eqPanelOpen ? setEqPanelOpen(false) : openEqPanel()}
        style={[styles.lyricsButton, compact ? styles.lyricsButtonCompact : null, eqPanelOpen ? styles.lyricsButtonActive : null]}
      >
        {renderButtonBlur(eqPanelOpen ? 10 : 22)}
        <AnimatedButtonContent motionKey={`${compact}-${eqPanelOpen}`} style={styles.buttonMotionCenter}>
          <Text style={[styles.lyricsButtonText, eqPanelOpen ? styles.lyricsButtonTextActive : null]}>EQ</Text>
        </AnimatedButtonContent>
      </Pressable>
      {compact ? null : renderExpandableVolume()}
    </View>
  );
  const renderNativePlayer = () => (
    <EchoNativePlayerView
      activeLyricIndex={activeLyricIndex}
      activePage={page}
      artist={displayArtist}
      artworkBackgroundEnabled={artworkBackgroundEnabled}
      artworkUrl={displayArtworkUrl ?? stableArtworkUrl ?? ''}
      connectionLabel={connectedLabel}
      connectionOnline={isPowerampControlOutput || isPowerampStreamOutput ? powerampConnectionOnline : echoConnectionOnline}
      controlsEnabled={playbackControlsEnabled}
      darkModeEnabled={darkModeEnabled}
      durationMs={playbackDurationMs}
      externalSourcePickerPayload={pendingExternalMetadataSelection?.metadataKey === externalMetadataKey
        ? JSON.stringify({
          artworkLabel: languageIsEnglish ? 'Artwork' : '封面',
          artistLabel: languageIsEnglish ? 'Artist' : '艺术家',
          cancelLabel: languageIsEnglish ? 'Cancel' : '取消',
          candidates: pendingExternalMetadataSelection.candidates.map((candidate) => ({
            albumArt: candidate.albumArt,
            artist: candidate.artist,
            availableLabel: [
              candidate.lyrics ? (languageIsEnglish ? 'Lyrics' : '歌词') : null,
              candidate.artist ? (languageIsEnglish ? 'Artist' : '艺术家') : null,
              candidate.albumArt ? (languageIsEnglish ? 'Artwork' : '封面') : null,
            ].filter(Boolean).join(' / '),
            hasArtist: Boolean(candidate.artist),
            hasArtwork: Boolean(candidate.albumArt),
            hasLyrics: Boolean(candidate.lyrics),
            id: candidate.id,
            sourceLabel: candidate.source === 'netease' && !languageIsEnglish
              ? '网易云音乐'
              : candidate.sourceLabel,
            title: candidate.title,
          })),
          doneLabel: languageIsEnglish ? 'Done' : '完成',
          id: pendingExternalMetadataSelection.id,
          ignoreLabel: languageIsEnglish ? 'Do not use' : '不使用',
          lyricsLabel: languageIsEnglish ? 'Lyrics' : '歌词',
          selectedLabel: languageIsEnglish ? 'Selected' : '已选择',
          subtitle: languageIsEnglish
            ? 'Choose a source separately for each available field.'
            : '分别为歌词、艺术家和封面选择来源。',
          title: languageIsEnglish ? 'Choose a source' : '选择外源数据',
          unavailableLabel: languageIsEnglish ? 'Unavailable' : '未获取',
          useSourceLabel: languageIsEnglish ? 'Use this source' : '使用此来源',
        })
        : ''}
      followSystemAppearance={followSystemAppearance}
      eqGains={eqGains}
      eqPreset={eqPreset}
      isPlaying={isPlaybackActive}
      isFavorite={currentTrackFavorite}
      language={appLanguage}
      lyricTexts={lyricLines.map((line) => line.text)}
      lyricTimesMs={lyricLines.map((line) => line.timeMs ?? -1)}
      lyricsVisible={lyricsVisible}
      metadataLoading={currentExternalMetadata?.status === 'loading' || phoneAudioBusy}
      modeLabel={playbackModeLabel}
      onAction={handleNativeAction}
      outputMode={playbackOutputMode}
      pagePayload={buildNativePagePayload()}
      positionMs={playbackPositionMs}
      queueCount={playlistItems.length}
      queuePayload={JSON.stringify({
        canEdit: queueCanEdit,
        clearLabel: text.clear,
        emptyLabel: text.queueEmpty,
        items: playlistItems.map((item, index) => {
          const source = item.source ?? queueSource;
          return {
            artist: item.artist,
            current: (item.id === playbackQueue?.currentTrackId || item.id === displayTrack?.id)
              && source === queueSource,
            id: queueCanEdit ? `${source}:${item.id}` : `${source}:${item.id}:${index}`,
            meta: item.album || item.sourceLabel,
            source,
            title: item.title,
            trackId: item.id,
          };
        }),
        moveDownLabel: text.moveDown,
        moveUpLabel: text.moveUp,
        removeLabel: text.removeFromQueue,
        playlistId: activePlaybackPlaylist?.id ?? '',
        source: queueSource,
        subtitle: queueSubtitle,
        title: text.playlist,
      })}
      repeatOne={repeatOneEnabled}
      showArtworkGlow={showArtworkGlow}
      style={styles.nativeApp}
      tags={playbackTags}
      title={displayTrack?.title ?? text.noTrack}
      volume={outputVolume}
    />
  );
  const buildNativePagePayload = () => {
    const artworkForLibraryTrack = (track: EchoLinkTrackPreview): string => {
      const nativeArtwork = resolveArtworkUrl(track.artworkUrl);
      if (artworkUrlIsVisible(nativeArtwork)) return nativeArtwork ?? '';
      const metadataKey = externalMetadataKeyForTrack(track);
      const externalArtwork = metadataKey ? resolveArtworkUrl(externalMetadataByKey[metadataKey]?.albumArt) : null;
      return artworkUrlIsVisible(externalArtwork) ? externalArtwork ?? '' : '';
    };
    const settingToggle = (id: string, title: string, description: string, boolValue: boolean) => ({
      boolValue,
      description,
      disabled: false,
      id,
      kind: 'toggle',
      options: [],
      selection: null,
      title,
      value: '',
    });
  const settingPicker = (
    id: string,
    title: string,
    description: string,
    selection: string,
    options: Array<[string, string]>,
    disabled = false,
  ) => ({
      boolValue: null,
      description,
    disabled,
      id,
      kind: 'picker',
      options: options.map(([optionId, label]) => ({ id: optionId, label })),
      selection,
      title,
      value: '',
    });
    const settingAction = (id: string, title: string, description: string, disabled = false) => ({
      boolValue: null,
      description,
      disabled,
      id,
      kind: 'action',
      options: [],
      selection: null,
      title,
      value: '',
    });
    const nativePlaylist = (playlist: SavedPlaylist) => {
      const liveTracks = playlist.tracks.map((track) => (
        track.source === 'local' ? localTrackById.get(track.id) ?? track : echoTrackById.get(track.id) ?? track
      ));
      return {
        artworkUrl: resolveArtworkUrl(liveTracks.find((track) => track.artworkUrl)?.artworkUrl) ?? '',
        favorite: playlist.favorite,
        id: playlist.id,
        name: playlist.name,
        pinned: playlist.pinned,
        subtitle: languageIsEnglish ? `${playlist.tracks.length} tracks` : `${playlist.tracks.length} 首`,
        tracks: playlist.tracks.map((track, index) => {
          const liveTrack = liveTracks[index] ?? track;
          const localLiveTrack = track.source === 'local' ? localTrackById.get(track.id) : null;
          return {
            artworkUrl: resolveArtworkUrl(liveTrack.artworkUrl) ?? '',
            artist: liveTrack.artist,
            canPlayOnPhone: liveTrack.canPlayOnPhone,
            durationMs: liveTrack.durationMs,
            favorite: track.source === 'local' && favoriteLocalTrackIdSet.has(track.id),
            group: '',
            hasLyrics: localLiveTrack?.hasLyrics ?? false,
            id: track.id,
            isLocal: track.source === 'local',
            source: track.source,
            tags: tagsForTrack(liveTrack, { includeDuration: true, visibleAudioTags: audioTagVisibility }),
            title: liveTrack.title,
          };
        }),
      };
    };
    const selectedPlaylist = activePlaylistId
      ? playlists.find((playlist) => playlist.id === activePlaylistId) ?? null
      : null;
    const settingRows = {
      interface: [
        settingPicker('language', text.language, text.languageHint, appLanguage, [['zh', '中文'], ['en', 'English']]),
        settingPicker('defaultPage', text.defaultPage, text.defaultPageHint, defaultPage, pageSettingOptions),
        settingToggle('followSystemAppearance', text.followSystemAppearance, text.followSystemAppearanceDescription, followSystemAppearance),
        settingPicker(
          'manualAppearance',
          text.manualAppearance,
          text.manualAppearanceDescription,
          darkModeEnabled ? 'dark' : 'light',
          [[
            'light',
            languageIsEnglish ? 'Light' : '浅色',
          ], [
            'dark',
            languageIsEnglish ? 'Dark' : '深色',
          ]],
          followSystemAppearance,
        ),
      ],
      playback: [
        {
          boolValue: null,
          description: text.eqDescription,
          disabled: false,
          id: 'eq',
          kind: 'eq',
          options: [],
          selection: null,
          title: text.eq,
          value: currentEqLabel,
        },
        settingToggle('loudness', text.loudness, text.loudnessDescription, loudnessNormalizationEnabled),
        settingToggle('autoLyrics', text.autoLyrics, text.autoLyricsDescription, autoOpenLyricsForLocalTracks),
        settingToggle('artworkGlow', text.glow, text.glowDescription, showArtworkGlow),
        settingToggle(
          'artworkBackground',
          languageIsEnglish ? 'Artwork background' : '封面动态背景',
          languageIsEnglish ? 'Use the current artwork as the player and lyrics background.' : '使用当前歌曲封面作为播放页与歌词页背景。',
          artworkBackgroundEnabled,
        ),
      ],
      externalData: [
        settingToggle(
          'externalMetadataSearch',
          languageIsEnglish ? 'Search metadata online' : '从网络搜索元数据',
          languageIsEnglish ? 'Automatically search enabled sources. The player refresh button can still search once while this is off.' : '开启后会自动查询已启用的来源；关闭时播放器刷新按钮仍可单次查询。',
          externalMetadataSearchEnabled,
        ),
        settingToggle(
          'externalMetadataSkipExisting',
          languageIsEnglish ? 'Skip tracks with existing artwork or lyrics' : '已有封面或歌词时不联网获取',
          languageIsEnglish ? 'Keep the current artwork or lyrics and skip automatic online matching. The player refresh button can still search once.' : '保留当前封面或歌词，不自动联网匹配；播放器刷新按钮仍可单次强制查询。',
          externalMetadataSkipExisting,
        ),
        settingPicker(
          'externalSelectionMode',
          languageIsEnglish ? 'Result selection' : '结果选择',
          languageIsEnglish ? 'Ask for every result, or match each field automatically by source priority.' : '每次由你选择来源，或按来源优先级自动匹配各字段。',
          externalDataSelectionMode,
          [['ask', languageIsEnglish ? 'Ask every time' : '每次选择'], ['automatic', languageIsEnglish ? 'Automatic' : '自动匹配']],
        ),
        settingToggle('lrcapi', text.lrcApiSource, text.lrcApiSourceHint, lrcApiExternalDataEnabled),
        settingToggle('lrclib', text.lrclibSource, text.lrclibSourceHint, lrclibExternalDataEnabled),
        settingToggle('netease', text.neteaseSource, text.neteaseSourceHint, neteaseExternalDataEnabled),
        settingPicker(
          'neteaseAccessMode',
          languageIsEnglish ? 'NetEase access' : '网易云访问方式',
          languageIsEnglish ? 'Direct uses the unofficial Web API; self-hosted uses your NeteaseCloudMusicApi service.' : '直连使用非官方 Web 接口；自托管连接你的 NeteaseCloudMusicApi 服务。',
          neteaseAccessMode,
          [['direct', languageIsEnglish ? 'Direct Web API' : '直连 Web 接口'], ['selfHosted', languageIsEnglish ? 'Self-hosted' : '自托管']],
        ),
      ],
      library: [
        settingPicker(
          'defaultLibrarySource',
          text.defaultLibrarySource,
          text.defaultLibrarySourceHint,
          defaultLibrarySource,
          librarySourceSettingOptions,
        ),
        settingPicker(
          'defaultLocalView',
          text.defaultLocalView,
          text.defaultLocalViewHint,
          defaultLocalLibraryView,
          localLibraryViewOptions.map((value) => [value, labelForLocalLibraryView(value)]),
        ),
        settingToggle(
          'autoQueueImports',
          text.autoQueueImports,
          text.autoQueueImportsDescription,
          autoQueueImportedLocalTracks,
        ),
      ],
      remote: [
        settingToggle(
          'showPowerampRemoteConnection',
          text.powerampRemoteVisibility,
          text.powerampRemoteVisibilityDescription,
          showPowerampRemoteConnection,
        ),
      ],
      audioTags: [
        ...audioTagOptions.map((option) => settingToggle(
          `audioTag.${option.key}`,
          languageIsEnglish ? option.labelEn : option.labelZh,
          languageIsEnglish ? option.descriptionEn : option.descriptionZh,
          audioTagVisibility[option.key],
        )),
        settingAction('resetTags', text.resetTags, text.resetTagsDescription),
      ],
      storage: [
        {
          boolValue: null,
          description: '',
          disabled: false,
          id: 'storageUsed',
          kind: 'info',
          options: [],
          selection: null,
          title: text.storageUsed,
          value: formatStorageSize(localStorageBytes),
        },
        settingToggle('confirmDelete', text.confirmDelete, text.confirmDeleteDescription, confirmBeforeDeletingLocalTracks),
        settingAction('rescanMetadata', text.rescanMetadata, text.rescanMetadataDescription, localLibraryBusy),
        settingAction('clearLocalQueue', text.clearLocalQueue, text.clearLocalQueueDescription, localQueueTrackIds.length === 0),
        settingAction('clearRecent', text.clearRecent, text.clearRecentDescription, recentLocalTrackIds.length === 0),
      ],
    };
    const sectionSymbols: Record<SettingsSectionKey, string> = {
      interface: 'paintbrush',
      playback: 'waveform',
      externalData: 'globe',
      library: 'music.note.list',
      remote: 'dot.radiowaves.left.and.right',
      audioTags: 'tag',
      storage: 'internaldrive',
    };
    const payload = {
      connection: page === 'connect' ? {
        busy: connectPanelMode === 'streaming'
          ? streamingBusy
          : connectPanelMode === 'remote' ? powerampBusy : busy || !client || connectionDraftDirty,
        enabled: echoConnectionEnabled,
        host: connectionDraft.host,
        labels: {
          connect: text.connect,
          connectionDescription: text.echoConnectionDescription,
          echoConnection: text.echoConnection,
          enabled: text.echoConnectionEnabled,
          host: text.host,
          hostPlaceholder: text.manualHostPlaceholder,
          library: text.library,
          manual: text.manual,
          pairLink: text.pairLink,
          scanPairing: languageIsEnglish ? 'Scan QR Code' : '扫描二维码',
          port: text.portPlaceholder,
          save: text.save,
          streamable: text.streamable,
          streamingComingSoon: text.streamingComingSoon,
          streamingReserved: text.streamingReserved,
          test: busy ? text.testing : text.test,
          token: 'Token',
        },
        libraryCount: String(tracks.length),
        mode: connectPanelMode,
        modeOptions: connectPanelOptions.map(([id, label]) => ({ id, label })),
        pairingText,
        port: String(connectionDraft.port),
        powerampRemote: {
          enabled: powerampRemoteEnabled,
          host: powerampConnectionDraft.host,
          name: powerampConnectionDraft.name,
          port: powerampConnectionDraft.port,
          token: powerampConnectionDraft.token,
        },
        streamableCount: String(streamableTrackCount),
        streaming: {
          accessMode: neteaseAccessMode,
          accessModeOptions: [
            { id: 'direct', label: languageIsEnglish ? 'Direct Web API' : '直连 Web 接口' },
            { id: 'selfHosted', label: languageIsEnglish ? 'Self-hosted' : '自托管' },
          ],
          apiBaseUrl: streamingApiBaseUrl,
          busy: streamingBusy,
          loggedIn: Boolean(streamingProfile && streamingSessionMatchesApi),
          playlistCount: streamingPlaylists.length,
          profileAvatarUrl: streamingProfile?.avatarUrl ?? '',
          profileName: streamingProfile?.nickname ?? '',
          qrUrl: streamingQrUrl,
          status: streamingStatusText,
        },
        token: connectionDraft.token,
      } : null,
      language: appLanguage,
      library: page === 'library' || page === 'search' ? {
        busy: librarySource === 'streaming'
          ? streamingBusy
          : librarySource === 'remote'
          ? powerampBusy
          : page === 'search' || librarySource === 'all'
          ? busy || localLibraryBusy || powerampBusy
          : librarySource === 'local' ? localLibraryBusy : busy || !client,
        canPlayLocal: localTracks.length > 0,
        collections: displayedLibraryCollections.map((collection) => {
          const nativeArtwork = resolveArtworkUrl(collection.artworkUrl);
          const representative = sourceLibraryTracks.find((track) => (
            track.album?.trim() === collection.query
            || artistNamesForTrack(track, '').includes(collection.query)
          ));
          return {
            ...collection,
            artworkUrl: artworkUrlIsVisible(nativeArtwork)
              ? nativeArtwork ?? ''
              : representative ? artworkForLibraryTrack(representative) : '',
          };
        }),
        filter: libraryFilter,
        filterOptions: [
          { id: 'all', label: `${text.all} ${librarySource === 'remote' ? powerampTracks.length : tracks.length}` },
          { id: 'streamable', label: `${text.streamable} ${librarySource === 'remote' ? powerampTracks.filter((track) => track.canPlayOnPhone).length : streamableTrackCount}` },
          { id: 'local', label: `${librarySource === 'remote' ? text.remoteLibrary : text.pcLocal} ${librarySource === 'remote' ? powerampTracks.filter((track) => formatSourceTag(track.sourceLabel) === 'Local').length : pcLocalTrackCount}` },
        ],
        labels: {
          addToQueue: text.addToQueue,
          addToPlaylist: languageIsEnglish ? 'Add to playlist' : '加入歌单',
          cancel: languageIsEnglish ? 'Cancel' : '取消',
          collections: !showingAllLibrary && (librarySource === 'echo' ? echoLibraryView : librarySource === 'remote' ? powerampLibraryView : localLibraryView) === 'artists'
            ? (languageIsEnglish ? 'Artists' : '艺术家')
            : (languageIsEnglish ? 'Albums' : '专辑'),
          createPlaylist: languageIsEnglish ? 'Create playlist' : '创建歌单',
          deleteTrack: text.deleteLocalTrackTitle,
          deletePlaylist: languageIsEnglish ? 'Delete playlist' : '删除歌单',
          empty: librarySource === 'streaming'
            ? (streamingProfile
              ? (languageIsEnglish ? 'No matching NetEase Cloud Music content' : '没有匹配的网易云音乐内容')
              : (languageIsEnglish ? 'Sign in to NetEase Cloud Music from Connect first' : '请先在连接页登录网易云音乐'))
            : showingAllLibrary
            ? (languageIsEnglish ? 'No matching albums or tracks' : '没有匹配的专辑或歌曲')
            : librarySource === 'remote'
              ? (powerampRemoteEnabled ? (powerampError || (languageIsEnglish ? 'No matching Poweramp tracks' : '没有匹配的 Poweramp 歌曲')) : text.powerampRemoteNotConfigured)
              : librarySource === 'local' ? text.emptyLocalLibrary : text.emptyEchoLibrary,
          favorite: languageIsEnglish ? 'Favorite' : '收藏',
          favoritePlaylist: languageIsEnglish ? 'Favorite playlist' : '收藏歌单',
          importLyrics: text.importLyricsA11y,
          importMusic: text.importMusic,
          localPlay: text.localPlay,
          playNext: text.playNextA11y,
          playlistName: languageIsEnglish ? 'Playlist name' : '歌单名称',
          playlists: languageIsEnglish ? 'Playlists' : '歌单',
          pinPlaylist: languageIsEnglish ? 'Pin playlist' : '置顶歌单',
          removeFromPlaylist: languageIsEnglish ? 'Remove from playlist' : '从歌单移除',
          renamePlaylist: languageIsEnglish ? 'Rename playlist' : '重命名歌单',
          refresh: showingAllLibrary ? text.sync : librarySource === 'local' ? text.scan : text.sync,
          searchPlaceholder: text.searchPlaceholder,
          songs: text.songs,
          unFavoritePlaylist: languageIsEnglish ? 'Remove favorite' : '取消收藏',
          unpinPlaylist: languageIsEnglish ? 'Unpin playlist' : '取消置顶',
          unfavorite: languageIsEnglish ? 'Remove Favorite' : '取消收藏',
        },
        indexTitles: libraryIndexTitles,
        paginationScope: libraryPaginationScope,
        query,
        pagination: {
          expanded: libraryExpanded,
          page: effectiveLibraryPageIndex + 1,
          pageSize: libraryPageSize,
          totalCount: libraryPaginationTotal,
          totalPages: libraryTotalPages,
        },
        playlists: sortedPlaylists.map(nativePlaylist),
        selectedPlaylist: selectedPlaylist ? nativePlaylist(selectedPlaylist) : null,
        source: page === 'search' ? 'all' : librarySource,
        sourceOptions: librarySourceSettingOptions.map(([id, label]) => ({ id, label })),
        streaming: {
          libraryMode: streamingLibraryMode,
          libraryModeOptions: [
            { id: 'search', label: languageIsEnglish ? 'Search' : '搜索' },
            { id: 'playlists', label: languageIsEnglish ? 'Playlists' : '歌单' },
          ],
          loggedIn: Boolean(streamingProfile && streamingSessionMatchesApi),
          playlistCount: streamingSessionMatchesApi ? streamingPlaylists.length : 0,
          playlists: (streamingSessionMatchesApi ? displayedStreamingPlaylists : []).map((playlist) => ({
            artworkUrl: playlist.artworkUrl,
            favorite: favoriteStreamingPlaylistIds.includes(playlist.id),
            id: playlist.id,
            name: playlist.name,
            pinned: pinnedStreamingPlaylistIds.includes(playlist.id),
            sourceLabel: languageIsEnglish ? 'NetEase' : '网易云',
            trackCount: playlist.trackCount,
          })),
          profileName: streamingProfile?.nickname ?? '',
          selectedPlaylistId: selectedStreamingPlaylistId ?? '',
          selectedPlaylistName: streamingPlaylists.find((item) => item.id === selectedStreamingPlaylistId)?.name ?? '',
          status: streamingStatusText,
        },
        totalLabel: libraryExpanded
          ? (languageIsEnglish
            ? `${libraryPaginationTotal} items · page ${effectiveLibraryPageIndex + 1} of ${libraryTotalPages}`
            : `共 ${libraryPaginationTotal} 项 · 第 ${effectiveLibraryPageIndex + 1}/${libraryTotalPages} 页`)
          : (languageIsEnglish
            ? `${libraryPaginationTotal} items · showing ${Math.min(libraryPageSize, libraryPaginationTotal)}`
            : `共 ${libraryPaginationTotal} 项 · 显示 ${Math.min(libraryPageSize, libraryPaginationTotal)} 项`),
        tracks: displayedLibraryTracks.map((item) => {
          const localItem = item as LocalMusicTrack;
          const isLocalItem = localTrackById.has(item.id);
          const isRemoteItem = powerampTrackById.has(item.id);
          return {
            artworkUrl: artworkForLibraryTrack(item),
            artist: item.artist,
            canPlayOnPhone: item.canPlayOnPhone,
            durationMs: item.durationMs,
            discNo: item.discNo ?? null,
            favorite: isLocalItem
              ? favoriteLocalTrackIdSet.has(item.id)
              : isRemoteItem ? favoritePowerampTrackIdSet.has(item.id) : favoriteEchoTrackIdSet.has(item.id),
            group: showingAllLibrary
              ? (isLocalItem ? text.localLibrary : isRemoteItem ? text.remoteLibrary : text.echoLibrary)
              : isLocalItem ? localGroupLabel(localItem) ?? '' : isRemoteItem ? '' : echoGroupLabel(item) ?? '',
            hasLyrics: isLocalItem && localItem.hasLyrics,
            id: item.id,
            isLocal: isLocalItem,
            source: librarySource === 'streaming' ? 'streaming' : isLocalItem ? 'local' : isRemoteItem ? 'remote' : 'echo',
            tags: tagsForTrack(item, { includeDuration: true, visibleAudioTags: audioTagVisibility }),
            title: item.title,
            trackNo: item.trackNo ?? null,
          };
        }),
        view: librarySource === 'echo' ? echoLibraryView : librarySource === 'remote' ? powerampLibraryView : localLibraryView,
        viewOptions: (librarySource === 'echo' || librarySource === 'remote' ? echoLibraryViewOptions : localLibraryViewOptions)
          .map((id) => ({ id, label: labelForLocalLibraryView(id) })),
      } : null,
      page,
      settings: page === 'settings' ? {
        sections: settingsSections.map((section) => ({
          ...section,
          id: section.key,
          rows: settingRows[section.key],
          symbol: sectionSymbols[section.key],
        })),
        subtitle: text.settingsDescription,
      } : null,
      status: {
        broken: echoConnectionBroken,
        label: connectedLabel,
        online: echoConnectionOnline,
      },
      title: pageTitle,
    };
    return JSON.stringify(payload);
  };

  return (
    <View style={[styles.appRoot, nativePlayerEnabled ? styles.appRootNative : null]}>
      {nativePlayerEnabled ? (
        renderNativePlayer()
      ) : (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
          <View style={styles.pageShell} {...pagePanResponder.panHandlers}>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              page === 'control' ? styles.playerContent : null,
              page === 'control' && lyricsVisible ? styles.playerContentLyrics : null,
            ]}
            alwaysBounceVertical={page !== 'control'}
            automaticallyAdjustKeyboardInsets={false}
            bounces={page !== 'control'}
            keyboardShouldPersistTaps="handled"
            refreshControl={page === 'control' ? undefined : <RefreshControl refreshing={pullRefreshing} onRefresh={() => void refreshFromPull()} tintColor="#18181b" />}
            scrollEnabled={page !== 'control' || lyricsVisible || volumeExpanded}
          >
            <Animated.View style={[styles.pageTransition, pageAnimatedStyle]}>
            {page !== 'control' ? (
              <View style={styles.header}>
                <Text style={styles.title}>{pageTitle}</Text>
                {page === 'connect' ? (
                  <View style={styles.connectHeaderSwitch}>
                    {renderSegmentOptions<ConnectPanelMode>(connectPanelOptions, connectPanelMode, (value) => {
                      setConnectPanelMode(value);
                      if (value === 'streaming') {
                        showErrorAlert(text.streamingServices, text.streamingComingSoon, 'streaming-coming-soon');
                      }
                    })}
                  </View>
                ) : page === 'settings' ? (
                  <Text style={styles.description}>{text.settingsDescription}</Text>
                ) : null}
                <View style={[
                  styles.statusPill,
                  echoConnectionOnline ? styles.statusPillOnline : null,
                  echoConnectionBroken ? styles.statusPillError : null,
                ]}>
                  <View style={[
                    styles.statusDot,
                    echoConnectionOnline ? styles.statusDotOnline : null,
                    echoConnectionBroken ? styles.statusDotError : null,
                  ]} />
                  <Text style={[
                    styles.statusPillText,
                    echoConnectionOnline ? styles.statusPillTextOnline : null,
                    echoConnectionBroken ? styles.statusPillTextError : null,
                  ]}>{connectedLabel}</Text>
                </View>
              </View>
            ) : null}

            {page === 'connect' ? (
              <View style={styles.connectPage}>
                {connectPanelMode === 'streaming' ? (
                  <View style={styles.connectPanel}>
                    <Text style={styles.cardEyebrow}>{text.streamingServices}</Text>
                    <Text style={styles.cardTitle}>{text.streamingComingSoon}</Text>
                    <Text style={styles.hint}>{text.streamingReserved}</Text>
                  </View>
                ) : connectPanelMode === 'remote' ? (
                  <>
                    <View style={styles.connectPanel}>
                      <Text style={styles.cardEyebrow}>{text.powerampRemote}</Text>
                      <Text style={styles.cardTitle}>{text.powerampRemote}</Text>
                      {renderSettingSwitch(
                        text.powerampRemoteEnabled,
                        text.powerampRemoteDescription,
                        powerampRemoteEnabled,
                        setPowerampRemoteEnabled,
                      )}
                    </View>

                    <View style={styles.connectPanel}>
                      <Text style={styles.cardEyebrow}>{text.powerampRemoteSetup}</Text>
                      <Text style={styles.cardTitle}>{text.powerampRemoteSetup}</Text>
                      <TextInput
                        value={powerampConnectionDraft.host}
                        onChangeText={(host) => setPowerampConnectionDraft((current) => ({ ...current, host }))}
                        placeholder="192.168.1.10"
                        placeholderTextColor="#a8a29e"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.input}
                      />
                      <TextInput
                        value={powerampConnectionDraft.port}
                        onChangeText={(port) => setPowerampConnectionDraft((current) => ({ ...current, port }))}
                        placeholder={text.portPlaceholder}
                        placeholderTextColor="#a8a29e"
                        keyboardType="number-pad"
                        style={styles.input}
                      />
                      <TextInput
                        value={powerampConnectionDraft.token}
                        onChangeText={(token) => setPowerampConnectionDraft((current) => ({ ...current, token }))}
                        placeholder="Token"
                        placeholderTextColor="#a8a29e"
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        style={styles.input}
                      />
                      <TextInput
                        value={powerampConnectionDraft.name}
                        onChangeText={(name) => setPowerampConnectionDraft((current) => ({ ...current, name }))}
                        placeholder="Poweramp"
                        placeholderTextColor="#a8a29e"
                        style={styles.input}
                      />
                      <View style={styles.buttonRow}>
                        <Pressable
                          accessibilityLabel={text.save}
                          accessibilityRole="button"
                          style={styles.secondaryButton}
                          onPress={savePowerampRemoteConnection}
                        >
                          {renderButtonBlur(24)}
                          <SuperconIcon glyph="checkmark" size={15} color="#f8fafc" />
                          <Text style={styles.secondaryButtonText}>{text.save}</Text>
                        </Pressable>
                        <Pressable
                          accessibilityLabel={text.test}
                          accessibilityRole="button"
                          disabled={!powerampClient || powerampBusy}
                          style={styles.secondaryButton}
                          onPress={() => void refreshPowerampRemote()}
                        >
                          {renderButtonBlur(24)}
                          <AnimatedButtonContent motionKey={`poweramp-test-${powerampBusy}`} style={styles.buttonMotionRow}>
                            <SuperconIcon glyph="view-reload" size={15} color="#f8fafc" />
                            <Text style={styles.secondaryButtonText}>{powerampBusy ? text.testing : text.test}</Text>
                          </AnimatedButtonContent>
                        </Pressable>
                      </View>
                      {powerampError ? <Text style={styles.hint}>{powerampError}</Text> : null}
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.connectPanel}>
                      <Text style={styles.cardEyebrow}>EchoLink</Text>
                      <Text style={styles.cardTitle}>{text.echoConnection}</Text>
                      {renderSettingSwitch(text.echoConnectionEnabled, text.echoConnectionDescription, echoConnectionEnabled, setEchoConnectionEnabled)}
                    </View>

                    <View style={styles.connectHero}>
                      <BlurView intensity={28} pointerEvents="none" style={styles.playerCardBlur} tint="dark" />
                      <Text style={styles.connectHeroKicker}>EchoLink</Text>
                      <Text style={styles.connectHeroTitle}>{connectedLabel}</Text>
                      <View style={styles.connectMetricRow}>
                        <View style={styles.connectMetric}>
                          <Text style={styles.connectMetricValue} numberOfLines={1}>{connection.host || '--'}</Text>
                          <Text style={styles.connectMetricLabel}>{text.host}</Text>
                        </View>
                        <View style={styles.connectMetric}>
                          <Text style={styles.connectMetricValue}>{tracks.length}</Text>
                          <Text style={styles.connectMetricLabel}>{text.library}</Text>
                        </View>
                        <View style={styles.connectMetric}>
                          <Text style={styles.connectMetricValue}>{streamableTrackCount}</Text>
                          <Text style={styles.connectMetricLabel}>{text.streamable}</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.connectPanel}>
                      <Text style={styles.cardEyebrow}>{text.pairLink}</Text>
                      <Text style={styles.cardTitle}>{text.pairLink}</Text>
                      <TextInput
                        value={pairingText}
                        onChangeText={setPairingText}
                        placeholder="echo://pair?host=192.168.1.12&port=26789&token=..."
                        placeholderTextColor="#a8a29e"
                        autoCapitalize="none"
                        autoCorrect={false}
                        multiline
                        style={[styles.input, styles.pairingInput]}
                      />
                      <Pressable
                        accessibilityLabel={text.connectWithPairingA11y}
                        accessibilityRole="button"
                        style={styles.primaryButton}
                        onPress={() => void applyPairingText()}
                      >
                        {renderButtonBlur(12)}
                        <SuperconIcon glyph="external" size={16} color="#08110b" />
                        <Text style={styles.primaryButtonText}>{text.connect}</Text>
                      </Pressable>
                    </View>

                    <View style={styles.connectPanel}>
                      <Text style={styles.cardEyebrow}>{text.manual}</Text>
                      <Text style={styles.cardTitle}>{text.manual}</Text>
                      <TextInput
                        value={connectionDraft.host}
                        onChangeText={(host) => setConnectionDraft((current) => ({ ...current, host }))}
                        placeholder={text.manualHostPlaceholder}
                        placeholderTextColor="#a8a29e"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.input}
                      />
                      <TextInput
                        value={connectionDraft.port}
                        onChangeText={(port) => setConnectionDraft((current) => ({ ...current, port }))}
                        placeholder={text.portPlaceholder}
                        placeholderTextColor="#a8a29e"
                        keyboardType="number-pad"
                        style={styles.input}
                      />
                      <TextInput
                        value={connectionDraft.token}
                        onChangeText={(token) => setConnectionDraft((current) => ({ ...current, token }))}
                        placeholder="Token"
                        placeholderTextColor="#a8a29e"
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        style={styles.input}
                      />
                      <View style={styles.buttonRow}>
                        <Pressable
                          accessibilityLabel={text.saveManualConnectionA11y}
                          accessibilityRole="button"
                          style={styles.secondaryButton}
                          onPress={() => void saveManualConnection()}
                        >
                          {renderButtonBlur(24)}
                          <SuperconIcon glyph="checkmark" size={15} color="#f8fafc" />
                          <Text style={styles.secondaryButtonText}>{text.save}</Text>
                        </Pressable>
                        <Pressable
                          accessibilityLabel={text.testComputerConnectionA11y}
                          accessibilityRole="button"
                          style={styles.secondaryButton}
                          onPress={() => void refresh()}
                          disabled={!client || busy || connectionDraftDirty}
                        >
                          {renderButtonBlur(24)}
                          <AnimatedButtonContent motionKey={`test-${busy}`} style={styles.buttonMotionRow}>
                            <SuperconIcon glyph="view-reload" size={15} color="#f8fafc" />
                            <Text style={styles.secondaryButtonText}>{busy ? text.testing : text.test}</Text>
                          </AnimatedButtonContent>
                        </Pressable>
                      </View>
                    </View>
                  </>
                )}
              </View>
            ) : page === 'library' ? (
              <View style={styles.libraryPage}>
                <View style={styles.libraryHero}>
                  <Text style={styles.connectHeroKicker}>Library</Text>
                  <Text style={styles.libraryHeroTitle}>{activeLibraryTotal} 首</Text>
                </View>
                <View style={styles.libraryFilterRow}>
                  {fallbackLibrarySourceOptions.map(([value, label]) => (
                    <Pressable
                      accessibilityLabel={`${text.switchLibraryPrefix}${label}${text.switchLibrarySuffix}`}
                      accessibilityRole="button"
                      key={value}
                      onPress={() => {
                        setLibrarySource(value);
                        setLibraryExpanded(false);
                        setLibraryPageIndex(0);
                      }}
                      style={[styles.libraryFilterChip, librarySource === value ? styles.libraryFilterChipActive : null]}
                    >
                      {renderButtonBlur(librarySource === value ? 10 : 20)}
                      <AnimatedButtonContent motionKey={librarySource === value} style={styles.buttonMotionCenter}>
                        <Text style={[styles.libraryFilterText, librarySource === value ? styles.libraryFilterTextActive : null]}>{label}</Text>
                      </AnimatedButtonContent>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.librarySearchRow}>
                    <TextInput
                      value={query}
                      onChangeText={(nextQuery) => {
                        setQuery(nextQuery);
                        setLibraryExpanded(false);
                        setLibraryPageIndex(0);
                      }}
                    onSubmitEditing={() => {
                      if (librarySource === 'echo') {
                        void refresh();
                      } else if (librarySource === 'remote') {
                        void refreshPowerampRemote();
                      }
                    }}
                    placeholder={text.searchPlaceholder}
                    placeholderTextColor="#9b9690"
                    style={[styles.input, styles.librarySearchInput]}
                  />
                  <Pressable
                    accessibilityLabel={librarySource === 'local' ? text.scan : text.sync}
                    accessibilityRole="button"
                    disabled={librarySource === 'local'
                      ? localLibraryBusy
                      : librarySource === 'remote' ? !powerampClient || powerampBusy : (!client || busy)}
                    onPress={() => {
                      if (librarySource === 'local') {
                        void refreshLocalLibrary();
                        return;
                      }
                      if (librarySource === 'remote') {
                        void refreshPowerampRemote();
                        return;
                      }
                      void refresh();
                    }}
                    style={styles.libraryRefreshButton}
                  >
                    {renderButtonBlur(24)}
                    <AnimatedButtonContent motionKey={`library-refresh-${librarySource}-${busy}-${localLibraryBusy}-${powerampBusy}`} style={styles.buttonMotionRow}>
                      <SuperconIcon glyph="view-reload" size={15} color="#f8fafc" />
                      <Text style={styles.libraryRefreshText}>
                        {librarySource === 'local'
                          ? (localLibraryBusy ? text.scanning : text.scan)
                          : librarySource === 'remote'
                            ? (powerampBusy ? text.syncing : text.sync)
                            : (busy ? text.syncing : text.sync)}
                      </Text>
                    </AnimatedButtonContent>
                  </Pressable>
                </View>
                {librarySource === 'local' ? (
                  <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.localViewRow}>
                      {localLibraryViewOptions.map((value) => {
                        const label = labelForLocalLibraryView(value);
                        return (
                        <Pressable
                          accessibilityLabel={`${text.localLibrary} ${label}`}
                          accessibilityRole="button"
                          key={value}
                          onPress={() => {
                            setLocalLibraryView(value);
                            setLibraryExpanded(false);
                            setLibraryPageIndex(0);
                          }}
                          style={[styles.localViewChip, localLibraryView === value ? styles.localViewChipActive : null]}
                        >
                          {renderButtonBlur(localLibraryView === value ? 10 : 20)}
                          <Text style={[styles.libraryFilterText, localLibraryView === value ? styles.libraryFilterTextActive : null]}>{label}</Text>
                        </Pressable>
                      );
                      })}
                    </ScrollView>
                    <View style={styles.buttonRow}>
                      <Pressable
                        accessibilityLabel={text.importLocalMusicA11y}
                        accessibilityRole="button"
                        disabled={localLibraryBusy}
                        onPress={() => void importLocalLibrary()}
                        style={styles.secondaryButton}
                      >
                        {renderButtonBlur(24)}
                        <AnimatedButtonContent motionKey={`import-${localLibraryBusy}`} style={styles.buttonMotionRow}>
                          <SuperconIcon glyph="external" size={15} color="#f8fafc" />
                          <Text style={styles.secondaryButtonText}>{localLibraryBusy ? '...' : text.importMusic}</Text>
                        </AnimatedButtonContent>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={text.playFirstLocalMusicA11y}
                        accessibilityRole="button"
                        disabled={localTracks.length === 0}
                        onPress={switchToLocalPlayback}
                        style={styles.secondaryButton}
                      >
                        {renderButtonBlur(24)}
                        <SuperconIcon glyph="play-circle" size={16} color="#f8fafc" />
                      <Text style={styles.secondaryButtonText}>{text.localPlay}</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <View style={styles.libraryFilterRow}>
                    {([
                      ['all', `${text.all} ${librarySource === 'remote' ? powerampTracks.length : tracks.length}`],
                      ['streamable', `${text.streamable} ${librarySource === 'remote' ? powerampTracks.filter((track) => track.canPlayOnPhone).length : streamableTrackCount}`],
                      ['local', `${librarySource === 'remote' ? text.remoteLibrary : text.pcLocal} ${librarySource === 'remote' ? powerampTracks.filter((track) => formatSourceTag(track.sourceLabel) === 'Local').length : pcLocalTrackCount}`],
                    ] as const).map(([value, label]) => (
                      <Pressable
                        accessibilityLabel={`${text.filterA11y}${label}`}
                        accessibilityRole="button"
                        key={value}
                        onPress={() => {
                          setLibraryFilter(value);
                          setLibraryExpanded(false);
                          setLibraryPageIndex(0);
                        }}
                        style={[styles.libraryFilterChip, libraryFilter === value ? styles.libraryFilterChipActive : null]}
                      >
                        {renderButtonBlur(libraryFilter === value ? 10 : 20)}
                        <AnimatedButtonContent motionKey={libraryFilter === value} style={styles.buttonMotionCenter}>
                          <Text style={[styles.libraryFilterText, libraryFilter === value ? styles.libraryFilterTextActive : null]}>{label}</Text>
                        </AnimatedButtonContent>
                      </Pressable>
                    ))}
                  </View>
                )}

                <View style={styles.libraryList}>
                  {displayedLibraryTracks.length > 0 ? displayedLibraryTracks.map((item, index) => {
                    const localItem = item as LocalMusicTrack;
                    const previousLocalItem = displayedLibraryTracks[index - 1] as LocalMusicTrack | undefined;
                    const groupLabel = librarySource === 'local' ? localGroupLabel(localItem) : null;
                    const previousGroupLabel = librarySource === 'local' && previousLocalItem ? localGroupLabel(previousLocalItem) : null;
                    const showGroupHeader = Boolean(groupLabel && groupLabel !== previousGroupLabel);
                    const isFavorite = librarySource === 'local' && favoriteLocalTrackIdSet.has(item.id);
                    const itemArtworkUrl = resolveArtworkUrl(item.artworkUrl);
                    const itemArtworkVisible = artworkUrlIsVisible(itemArtworkUrl);
                    return (
                      <View key={item.id} style={styles.trackRowShell}>
                        {showGroupHeader ? (
                          <Text style={styles.localGroupHeader}>{groupLabel}</Text>
                        ) : null}
                        <Pressable
                          accessibilityLabel={`${librarySource === 'local' ? text.playLocalTrackA11y : isPhoneOutput && item.canPlayOnPhone ? text.streamToPhonePlayback : text.controlComputerPlayback} ${item.title}`}
                          accessibilityRole="button"
                          style={styles.trackRow}
                          onPress={() => {
                            if (librarySource === 'local') {
                              void playTrackOnLocal(localItem, 0);
                              return;
                            }
                            if (librarySource === 'remote') {
                              playPowerampTrack(item as PowerampRemoteTrack, 0);
                              return;
                            }
                            if (isPhoneOutput && item.canPlayOnPhone) {
                              void playTrackOnPhone(item, 0, false);
                              return;
                            }
                            playTrackOnPc(item);
                          }}
                        >
                          <View style={styles.libraryArtwork}>
                            <View style={styles.libraryArtworkFallback}>
                              <SuperconIcon glyph="waveform" size={20} color="rgba(248, 250, 252, 0.36)" />
                            </View>
                            {itemArtworkVisible ? (
                              <RNImage
                                fadeDuration={0}
                                onError={() => markArtworkUrlFailed(itemArtworkUrl)}
                                onLoad={() => markArtworkUrlLoaded(itemArtworkUrl)}
                                resizeMode="cover"
                                source={{ uri: itemArtworkUrl }}
                                style={[
                                  styles.libraryArtworkImage,
                                  artworkUrlHasLoaded(itemArtworkUrl) ? null : styles.artworkImageHidden,
                                ]}
                              />
                            ) : null}
                          </View>
                          <View style={styles.trackText}>
                            <Text style={styles.listTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.listMeta} numberOfLines={1}>{item.artist}{librarySource === 'local' && localItem.hasLyrics ? ' · LRC' : ''}</Text>
                            <View style={styles.libraryTagRow}>
                              {tagsForTrack(item, { includeDuration: true, visibleAudioTags: audioTagVisibility }).map((tag) => (
                                <Text key={`${item.id}-${tag}`} style={styles.libraryTag}>{tag}</Text>
                              ))}
                            </View>
                          </View>
                          {librarySource === 'local' ? (
                            <View style={styles.localTrackActions}>
                              <Pressable
                                accessibilityLabel={isFavorite ? '取消收藏' : '收藏歌曲'}
                                accessibilityRole="button"
                                onPress={(event) => {
                                  event.stopPropagation();
                                  toggleLocalFavorite(localItem);
                                }}
                                style={[styles.localTrackActionButton, isFavorite ? styles.localTrackActionButtonActive : null]}
                              >
                                <Text style={[styles.localTrackActionText, isFavorite ? styles.localTrackActionTextActive : null]}>♥</Text>
                              </Pressable>
                              <Pressable
                                accessibilityLabel={text.addToQueue}
                                accessibilityRole="button"
                                onPress={(event) => {
                                  event.stopPropagation();
                                  addLocalTrackToQueue(localItem);
                                }}
                                style={styles.localTrackActionButton}
                              >
                              <Text style={styles.localTrackActionText}>＋</Text>
                              </Pressable>
                              <Pressable
                                accessibilityLabel={text.playNextA11y}
                                accessibilityRole="button"
                                onPress={(event) => {
                                  event.stopPropagation();
                                  playLocalTrackNext(localItem);
                                }}
                                style={styles.localTrackActionButton}
                              >
                                <Text style={styles.localTrackActionText}>{text.nextPlay}</Text>
                              </Pressable>
                              <Pressable
                                accessibilityLabel={text.importLyricsA11y}
                                accessibilityRole="button"
                                onPress={(event) => {
                                  event.stopPropagation();
                                  void importLyricsForLocalTrack(localItem);
                                }}
                                style={styles.localTrackActionButton}
                              >
                                <Text style={styles.localTrackActionText}>{text.importLyrics}</Text>
                              </Pressable>
                              <Pressable
                                accessibilityLabel={text.deleteLocalTrackA11y}
                                accessibilityRole="button"
                                onPress={(event) => {
                                  event.stopPropagation();
                                  deleteLocalTrack(localItem);
                                }}
                                style={styles.localTrackActionButton}
                              >
                                <Text style={styles.localTrackActionText}>{text.deleteAction}</Text>
                              </Pressable>
                            </View>
                          ) : (
                            <SuperconIcon glyph="play-circle" size={22} color="#ad2025" />
                          )}
                        </Pressable>
                      </View>
                    );
                  }) : (
                    <Text style={styles.hint}>
                      {librarySource === 'local'
                        ? text.emptyLocalLibrary
                        : librarySource === 'remote'
                          ? (powerampError || text.powerampRemoteNotConfigured)
                        : text.emptyEchoLibrary}
                    </Text>
                  )}
                </View>
                {activeLibraryTotal > libraryPageSize ? (
                  libraryExpanded ? (
                    <View style={styles.libraryFilterRow}>
                      <Pressable
                        accessibilityLabel={languageIsEnglish ? 'Previous page' : '上一页'}
                        accessibilityRole="button"
                        disabled={effectiveLibraryPageIndex === 0}
                        onPress={() => setLibraryPageIndex((current) => Math.max(0, current - 1))}
                        style={[styles.libraryFilterChip, effectiveLibraryPageIndex === 0 ? { opacity: 0.38 } : null]}
                      >
                        {renderButtonBlur(20)}
                        <SuperconIcon glyph="view-back" size={16} color="#f8fafc" />
                      </Pressable>
                      <View style={styles.libraryFilterChip}>
                        <Text style={[styles.libraryFilterText, styles.libraryFilterTextActive]}>
                          {effectiveLibraryPageIndex + 1} / {libraryTotalPages}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityLabel={languageIsEnglish ? 'Next page' : '下一页'}
                        accessibilityRole="button"
                        disabled={effectiveLibraryPageIndex >= libraryTotalPages - 1}
                        onPress={() => setLibraryPageIndex((current) => Math.min(libraryTotalPages - 1, current + 1))}
                        style={[styles.libraryFilterChip, effectiveLibraryPageIndex >= libraryTotalPages - 1 ? { opacity: 0.38 } : null]}
                      >
                        {renderButtonBlur(20)}
                        <SuperconIcon glyph="view-forward" size={16} color="#f8fafc" />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={languageIsEnglish ? 'Collapse pages' : '收起分页'}
                        accessibilityRole="button"
                        onPress={() => {
                          setLibraryExpanded(false);
                          setLibraryPageIndex(0);
                        }}
                        style={styles.libraryFilterChip}
                      >
                        {renderButtonBlur(20)}
                        <SuperconIcon glyph="view-close-small" size={14} color="#f8fafc" />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityLabel={languageIsEnglish ? 'Browse all tracks by page' : '展开全部歌曲并分页浏览'}
                      accessibilityRole="button"
                      onPress={() => {
                        setLibraryExpanded(true);
                        setLibraryPageIndex(0);
                      }}
                      style={styles.secondaryButton}
                    >
                      {renderButtonBlur(20)}
                      <SuperconIcon glyph="view-forward" size={15} color="#f8fafc" />
                      <Text style={styles.secondaryButtonText}>
                        {languageIsEnglish ? `Browse all ${activeLibraryTotal} tracks` : `展开全部 ${activeLibraryTotal} 首并分页浏览`}
                      </Text>
                    </Pressable>
                  )
                ) : null}
              </View>
            ) : page === 'settings' ? (
              <View style={styles.settingsPage}>
                <View style={styles.settingsPanel}>
                  <Text style={styles.cardEyebrow}>{text.settingsCenter}</Text>
                  <Text style={styles.cardTitle}>{text.chooseCategory}</Text>
                  <Text style={styles.hint}>{text.settingsDescription}</Text>
                </View>

                <View style={styles.settingsSectionList}>
                  {settingsSections.map((section) => {
                    const expanded = openSettingsSection === section.key;
                    return (
                      <View key={section.key} style={[styles.settingsSectionCard, expanded ? styles.settingsSectionCardOpen : null]}>
                        <Pressable
                          accessibilityLabel={section.title}
                          accessibilityRole="button"
                          onPress={() => toggleSettingsSection(section.key)}
                          style={styles.settingsSectionHeader}
                        >
                          <View style={styles.settingText}>
                            <Text style={styles.settingTitle}>{section.title}</Text>
                            <Text style={styles.settingDescription}>{section.description}</Text>
                          </View>
                          <View style={styles.settingsSectionMeta}>
                            <Text style={styles.settingsSectionSummary} numberOfLines={1}>{section.summary}</Text>
                            <AnimatedButtonContent motionKey={expanded} style={styles.buttonMotionCenter}>
                              <Text style={styles.settingsChevron}>{expanded ? '−' : '+'}</Text>
                            </AnimatedButtonContent>
                          </View>
                        </Pressable>
                        {expanded ? (
                          <SettingsReveal motionKey={section.key}>
                            {renderSettingsBody(section.key)}
                          </SettingsReveal>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <>
                <View
                  style={[
                    styles.playerCard,
                    { gap: playerShellGap, padding: playerShellPadding },
                    lyricsVisible ? styles.playerCardLyrics : null,
                  ]}
                >
                  <BlurView intensity={32} pointerEvents="none" style={styles.playerCardBlur} tint="dark" />
                  {lyricsVisible ? (
                    <Animated.View style={[styles.lyricsMode, lyricsPanelAnimatedStyle]}>
                      {renderLyricsHeader()}

                      <View
                        style={[styles.lyricsViewport, { height: lyricsViewportTargetHeight }]}
                      >
                        <ScrollView
                          contentContainerStyle={styles.lyricsScrollContent}
                          ref={lyricsScrollRef}
                          showsVerticalScrollIndicator={false}
                        >
                          {lyricLines.map((line, index) => {
                            const isActive = index === activeLyricIndex;
                            const distance = Math.abs(index - activeLyricIndex);
                            return (
                              <Pressable
                                accessibilityLabel={line.timeMs === null ? line.text : `跳转到 ${formatTime(line.timeMs)}：${line.text}`}
                                accessibilityRole={line.timeMs === null ? undefined : 'button'}
                                disabled={line.timeMs === null}
                                key={line.id}
                                onLayout={(event) => {
                                  lyricLineLayoutsRef.current[line.id] = event.nativeEvent.layout;
                                }}
                                onPress={() => seekToLyric(line)}
                                style={styles.lyricLineButton}
                              >
                                <Text
                                  numberOfLines={2}
                                  style={[
                                    styles.lyricLineText,
                                    distance === 1 ? styles.lyricLineTextNear : null,
                                    distance > 1 ? styles.lyricLineTextFar : null,
                                    isActive ? styles.lyricLineTextActive : null,
                                  ]}
                                >
                                  {line.text}
                                </Text>
                                {line.timeMs !== null && !isActive ? (
                                  <Text style={styles.lyricTimestamp}>{formatTime(line.timeMs)}</Text>
                                ) : null}
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>

                      <View style={styles.lyricsControlPanel}>
                        <View style={styles.compactControlRow}>
                          {renderProgressScrubber(true)}
                          {renderExpandableVolume()}
                        </View>
                        {renderTransportControls(true)}
                        {renderSecondaryControls(true)}
                      </View>
                    </Animated.View>
                  ) : (
                    <Animated.View style={[styles.defaultPlayerMode, defaultPlayerAnimatedStyle]}>
                      <View style={styles.playerStatusBar}>
                        <View style={styles.playerStatusLeft}>
                          <Text style={styles.cardEyebrow}>{text.nowPlaying}</Text>
                          <Text style={styles.playerStatusText} numberOfLines={1}>{playbackModeLabel}</Text>
                        </View>
                        {renderConnectionChip('inline')}
                      </View>
                      <View style={styles.artworkStage}>
                        {showArtworkGlow ? <View style={styles.artworkGlow} /> : null}
                        {renderArtwork('default')}
                      </View>
                      <View style={styles.trackInfoPanel}>
                        <Text style={[styles.trackTitle, { fontSize: playerTitleSize }]} numberOfLines={2}>{displayTrack?.title ?? text.noTrack}</Text>
                        <View style={styles.playbackTagRow}>
                          {playbackTags.map((tag) => (
                            <Text key={tag} style={styles.playbackTag}>{tag}</Text>
                          ))}
                        </View>
                      </View>
                      <View style={styles.playerControlDeck}>
                        {renderProgressScrubber()}
                        {renderTransportControls()}
                        {renderSecondaryControls()}
                      </View>

                      {renderOutputSwitch()}
                    </Animated.View>
                  )}
                </View>
              </>
            )}
            </Animated.View>
          </ScrollView>

          {renderEqModal()}

          {page === 'control' && playlistVisible ? (
            <View style={styles.playlistOverlay} pointerEvents="box-none">
              <Animated.View style={[styles.playlistBackdrop, playlistBackdropAnimatedStyle]}>
                <Pressable
                  accessibilityLabel={text.closePlaylistPreview}
                  accessibilityRole="button"
                  onPress={() => setPlaylistOpen(false)}
                  style={styles.playlistBackdropPressable}
                />
              </Animated.View>
              <Animated.View style={[styles.playlistPopover, playlistPopoverAnimatedStyle]}>
                <View style={styles.playlistPopoverHeader}>
                  <View>
                    <Text style={styles.playlistPopoverEyebrow}>{text.queue}</Text>
                    <Text style={styles.playlistPopoverTitle}>{text.playlist}</Text>
                  </View>
                  <View style={styles.playlistHeaderActions}>
                    {isLocalOutput && localQueueTrackIds.length > 0 ? (
                      <Pressable
                        accessibilityLabel={text.clearLocalQueue}
                        accessibilityRole="button"
                        onPress={() => {
                          setLocalQueueActive(true);
                          setLocalQueueTrackIds([]);
                        }}
                        style={styles.playlistSmallButton}
                      >
                        <Text style={styles.playlistSmallButtonText}>{text.clear}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityLabel={text.closePlaylist}
                      accessibilityRole="button"
                      onPress={() => setPlaylistOpen(false)}
                      style={styles.playlistCloseButton}
                    >
                      <SuperconIcon glyph="view-close-small" size={19} color="#f8fafc" />
                    </Pressable>
                  </View>
                </View>
                <View style={styles.playlistPopoverList}>
                  {visiblePlaylistItems.length > 0 ? visiblePlaylistItems.map((item, index) => {
                    const isCurrentTrack = item.id === playbackQueue?.currentTrackId || item.id === displayTrack?.id;
                    const localItem = item as LocalMusicTrack;
                    return (
                      <Pressable
                        accessibilityLabel={`${text.playlistItemPrefix} ${index + 1}: ${item.title}`}
                        accessibilityRole="button"
                        key={`${item.id}-${index}`}
                        onPress={() => {
                          setPlaylistOpen(false);
                          if (isLocalOutput) {
                            void playTrackOnLocal(item as LocalMusicTrack, 0);
                            return;
                          }
                          if (isPhoneOutput) {
                            void playTrackOnPhone(item, 0, false);
                            return;
                          }
                          playTrackOnPc(item);
                        }}
                        style={[styles.playlistItem, isCurrentTrack ? styles.playlistItemActive : null]}
                      >
                        <Text style={[styles.playlistIndex, isCurrentTrack ? styles.playlistIndexActive : null]}>
                          {String(index + 1).padStart(2, '0')}
                        </Text>
                        <View style={styles.playlistText}>
                          <Text style={[styles.playlistTitle, isCurrentTrack ? styles.playlistTitleActive : null]} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.playlistMeta} numberOfLines={1}>
                            {item.artist} · {item.album || item.sourceLabel}
                          </Text>
                        </View>
                        {isLocalOutput && localQueueTrackIds.length > 0 ? (
                          <View style={styles.localQueueControls}>
                            <Pressable
                              accessibilityLabel={text.moveUp}
                              accessibilityRole="button"
                              disabled={index === 0}
                              onPress={(event) => {
                                event.stopPropagation();
                                moveLocalQueueTrack(localItem, -1);
                              }}
                              style={styles.localQueueButton}
                            >
                              <Text style={styles.localQueueButtonText}>↑</Text>
                            </Pressable>
                            <Pressable
                              accessibilityLabel={text.moveDown}
                              accessibilityRole="button"
                              disabled={index >= playlistItems.length - 1}
                              onPress={(event) => {
                                event.stopPropagation();
                                moveLocalQueueTrack(localItem, 1);
                              }}
                              style={styles.localQueueButton}
                            >
                              <Text style={styles.localQueueButtonText}>↓</Text>
                            </Pressable>
                            <Pressable
                              accessibilityLabel={text.removeFromQueue}
                              accessibilityRole="button"
                              onPress={(event) => {
                                event.stopPropagation();
                                setLocalQueueActive(true);
                                setLocalQueueTrackIds((current) => (
                                  localQueueActive || current.length > 0 ? current : localTracks.map((track) => track.id)
                                ).filter((id) => id !== item.id));
                              }}
                              style={styles.localQueueButton}
                            >
                              <Text style={styles.localQueueButtonText}>×</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  }) : (
                    <Text style={styles.playlistEmpty}>{text.queueEmpty}</Text>
                  )}
                </View>
                {hiddenPlaylistItemCount > 0 ? (
                  <Text style={styles.playlistMore}>
                    {languageIsEnglish ? `${hiddenPlaylistItemCount} ${text.moreInQueueSuffix}` : `还有 ${hiddenPlaylistItemCount} ${text.moreInQueueSuffix}`}
                  </Text>
                ) : null}
              </Animated.View>
            </View>
          ) : null}

          <View style={styles.dock}>
            <Pressable
              accessibilityLabel={text.playbackPage}
              accessibilityRole="button"
              style={styles.dockItem}
              onPress={() => switchPage('control')}
            >
              <AnimatedButtonContent motionKey={page === 'control'} style={styles.dockItemContent}>
                <SuperconIcon
                  glyph="headphones"
                  size={20}
                  color={page === 'control' ? '#ad2025' : 'rgba(45, 26, 23, 0.48)'}
                />
                <Text style={[styles.dockLabel, page === 'control' ? styles.dockLabelActive : null]}>{text.playback}</Text>
              </AnimatedButtonContent>
            </Pressable>
            <Pressable
              accessibilityLabel={text.libraryPage}
              accessibilityRole="button"
              style={styles.dockItem}
              onPress={() => switchPage('library')}
            >
              <AnimatedButtonContent motionKey={page === 'library'} style={styles.dockItemContent}>
                <SuperconIcon
                  glyph="list"
                  size={20}
                  color={page === 'library' ? '#ad2025' : 'rgba(45, 26, 23, 0.48)'}
                />
                <Text style={[styles.dockLabel, page === 'library' ? styles.dockLabelActive : null]}>{text.library}</Text>
              </AnimatedButtonContent>
            </Pressable>
            <Pressable
              accessibilityLabel={text.connectPage}
              accessibilityRole="button"
              style={styles.dockItem}
              onPress={() => switchPage('connect')}
            >
              <AnimatedButtonContent motionKey={page === 'connect'} style={styles.dockItemContent}>
                <SuperconIcon
                  glyph="link"
                  size={20}
                  color={page === 'connect' ? '#ad2025' : 'rgba(45, 26, 23, 0.48)'}
                />
                <Text style={[styles.dockLabel, page === 'connect' ? styles.dockLabelActive : null]}>{text.connect}</Text>
              </AnimatedButtonContent>
            </Pressable>
            <Pressable
              accessibilityLabel={text.settingsPage}
              accessibilityRole="button"
              style={styles.dockItem}
              onPress={() => switchPage('settings')}
            >
              <AnimatedButtonContent motionKey={page === 'settings'} style={styles.dockItemContent}>
                <SuperconIcon
                  glyph="settings"
                  size={20}
                  color={page === 'settings' ? '#ad2025' : 'rgba(45, 26, 23, 0.48)'}
                />
                <Text style={[styles.dockLabel, page === 'settings' ? styles.dockLabelActive : null]}>{text.settings}</Text>
              </AnimatedButtonContent>
            </Pressable>
          </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      )}
    </View>
  );
}

export default function App(): ReactElement {
  return (
    <AppErrorBoundary>
      <EchoLinkApp />
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: '#101014',
  },
  appRootNative: {
    backgroundColor: '#f7f3ef',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#101014',
  },
  root: {
    flex: 1,
  },
  pageShell: {
    flex: 1,
  },
  content: {
    gap: 18,
    padding: 18,
    paddingBottom: 144,
  },
  pageTransition: {
    gap: 18,
    width: '100%',
  },
  glassButtonBlur: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  buttonMotionCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonMotionExitLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  buttonMotionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  buttonMotionShell: {
    position: 'relative',
  },
  playerContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 94,
    paddingTop: 30,
  },
  nativeApp: {
    flex: 1,
    backgroundColor: 'transparent',
    width: '100%',
  },
  playerContentLyrics: {
    justifyContent: 'center',
    paddingBottom: 96,
    paddingTop: 24,
  },
  header: {
    gap: 9,
    paddingHorizontal: 2,
    paddingTop: 18,
  },
  connectHeaderSwitch: {
    maxWidth: 360,
    width: '100%',
  },
  kicker: {
    color: '#8b8b86',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f8fafc',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  description: {
    color: 'rgba(248, 250, 252, 0.62)',
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 330,
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 7,
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },
  statusPillOnline: {
    backgroundColor: 'rgba(173, 32, 37, 0.16)',
    borderColor: 'rgba(173, 32, 37, 0.28)',
  },
  statusPillError: {
    backgroundColor: 'rgba(127, 29, 29, 0.28)',
    borderColor: 'rgba(248, 113, 113, 0.34)',
  },
  statusDot: {
    backgroundColor: '#a1a1aa',
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  statusDotOnline: {
    backgroundColor: '#ad2025',
  },
  statusDotError: {
    backgroundColor: '#dc2626',
  },
  statusPillText: {
    color: 'rgba(248, 250, 252, 0.58)',
    fontSize: 12,
    fontWeight: '800',
  },
  statusPillTextOnline: {
    color: '#fecaca',
  },
  statusPillTextError: {
    color: '#dc2626',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderColor: 'rgba(39, 39, 42, 0.08)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 16,
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.07,
    shadowRadius: 24,
  },
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    padding: 16,
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.055,
    shadowRadius: 28,
  },
  cardEyebrow: {
    color: '#8a8178',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  hint: {
    color: 'rgba(248, 250, 252, 0.58)',
    fontSize: 13,
    lineHeight: 19,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 18,
    borderWidth: 1,
    color: '#f8fafc',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.035,
    shadowRadius: 14,
  },
  pairingInput: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#ad2025',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 13,
    position: 'relative',
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
  },
  primaryButtonText: {
    color: '#08110b',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 46,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 12,
    position: 'relative',
  },
  secondaryButtonText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  connectPage: {
    gap: 14,
  },
  connectHero: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 32,
    borderWidth: 1,
    gap: 8,
    overflow: 'hidden',
    padding: 18,
  },
  connectHeroKicker: {
    color: 'rgba(248, 250, 252, 0.58)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  connectHeroTitle: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  connectHeroText: {
    color: 'rgba(248, 250, 252, 0.64)',
    fontSize: 13,
    lineHeight: 20,
  },
  connectMetricRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 8,
  },
  connectMetric: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  connectMetricValue: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '900',
    minWidth: 0,
  },
  connectMetricLabel: {
    color: 'rgba(248, 250, 252, 0.5)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  connectPanel: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  errorBox: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  errorTitle: {
    color: '#be123c',
    fontWeight: '800',
  },
  errorText: {
    color: '#be123c',
    fontSize: 13,
    lineHeight: 18,
  },
  warningBox: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  warningTitle: {
    color: '#a16207',
    fontWeight: '800',
  },
  warningText: {
    color: '#92400e',
    fontSize: 13,
    lineHeight: 18,
  },
  playerCard: {
    alignItems: 'stretch',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 14,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.09,
    shadowRadius: 34,
  },
  playerCardLyrics: {
    backgroundColor: 'rgba(24, 24, 27, 0.9)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  defaultPlayerMode: {
    alignItems: 'stretch',
    gap: 10,
    width: '100%',
  },
  lyricsMode: {
    alignSelf: 'stretch',
    gap: 14,
  },
  lyricsTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  playerCardBlur: {
    ...StyleSheet.absoluteFill,
  },
  playerStatusBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    width: '100%',
  },
  playerStatusLeft: {
    flex: 1,
    gap: 4,
  },
  playerStatusText: {
    color: 'rgba(248, 250, 252, 0.58)',
    fontSize: 13,
    fontWeight: '700',
  },
  trackInfoPanel: {
    alignSelf: 'stretch',
    gap: 8,
  },
  playerControlDeck: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    padding: 10,
  },
  lyricsHeroText: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  lyricsCloseButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 42,
  },
  artworkStage: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    minHeight: 0,
    position: 'relative',
  },
  artworkShell: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#232329',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 32,
    borderWidth: 1,
    height: 252,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.14,
    shadowRadius: 32,
    width: 252,
  },
  artworkImage: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },
  artworkImageHidden: {
    opacity: 0,
  },
  artworkFallback: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  artworkFallbackText: {
    color: 'rgba(248, 250, 252, 0.32)',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 3,
  },
  artworkFallbackTextLyrics: {
    fontSize: 20,
    letterSpacing: 2,
  },
  artworkGlow: {
    backgroundColor: 'rgba(173, 32, 37, 0.52)',
    borderRadius: 999,
    height: 14,
    opacity: 0.42,
    position: 'absolute',
    top: 0,
    width: '58%',
  },
  playerConnectionChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 9,
    position: 'absolute',
    right: 0,
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    top: 12,
    width: 112,
  },
  playerConnectionChipInline: {
    alignSelf: 'auto',
    minWidth: 118,
    position: 'relative',
    right: undefined,
    top: undefined,
    width: 118,
  },
  playerConnectionChipError: {
    backgroundColor: 'rgba(127, 29, 29, 0.28)',
    borderColor: 'rgba(248, 113, 113, 0.32)',
  },
  playerConnectionKicker: {
    color: '#8b8b86',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  playerConnectionKickerError: {
    color: '#ef4444',
  },
  playerConnectionStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  playerConnectionText: {
    color: '#f8fafc',
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
  },
  playerConnectionTextError: {
    color: '#dc2626',
  },
  playerConnectionDetail: {
    color: 'rgba(248, 250, 252, 0.52)',
    fontSize: 10,
    fontWeight: '700',
  },
  playerConnectionDetailError: {
    color: '#b91c1c',
  },
  trackTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.35,
    textAlign: 'left',
  },
  trackTitleLyrics: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.45,
    lineHeight: 30,
  },
  trackMeta: {
    color: 'rgba(248, 250, 252, 0.58)',
    fontSize: 14,
    textAlign: 'center',
  },
  playbackTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    justifyContent: 'center',
    minHeight: 22,
  },
  playbackTagRowLyrics: {
    justifyContent: 'flex-start',
    minHeight: 0,
  },
  playbackTag: {
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 999,
    borderWidth: 1,
    color: 'rgba(248, 250, 252, 0.72)',
    fontSize: 9,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  playbackTagDark: {
    borderColor: 'rgba(255, 255, 255, 0.16)',
    color: 'rgba(248, 250, 252, 0.76)',
  },
  lyricsConnectionText: {
    color: 'rgba(248, 250, 252, 0.62)',
    fontSize: 12,
    fontWeight: '800',
  },
  lyricsConnectionTextError: {
    color: '#fca5a5',
  },
  outputSwitch: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  outputSwitchLyrics: {
    alignSelf: 'stretch',
  },
  outputSwitchButton: {
    alignItems: 'center',
    borderRadius: 20,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 10,
    position: 'relative',
  },
  outputSwitchButtonActive: {
    backgroundColor: 'rgba(173, 32, 37, 0.18)',
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  outputSwitchText: {
    color: 'rgba(248, 250, 252, 0.58)',
    fontSize: 13,
    fontWeight: '800',
  },
  outputSwitchTextActive: {
    color: '#fecaca',
  },
  phoneAudioError: {
    alignSelf: 'stretch',
    color: '#9f1239',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  progressTrack: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    height: 7,
    overflow: 'hidden',
    width: '100%',
  },
  compactProgressTrack: {
    height: 8,
  },
  sliderTouchArea: {
    justifyContent: 'center',
    minHeight: 36,
    position: 'relative',
    width: '100%',
  },
  compactSliderTouchArea: {
    minHeight: 36,
  },
  progressFill: {
    backgroundColor: '#ad2025',
    borderRadius: 999,
    height: '100%',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  compactProgressShell: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  compactTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  progressText: {
    color: 'rgba(248, 250, 252, 0.52)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  lyricsControlPanel: {
    alignSelf: 'stretch',
    gap: 10,
    paddingTop: 2,
  },
  compactControlRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
  },
  lyricsViewport: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
  },
  lyricsScrollContent: {
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 22,
  },
  lyricLineButton: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  lyricLineText: {
    color: 'rgba(248, 250, 252, 0.36)',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 28,
  },
  lyricLineTextNear: {
    color: 'rgba(248, 250, 252, 0.58)',
  },
  lyricLineTextFar: {
    color: 'rgba(203, 213, 225, 0.28)',
  },
  lyricLineTextActive: {
    color: '#ffffff',
    fontSize: 25,
    lineHeight: 34,
    textShadowColor: 'rgba(255, 255, 255, 0.28)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  lyricTimestamp: {
    color: 'rgba(203, 213, 225, 0.58)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    marginTop: 2,
  },
  transportRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'center',
    width: '100%',
  },
  lyricsTransportRow: {
    gap: 16,
    paddingTop: 0,
  },
  secondaryControlsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    width: '100%',
  },
  secondaryControlsRowCompact: {
    gap: 8,
    justifyContent: 'flex-start',
  },
  roundButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderColor: 'rgba(255, 255, 255, 0.13)',
    borderRadius: 999,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    width: 50,
  },
  roundButtonLyrics: {
    height: 54,
    width: 54,
  },
  playButton: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    height: 78,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    width: 78,
  },
  playButtonLyrics: {
    height: 82,
    width: 82,
  },
  repeatButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderColor: 'rgba(255, 255, 255, 0.13)',
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 44,
  },
  repeatButtonCompact: {
    height: 42,
    width: 42,
  },
  repeatButtonActive: {
    backgroundColor: 'rgba(173, 32, 37, 0.2)',
    borderColor: 'rgba(173, 32, 37, 0.42)',
  },
  repeatButtonBadge: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 10,
    position: 'absolute',
    right: 10,
    textAlign: 'center',
    top: 11,
  },
  lyricsButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderColor: 'rgba(255, 255, 255, 0.13)',
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 44,
  },
  lyricsButtonCompact: {
    height: 42,
    width: 42,
  },
  lyricsButtonActive: {
    backgroundColor: 'rgba(173, 32, 37, 0.2)',
    borderColor: 'rgba(173, 32, 37, 0.42)',
  },
  lyricsButtonText: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 20,
    textAlign: 'center',
  },
  lyricsButtonTextActive: {
    color: '#ffffff',
  },
  playlistMiniButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderColor: 'rgba(255, 255, 255, 0.13)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    minWidth: 58,
    paddingHorizontal: 11,
    position: 'relative',
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  playlistMiniButtonCompact: {
    height: 42,
    minWidth: 54,
    paddingHorizontal: 11,
  },
  playlistMiniButtonActive: {
    backgroundColor: 'rgba(173, 32, 37, 0.2)',
    borderColor: 'rgba(173, 32, 37, 0.42)',
  },
  playlistMiniCount: {
    color: 'rgba(248, 250, 252, 0.58)',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  playlistOverlay: {
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingBottom: 116,
    paddingHorizontal: 22,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
  },
  playlistBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  playlistBackdropPressable: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  playlistPopover: {
    alignSelf: 'center',
    backgroundColor: 'rgba(24, 24, 27, 0.94)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    borderWidth: 1,
    maxHeight: 380,
    padding: 16,
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.14,
    shadowRadius: 36,
    width: '100%',
  },
  playlistPopoverHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  playlistHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  playlistPopoverEyebrow: {
    color: '#8a8178',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  playlistPopoverTitle: {
    color: '#f8fafc',
    fontSize: 19,
    fontWeight: '900',
  },
  playlistCloseButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  playlistSmallButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  playlistSmallButtonText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '900',
  },
  playlistPopoverList: {
    gap: 0,
  },
  playlistItem: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
    paddingVertical: 9,
  },
  playlistItemActive: {
    backgroundColor: 'rgba(173, 32, 37, 0.14)',
    borderRadius: 14,
    borderBottomWidth: 0,
    paddingHorizontal: 10,
  },
  playlistIndex: {
    color: '#9b9690',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    width: 24,
  },
  playlistIndexActive: {
    color: '#fecaca',
  },
  playlistText: {
    flex: 1,
    gap: 2,
  },
  localQueueControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  localQueueButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  localQueueButtonText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '900',
    includeFontPadding: false,
  },
  playlistTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  playlistTitleActive: {
    color: '#fecaca',
  },
  playlistMeta: {
    color: 'rgba(248, 250, 252, 0.54)',
    fontSize: 12,
  },
  playlistEmpty: {
    color: 'rgba(248, 250, 252, 0.58)',
    fontSize: 13,
    lineHeight: 19,
    paddingVertical: 10,
  },
  playlistMore: {
    color: '#8a8178',
    fontSize: 12,
    fontWeight: '700',
    paddingTop: 8,
    textAlign: 'center',
  },
  playerDivider: {
    backgroundColor: 'rgba(39, 39, 42, 0.08)',
    height: 1,
    marginTop: 4,
    width: '100%',
  },
  volumeTrack: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    height: 12,
    overflow: 'hidden',
  },
  compactVolumeTrack: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    height: 7,
  },
  volumeFill: {
    backgroundColor: '#ad2025',
    borderRadius: 999,
    height: '100%',
  },
  compactVolumeShell: {
    alignItems: 'flex-end',
    gap: 7,
    minWidth: 84,
    position: 'relative',
    zIndex: 12,
  },
  volumeMiniButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderColor: 'rgba(255, 255, 255, 0.13)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 10,
    position: 'relative',
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
  },
  volumeMiniButtonActive: {
    backgroundColor: 'rgba(173, 32, 37, 0.18)',
    borderColor: 'rgba(173, 32, 37, 0.38)',
  },
  volumeMiniValue: {
    color: '#f8fafc',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  volumeExpandedPanel: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderColor: 'rgba(255, 255, 255, 0.13)',
    borderRadius: 999,
    borderWidth: 1,
    bottom: 52,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: 'absolute',
    right: 0,
    width: 184,
    zIndex: 14,
  },
  volumeExpandedSlider: {
    flex: 1,
    minWidth: 110,
  },
  volumeExpandedValue: {
    color: '#f8fafc',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    minWidth: 34,
    textAlign: 'right',
  },
  eqOverlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 12,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 30,
  },
  eqBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.64)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  eqBackdropPressable: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  eqModal: {
    alignSelf: 'center',
    backgroundColor: 'rgba(18, 18, 22, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    maxWidth: 520,
    overflow: 'hidden',
    padding: 16,
    width: '100%',
  },
  eqModalBlur: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  eqModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  eqModalHeading: {
    flex: 1,
    gap: 2,
  },
  eqModalTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '900',
  },
  eqModalSubtitle: {
    color: 'rgba(248, 250, 252, 0.54)',
    fontSize: 12,
  },
  eqModalHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  eqCloseButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  eqPanelBadge: {
    borderColor: 'rgba(173, 32, 37, 0.36)',
    borderRadius: 999,
    borderWidth: 1,
    color: '#fecaca',
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  eqReadout: {
    alignItems: 'baseline',
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  eqReadoutFrequency: {
    color: 'rgba(248, 250, 252, 0.62)',
    fontSize: 13,
    fontWeight: '800',
  },
  eqReadoutGain: {
    color: '#f8fafc',
    fontSize: 22,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  eqChartRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  eqYAxis: {
    justifyContent: 'space-between',
    paddingVertical: 0,
    width: 38,
  },
  eqYAxisLabel: {
    color: 'rgba(248, 250, 252, 0.44)',
    fontSize: 9,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 10,
    textAlign: 'right',
  },
  eqPlotColumn: {
    flex: 1,
    position: 'relative',
  },
  eqGrid: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  eqGridLine: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    height: 1,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  eqBandsRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 2,
  },
  eqEditorBand: {
    alignItems: 'center',
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  eqBandTouch: {
    alignItems: 'center',
    maxWidth: 30,
    position: 'relative',
    width: '100%',
  },
  eqBandTrack: {
    backgroundColor: 'rgba(248, 250, 252, 0.22)',
    bottom: 0,
    left: '50%',
    marginLeft: -1,
    position: 'absolute',
    top: 0,
    width: 2,
  },
  eqBandActiveTrack: {
    backgroundColor: '#ad2025',
    borderRadius: 999,
    left: '50%',
    marginLeft: -1,
    position: 'absolute',
    width: 2,
  },
  eqBandKnob: {
    backgroundColor: '#ad2025',
    borderColor: '#f8fafc',
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    left: '50%',
    marginLeft: -6,
    position: 'absolute',
    width: 12,
  },
  eqFrequencyLabel: {
    color: 'rgba(248, 250, 252, 0.54)',
    fontSize: 9,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    textAlign: 'center',
  },
  eqPresetRow: {
    gap: 8,
    paddingRight: 2,
  },
  eqPresetButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    overflow: 'hidden',
    paddingHorizontal: 12,
    position: 'relative',
  },
  eqPresetButtonActive: {
    backgroundColor: 'rgba(173, 32, 37, 0.22)',
    borderColor: 'rgba(173, 32, 37, 0.42)',
  },
  eqPresetText: {
    color: 'rgba(248, 250, 252, 0.58)',
    fontSize: 12,
    fontWeight: '900',
  },
  eqPresetTextActive: {
    color: '#f8fafc',
  },
  eqHint: {
    color: '#fecaca',
    fontSize: 11,
    fontWeight: '800',
  },
  libraryList: {
    gap: 10,
  },
  libraryPage: {
    gap: 14,
  },
  settingsPage: {
    gap: 14,
  },
  settingsReveal: {
    paddingTop: 4,
  },
  settingsPanel: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  settingsSectionList: {
    gap: 10,
  },
  settingsSectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    overflow: 'hidden',
    padding: 12,
  },
  settingsSectionCardOpen: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderColor: 'rgba(173, 32, 37, 0.22)',
  },
  settingsSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
  },
  settingsSectionMeta: {
    alignItems: 'flex-end',
    gap: 7,
    maxWidth: 122,
  },
  settingsSectionSummary: {
    color: 'rgba(248, 250, 252, 0.52)',
    fontSize: 11,
    fontWeight: '800',
  },
  settingsChevron: {
    color: '#fecaca',
    fontSize: 22,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 24,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    overflow: 'hidden',
    position: 'relative',
  },
  segmentButtonActive: {
    backgroundColor: 'rgba(173, 32, 37, 0.22)',
    borderColor: 'rgba(173, 32, 37, 0.42)',
  },
  segmentButtonText: {
    color: 'rgba(248, 250, 252, 0.58)',
    fontSize: 13,
    fontWeight: '900',
  },
  segmentButtonTextActive: {
    color: '#f8fafc',
  },
  settingsList: {
    gap: 8,
  },
  nativeEqLauncher: {
    alignSelf: 'stretch',
    height: 68,
    overflow: 'hidden',
    width: '100%',
  },
  settingGroupBlock: {
    gap: 8,
  },
  settingGroupTitle: {
    color: 'rgba(248, 250, 252, 0.58)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  settingRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  settingRowDisabled: {
    opacity: 0.46,
  },
  settingText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  settingTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '900',
  },
  settingDescription: {
    color: 'rgba(248, 250, 252, 0.56)',
    fontSize: 12,
    lineHeight: 17,
  },
  switchTrack: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 52,
  },
  switchTrackActive: {
    backgroundColor: 'rgba(173, 32, 37, 0.86)',
  },
  switchThumb: {
    alignSelf: 'flex-start',
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    height: 24,
    width: 24,
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
    backgroundColor: '#08110b',
  },
  libraryHero: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 32,
    borderWidth: 1,
    gap: 7,
    padding: 18,
  },
  libraryHeroTitle: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  librarySearchRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 6,
    shadowColor: '#18181b',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
  },
  librarySearchInput: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    flex: 1,
    shadowOpacity: 0,
  },
  libraryRefreshButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 46,
    overflow: 'hidden',
    paddingHorizontal: 15,
    position: 'relative',
  },
  libraryRefreshText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  libraryFilterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  libraryFilterChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    overflow: 'hidden',
    position: 'relative',
  },
  libraryFilterChipActive: {
    backgroundColor: 'rgba(173, 32, 37, 0.22)',
    borderColor: 'rgba(173, 32, 37, 0.42)',
  },
  libraryFilterText: {
    color: 'rgba(248, 250, 252, 0.58)',
    fontSize: 12,
    fontWeight: '900',
  },
  libraryFilterTextActive: {
    color: '#f8fafc',
  },
  localViewRow: {
    gap: 8,
    paddingRight: 2,
  },
  localViewChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 62,
    overflow: 'hidden',
    paddingHorizontal: 13,
    position: 'relative',
  },
  localViewChipActive: {
    backgroundColor: 'rgba(173, 32, 37, 0.22)',
    borderColor: 'rgba(173, 32, 37, 0.42)',
  },
  trackRowShell: {
    gap: 7,
  },
  localGroupHeader: {
    color: 'rgba(248, 250, 252, 0.48)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
  },
  trackRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    minHeight: 72,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  libraryArtwork: {
    alignItems: 'center',
    backgroundColor: '#232329',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 46,
  },
  libraryArtworkImage: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },
  libraryArtworkFallback: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  trackBadge: {
    alignItems: 'center',
    backgroundColor: '#e5e5e5',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  trackBadgeText: {
    color: '#52525b',
    fontSize: 16,
    fontWeight: '900',
  },
  trackText: {
    flex: 1,
    gap: 3,
  },
  listTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
  },
  listMeta: {
    color: 'rgba(248, 250, 252, 0.58)',
    fontSize: 12,
  },
  libraryTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  libraryTag: {
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 999,
    borderWidth: 1,
    color: 'rgba(248, 250, 252, 0.68)',
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  localTrackActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    justifyContent: 'flex-end',
    maxWidth: 76,
  },
  localTrackActionButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    borderWidth: 1,
    height: 29,
    justifyContent: 'center',
    width: 29,
  },
  localTrackActionButtonActive: {
    backgroundColor: 'rgba(173, 32, 37, 0.22)',
    borderColor: 'rgba(173, 32, 37, 0.42)',
  },
  localTrackActionText: {
    color: 'rgba(248, 250, 252, 0.7)',
    fontSize: 12,
    fontWeight: '900',
    includeFontPadding: false,
  },
  localTrackActionTextActive: {
    color: '#fecaca',
  },
  dock: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.46)',
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 36,
    borderWidth: 1,
    bottom: 14,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    left: 16,
    overflow: 'hidden',
    padding: 8,
    position: 'absolute',
    right: 16,
    shadowColor: '#5f3b35',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
  },
  dockItem: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 26,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingVertical: 9,
    position: 'relative',
    zIndex: 1,
  },
  dockItemContent: {
    alignItems: 'center',
    gap: 3,
    justifyContent: 'center',
  },
  dockLabel: {
    color: 'rgba(45, 26, 23, 0.48)',
    fontSize: 10,
    fontWeight: '800',
  },
  dockLabelActive: {
    color: '#ad2025',
  },
});
