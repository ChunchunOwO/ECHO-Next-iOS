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
  index?: number;
  mode?: 'local' | 'pc' | 'phone';
  page?: 'connect' | 'control' | 'library' | 'settings';
  preset?: string;
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
  artist: string;
  artworkUrl: string;
  connectionLabel: string;
  connectionOnline: boolean;
  controlsEnabled: boolean;
  durationMs: number;
  isPlaying: boolean;
  modeLabel: string;
  outputMode: 'local' | 'pc' | 'phone';
  positionMs: number;
  queueCount: number;
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

export type EchoNativeDockViewProps = {
  activePage: 'connect' | 'control' | 'library' | 'settings';
  language: 'en' | 'zh';
  onAction?: (event: NativeSyntheticEvent<EchoNativeAction>) => void;
  style?: StyleProp<ViewStyle>;
};

const NativePlayer = Platform.OS === 'ios'
  ? requireNativeViewManager<EchoNativePlayerViewProps>('EchoAudioDsp', 'EchoNativePlayerView')
  : null;
const NativeEqLauncher = Platform.OS === 'ios'
  ? requireNativeViewManager<EchoNativeEqLauncherViewProps>('EchoAudioDsp', 'EchoNativeEqLauncherView')
  : null;
const NativeDock = Platform.OS === 'ios'
  ? requireNativeViewManager<EchoNativeDockViewProps>('EchoAudioDsp', 'EchoNativeDockView')
  : null;

export const EchoNativePlayerView = (props: EchoNativePlayerViewProps): ReactElement => (
  NativePlayer ? <NativePlayer {...props} /> : <View style={props.style} />
);

export const EchoNativeEqLauncherView = (props: EchoNativeEqLauncherViewProps): ReactElement => (
  NativeEqLauncher ? <NativeEqLauncher {...props} /> : <View style={props.style} />
);

export const EchoNativeDockView = (props: EchoNativeDockViewProps): ReactElement => (
  NativeDock ? <NativeDock {...props} /> : <View style={props.style} />
);
