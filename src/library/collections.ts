import type { EchoLinkTrackPreview } from '../echoLink/types';

export type LibraryCollectionPreview = {
  artworkUrl: string | null;
  id: string;
  query: string;
  subtitle: string;
  title: string;
  trackIds: string[];
};

export const normalizeExternalLookupValue = (value: string | null | undefined): string => (
  (value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase()
);

export const albumCollectionKey = (title: string, albumArtist: string): string => (
  `${normalizeExternalLookupValue(title)}::${normalizeExternalLookupValue(albumArtist)}`
);

export const albumCollectionKeyForTrack = (
  track: EchoLinkTrackPreview,
  fallbackTitle: string,
): string => albumCollectionKey(
  track.album?.trim() || fallbackTitle,
  track.albumArtist?.trim() || '',
);

export const dedupeTracks = <T extends EchoLinkTrackPreview>(items: T[]): T[] => {
  const tracksByMetadata = new Map<string, T>();
  items.forEach((track) => {
    const normalizedTitle = normalizeExternalLookupValue(track.title);
    const key = normalizedTitle ? [
      normalizedTitle,
      normalizeExternalLookupValue(track.artist),
      normalizeExternalLookupValue(track.album),
      Math.round((track.durationMs || 0) / 1000),
      track.discNo ?? 0,
      track.trackNo ?? 0,
    ].join('::') : `id:${track.id}`;
    const current = tracksByMetadata.get(key);
    if (!current || (!current.canPlayOnPhone && track.canPlayOnPhone) || (!current.artworkUrl && track.artworkUrl)) {
      tracksByMetadata.set(key, track);
    }
  });
  return Array.from(tracksByMetadata.values());
};

export const buildTrackCollections = <T extends EchoLinkTrackPreview>(
  tracks: T[],
  titleForTrack: (track: T) => string | string[],
  idForTitle: (title: string, key: string) => string,
  subtitleForCount: (count: number, items: T[]) => string,
  artworkForTitle?: (title: string, key: string) => string | null,
  keyForTrack?: (track: T, title: string) => string,
): LibraryCollectionPreview[] => {
  const groups = new Map<string, { items: T[]; title: string }>();
  tracks.forEach((track) => {
    const titles = titleForTrack(track);
    (Array.isArray(titles) ? titles : [titles]).forEach((title) => {
      const key = keyForTrack?.(track, title) ?? normalizeExternalLookupValue(title);
      const group = groups.get(key);
      if (group) group.items.push(track);
      else groups.set(key, { items: [track], title });
    });
  });
  return Array.from(groups.entries()).sort(([, a], [, b]) => a.title.localeCompare(b.title)).map(([key, group]) => ({
    artworkUrl: artworkForTitle?.(group.title, key) ?? group.items.find((item) => item.artworkUrl)?.artworkUrl ?? null,
    id: idForTitle(group.title, key),
    query: group.title,
    subtitle: subtitleForCount(group.items.length, group.items),
    title: group.title,
    trackIds: [...new Set(group.items.map((item) => item.id))],
  }));
};
