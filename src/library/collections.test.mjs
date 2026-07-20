import assert from 'node:assert/strict';
import test from 'node:test';
import {
  albumCollectionKeyForTrack,
  buildAlbumCollections,
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

test('album groups ignore album artist and duplicate tracks prefer the playable item', () => {
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
  assert.equal(collections.length, 1);
  assert.deepEqual(collections[0].trackIds, ['a', 'b']);

  const playable = track({ artworkUrl: 'cover.jpg', canPlayOnPhone: true, id: 'playable' });
  assert.deepEqual(dedupeTracks([track({ id: 'stale' }), playable]), [playable]);
});

test('compilations with many track artists stay in one album', () => {
  const items = Array.from({ length: 12 }, (_, index) => track({
    album: index % 2 ? ' same   album ' : 'Same Album',
    albumArtist: `Publisher ${index}`,
    artist: `Artist ${index}`,
    id: String.fromCharCode(97 + index),
  }));
  const collections = buildTrackCollections(
    items,
    (item) => item.album,
    (_title, key) => key,
    (count) => String(count),
    undefined,
    (item) => albumCollectionKeyForTrack(item, 'Uncategorized'),
  );
  assert.equal(collections.length, 1);
  assert.equal(collections[0].trackIds.length, items.length);
});

test('album keys ignore album artist entirely', () => {
  assert.equal(
    albumCollectionKeyForTrack(track({ albumArtist: 'Artist A' }), 'Uncategorized'),
    albumCollectionKeyForTrack(track({ albumArtist: 'Artist B' }), 'Uncategorized'),
  );
});

test('fuzzy album titles merge only when their track artist sets are at least 90% similar', () => {
  const collection = (items) => buildAlbumCollections(
    items,
    'Uncategorized',
    (_title, key) => key,
    (count) => String(count),
  );
  const matching = collection([
    track({ album: 'The Album Deluxe', artist: 'Artist A', id: 'a' }),
    track({ album: 'The Album Deluxe', artist: 'Artist B', id: 'b' }),
    track({ album: 'The Album Delux', artist: 'Artist A', id: 'c' }),
    track({ album: 'The Album Delux', artist: 'Artist B', id: 'd' }),
  ]);
  assert.equal(matching.length, 1);
  assert.deepEqual(matching[0].trackIds, ['a', 'b', 'c', 'd']);

  const ninetyPercent = collection([
    ...Array.from({ length: 10 }, (_, index) => track({
      album: 'The Album Deluxe',
      artist: `Artist ${index}`,
      id: `left-${index}`,
    })),
    ...Array.from({ length: 9 }, (_, index) => track({
      album: 'The Album Delux',
      artist: `Artist ${index}`,
      id: `right-${index}`,
    })),
  ]);
  assert.equal(ninetyPercent.length, 1);

  const differentArtists = collection([
    track({ album: 'The Album Deluxe', artist: 'Artist A', id: 'a' }),
    track({ album: 'The Album Deluxe', artist: 'Artist B', id: 'b' }),
    track({ album: 'The Album Delux', artist: 'Artist C', id: 'c' }),
    track({ album: 'The Album Delux', artist: 'Artist D', id: 'd' }),
  ]);
  assert.equal(differentArtists.length, 2);
});
