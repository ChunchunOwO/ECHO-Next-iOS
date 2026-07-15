import { requireNativeViewManager } from 'expo-modules-core';
import React, { type ReactElement } from 'react';
import {
  Platform,
  type NativeSyntheticEvent,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

export type EchoNativeAction = {
  action: string;
  commit?: boolean;
  enabled?: boolean;
  field?: string;
  id?: string;
  index?: number;
  key?: string;
  mode?: 'local' | 'pc' | 'phone' | 'streaming';
  page?: 'connect' | 'control' | 'library' | 'search' | 'settings';
  playlistId?: string;
  preset?: string;
  selection?: string;
  selections?: Record<string, string>;
  source?: 'echo' | 'local' | 'streaming';
  text?: string;
  trackId?: string;
  url?: string;
  value?: number;
};

type SharedEqProps = {
  eqGains: number[];
  eqPreset: string;
  language: 'en' | 'zh';
  onAction?: (event: NativeSyntheticEvent<EchoNativeAction>) => void;
  style?: StyleProp<ViewStyle>;
};

export type EchoNativePlayerViewProps = SharedEqProps & {
  activeLyricIndex: number;
  activePage: 'connect' | 'control' | 'library' | 'search' | 'settings';
  artist: string;
  artworkUrl: string;
  connectionLabel: string;
  connectionOnline: boolean;
  controlsEnabled: boolean;
  durationMs: number;
  externalSourcePickerPayload: string;
  isPlaying: boolean;
  lyricTexts: string[];
  lyricTimesMs: number[];
  lyricsVisible: boolean;
  metadataLoading: boolean;
  modeLabel: string;
  outputMode: 'local' | 'pc' | 'phone' | 'streaming';
  pagePayload: string;
  positionMs: number;
  queueCount: number;
  queuePayload: string;
  repeatOne: boolean;
  showArtworkGlow: boolean;
  tags: string[];
  title: string;
  volume: number;
};

export type EchoNativeEqLauncherViewProps = SharedEqProps & {
  description: string;
  label: string;
  title: string;
};

const NativePlayer = Platform.OS === 'ios'
  ? requireNativeViewManager<EchoNativePlayerViewProps>('EchoAudioDsp', 'EchoNativePlayerView')
  : null;
const NativeEqLauncher = Platform.OS === 'ios'
  ? requireNativeViewManager<EchoNativeEqLauncherViewProps>('EchoAudioDsp', 'EchoNativeEqLauncherView')
  : null;

export const EchoNativePlayerView = (props: EchoNativePlayerViewProps): ReactElement => (
  NativePlayer ? <NativePlayer {...props} /> : <View style={props.style} />
);

export const EchoNativeEqLauncherView = (props: EchoNativeEqLauncherViewProps): ReactElement => (
  NativeEqLauncher ? <NativeEqLauncher {...props} /> : <View style={props.style} />
);
