import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the app boots the native core and keeps playback mutations ordered', async () => {
  const [app, engine, store, coreTypes, pages, player] = await Promise.all([
    readFile(new URL('../../App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoAudioDspModule.swift', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoNativeAppStore.swift', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoNativeCoreTypes.swift', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoNativePagesView.swift', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoNativePlayerView.swift', import.meta.url), 'utf8'),
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
  assert.match(coreTypes, /case \.normal: return \.repeatAll[\s\S]*case \.shuffle: return \.normal/u);
  assert.match(store, /case \.normal:\s+playAdjacent\(1, wraps: false\)/u);
  assert.match(store, /case \.repeatOne:[\s\S]*if automatic[\s\S]*case \.shuffle:/u);
  assert.match(store, /queue\.filter \{ trackKey\(\$0\) != currentKey \}/u);
  assert.match(store, /playerModel\.album = track\.album\.isEmpty/u);
  assert.match(player, /case \.normal: return "arrow\.right\.to\.line"/u);
  assert.match(player, /Text\(model\.album\)/u);
  assert.doesNotMatch(player, /model\.repeatOne/u);
  assert.match(pages, /pendingLibraryPageScroll = true/u);
  assert.match(pages, /DispatchQueue\.main\.async \{ scrollToLibraryIndex\(target, proxy: proxy\) \}/u);
  assert.match(pages, /DispatchQueue\.main\.async \{ scrollToLibraryAnchor\(pageFirstRowId, proxy: proxy\) \}/u);
  assert.match(pages, /DispatchQueue\.main\.async \{ scrollToLibraryAnchor\(firstRowId, proxy: proxy\) \}/u);
});
