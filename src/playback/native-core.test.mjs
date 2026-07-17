import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the app boots the native core and keeps playback mutations ordered', async () => {
  const [app, engine, store, payload, coreTypes, metadata, pages, player, remoteClients] = await Promise.all([
    readFile(new URL('../../App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoAudioDspModule.swift', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoNativeAppStore.swift', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoNativeAppStorePayload.swift', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoNativeCoreTypes.swift', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoNativeMetadataService.swift', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoNativePagesView.swift', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoNativePlayerView.swift', import.meta.url), 'utf8'),
    readFile(new URL('../../modules/echo-audio-dsp/ios/EchoNativeRemoteClients.swift', import.meta.url), 'utf8'),
  ]);
  const nativeEntry = app.slice(app.indexOf('function NativeEchoApp'), app.indexOf('export default function App'));
  const appEntry = app.slice(app.indexOf('export default function App'));
  const tick = store.slice(store.indexOf('private func tickPlayback()'), store.indexOf('private func updateEstimatedRemotePosition'));
  const themedTabStart = player.indexOf('private func themedTab');
  const titleStart = player.indexOf('private func title');
  const lyricsScrollerStart = player.indexOf('private func lyricsScroller');
  const lyricAccessibilityStart = player.indexOf('private func lyricAccessibilityLabel');

  assert.ok(themedTabStart >= 0 && titleStart > themedTabStart);
  assert.ok(lyricsScrollerStart >= 0 && lyricAccessibilityStart > lyricsScrollerStart);
  const themedTab = player.slice(themedTabStart, titleStart);
  const lyricsScroller = player.slice(lyricsScrollerStart, lyricAccessibilityStart);

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
  assert.match(store, /if currentTrack == nil \{[\s\S]*playerModel\.positionMs = 0/u);
  assert.match(store, /case "streamingQrResume": resumeNeteaseQrLogin\(\)/u);
  assert.match(coreTypes, /case \.normal: return \.repeatAll[\s\S]*case \.shuffle: return \.normal/u);
  assert.match(store, /case \.normal:\s+playAdjacent\(1, wraps: false\)/u);
  assert.match(store, /case \.repeatOne:[\s\S]*if automatic[\s\S]*case \.shuffle:/u);
  assert.match(store, /queue\.filter \{ trackKey\(\$0\) != currentKey \}/u);
  assert.match(store, /playerModel\.album = track\.album/u);
  assert.match(store, /let globalSearch = playerModel\.activePage == "search"/u);
  assert.match(store, /libraryQuery = ""[\s\S]*selectedStreamingPlaylistId = id/u);
  assert.match(store, /persistent\.recentTracks\.insert\(track, at: 0\)/u);
  assert.match(store, /persistent\.streamingQueueTracks = queue\.filter \{ \$0\.source == \.streaming \}/u);
  assert.match(store, /streamingSnapshots\[key\] \?\? track\(forKey: key\)/u);
  assert.match(store, /if mode != \.streaming \{ addRecent\(track\) \}/u);
  assert.match(store, /streamingSearchStatus = errorMessage\(error\)/u);
  assert.match(payload, /option\("history", localized\("History", "历史"\)\)/u);
  assert.match(coreTypes, /recentTracks = try values\.decodeIfPresent\(\[EchoNativeCoreTrack\]\.self, forKey: \.recentTracks\) \?\? \[\]/u);
  assert.match(coreTypes, /streamingQueueTracks = try values\.decodeIfPresent\(\[EchoNativeCoreTrack\]\.self, forKey: \.streamingQueueTracks\) \?\? \[\]/u);
  assert.match(metadata, /guard !text\.isEmpty else \{ continue \}/u);
  assert.match(player, /case \.normal: return "arrow\.right\.to\.line"/u);
  assert.match(player, /Text\(albumLabel\)/u);
  assert.match(player, /No song is playing/u);
  assert.match(player, /hostingController\.overrideUserInterfaceStyle = style/u);
  assert.match(player, /@Published var lyricLines:/u);
  assert.match(player, /ForEach\(Array\(model\.lyricLines\.enumerated\(\)\), id: \\.offset\)/u);
  assert.doesNotMatch(player, /@Published var lyricTexts:/u);
  assert.doesNotMatch(player, /model\.repeatOne/u);
  assert.equal((player.match(/themedTab\(playerBackground: true\)/gu) ?? []).length, 2);
  assert.match(themedTab, /EchoNativeArtworkBackdrop\(/u);
  assert.match(themedTab, /echoWarmBackground\.ignoresSafeArea\(\)/u);
  assert.doesNotMatch(lyricsScroller, /scrollClipDisabled/u);
  assert.match(lyricsScroller, /let timeMs = line\.milliseconds/u);
  assert.match(lyricsScroller, /if timeMs >= 0 \{/u);
  assert.doesNotMatch(lyricsScroller, /timeMs >= 0 && !active/u);
  assert.match(pages, /pendingLibraryPageScroll = true/u);
  assert.match(pages, /DispatchQueue\.main\.async \{ scrollToLibraryIndex\(target, proxy: proxy\) \}/u);
  assert.equal((pages.match(/scrollToLibraryAnchor\(pageFirstRowId, proxy: proxy\)/gu) ?? []).length, 2);
  assert.equal((pages.match(/\.firstIndex\(of:/gu) ?? []).length, 6);
  assert.match(pages, /\.offset\(x: 11\)/u);
  assert.match(pages, /libraryTrackMenu\(track, labels: labels\)/u);
  assert.match(remoteClients, /secureMediaUrl\(value\.avatarUrl\)/u);
  assert.match(remoteClients, /host == "music\.126\.net" \|\| host\.hasSuffix\("\.music\.126\.net"\)/u);
  assert.match(remoteClients, /return tracks\.isEmpty \? inlineTracks : tracks/u);
});
