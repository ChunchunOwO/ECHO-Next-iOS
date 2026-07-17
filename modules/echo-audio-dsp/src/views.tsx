import { requireNativeViewManager } from 'expo-modules-core';
import React, { type ReactElement } from 'react';
import { Platform, type StyleProp, View, type ViewStyle } from 'react-native';

export type EchoNativeAppViewProps = {
  migrationPayload?: string;
  style?: StyleProp<ViewStyle>;
};

const NativeApp = Platform.OS === 'ios'
  ? requireNativeViewManager<EchoNativeAppViewProps>('EchoAudioDsp', 'EchoNativeAppView')
  : null;

export const EchoNativeAppView = (props: EchoNativeAppViewProps): ReactElement => (
  NativeApp ? <NativeApp {...props} /> : <View style={props.style} />
);
