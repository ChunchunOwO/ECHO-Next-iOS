import assert from 'node:assert/strict';
import test from 'node:test';
import {
  albumCollectionKeyForTrack,
  buildTrackCollections,
  dedupeTracks,
} from './collections.ts';

const track = (overrides) => ({
  album: 'Same Album',
  albumArtist: 'Artist A',
  artist: 'Artist A',
  artworkUrl: null,
  canPlayOnPhone: false,
  durationMs: 180_000,
  id: 'a',
  sourceLabel: 'Local',
  title: 'Song',
  ...overrides,
});

test('album groups use album artist and duplicate tracks prefer the playable item', () => {
  const items = [
    track({ id: 'a' }),
    track({ albumArtist: 'Artist B', artist: 'Artist B', id: 'b' }),
  ];
  const collections = buildTrackCollections(
    items,
    (item) => item.album,
    (_title, key) => key,
    (count) => String(count),
    undefined,
    (item) => albumCollectionKeyForTrack(item, 'Uncategorized'),
  );
  assert.equal(collections.length, 2);

  const playable = track({ artworkUrl: 'cover.jpg', canPlayOnPhone: true, id: 'playable' });
  assert.deepEqual(dedupeTracks([track({ id: 'stale' }), playable]), [playable]);
});
