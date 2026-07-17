import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the app boots the native core and keeps playback mutations ordered', async () => {
  const [app, engine, store] = await Promise.all([
    readFile(new URL('../../App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoAudioDspModule.swift', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoNativeAppStore.swift', import.meta.url), 'utf8'),
  ]);
  const nativeEntry = app.slice(app.indexOf('function NativeEchoApp'), app.indexOf('export default function App'));
  const appEntry = app.slice(app.indexOf('export default function App'));
  const tick = store.slice(store.indexOf('private func tickPlayback()'), store.indexOf('private func updateEstimatedRemotePosition'));

  assert.match(nativeEntry, /<EchoNativeAppView/u);
  assert.doesNotMatch(nativeEntry, /migrationPayload === null/u);
  assert.match(appEntry, /<NativeEchoApp \/>/u);
  assert.doesNotMatch(appEntry, /<EchoLinkApp/u);
  assert.doesNotMatch(tick, /renderPages\(/u);
  assert.match(engine, /scheduleGeneration == generation/u);
  assert.match(engine, /playing && engine\.isRunning && player\.isPlaying/u);
  assert.match(store, /persistent\.playlists\[index\]\.tracks = queue/u);
  assert.match(store, /playbackLoadTask\?\.cancel\(\)/u);
  assert.match(store, /source == \.echo \|\| !powerampQueueManagedLocally/u);
  assert.match(store, /case "streamingQrResume": resumeNeteaseQrLogin\(\)/u);
});
