import { Platform } from 'react-native';
import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

export {
  EchoNativeEqLauncherView,
  EchoNativePlayerView,
  type EchoNativeAction,
} from './views';

export type EchoAudioDspStatus = {
  currentTime: number;
  didJustFinish: boolean;
  duration: number;
  playing: boolean;
  volume: number;
};

export type EchoAudioDspRemoteCommand = {
  action: 'next' | 'pause' | 'play' | 'previous' | 'seek' | 'toggle';
  positionSeconds?: number;
};

export type EchoAudioDspNowPlaying = {
  album: string;
  artist: string;
  artworkUrl: string;
  durationSeconds: number;
  isPlaying: boolean;
  positionSeconds: number;
  title: string;
};

type EchoAudioDspNativeModule = {
  addListener(
    eventName: 'onRemoteCommand',
    listener: (command: EchoAudioDspRemoteCommand) => void,
  ): EventSubscription;
  clearNowPlaying(): Promise<void>;
  getStatus(): Promise<EchoAudioDspStatus>;
  pause(): Promise<void>;
  playFile(uri: string, positionMs: number, volume: number, gains: number[], loudnessEnabled: boolean): Promise<void>;
  resume(): Promise<void>;
  seekTo(seconds: number): Promise<void>;
  setEq(gains: number[]): Promise<void>;
  setLoudness(enabled: boolean): Promise<void>;
  setVolume(volume: number): Promise<void>;
  stop(): Promise<void>;
  updateNowPlaying(
    title: string,
    artist: string,
    album: string,
    artworkUrl: string,
    durationSeconds: number,
    positionSeconds: number,
    isPlaying: boolean,
  ): Promise<void>;
};

const loadNativeModule = (): EchoAudioDspNativeModule | null => {
  if (Platform.OS !== 'ios') {
    return null;
  }
  try {
    return requireNativeModule<EchoAudioDspNativeModule>('EchoAudioDsp');
  } catch {
    return null;
  }
};

const nativeModule = loadNativeModule();
const unavailable = async (): Promise<never> => {
  throw new Error('EchoAudioDsp native module is not available.');
};

export const echoAudioDsp = {
  addRemoteCommandListener: (listener: (command: EchoAudioDspRemoteCommand) => void): EventSubscription | null => (
    nativeModule?.addListener('onRemoteCommand', listener) ?? null
  ),
  clearNowPlaying: () => nativeModule?.clearNowPlaying() ?? unavailable(),
  isAvailable: Boolean(nativeModule),
  getStatus: () => nativeModule?.getStatus() ?? unavailable(),
  pause: () => nativeModule?.pause() ?? unavailable(),
  playFile: (uri: string, options: {
    gains: number[];
    loudnessEnabled: boolean;
    positionMs?: number;
    volume: number;
  }) => nativeModule?.playFile(
    uri,
    options.positionMs ?? 0,
    options.volume,
    options.gains,
    options.loudnessEnabled,
  ) ?? unavailable(),
  resume: () => nativeModule?.resume() ?? unavailable(),
  seekTo: (seconds: number) => nativeModule?.seekTo(seconds) ?? unavailable(),
  setEq: (gains: number[]) => nativeModule?.setEq(gains) ?? unavailable(),
  setLoudness: (enabled: boolean) => nativeModule?.setLoudness(enabled) ?? unavailable(),
  setVolume: (volume: number) => nativeModule?.setVolume(volume) ?? unavailable(),
  stop: () => nativeModule?.stop() ?? unavailable(),
  updateNowPlaying: (metadata: EchoAudioDspNowPlaying) => nativeModule?.updateNowPlaying(
    metadata.title,
    metadata.artist,
    metadata.album,
    metadata.artworkUrl,
    metadata.durationSeconds,
    metadata.positionSeconds,
    metadata.isPlaying,
  ) ?? unavailable(),
};
