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

export const albumCollectionKey = (title: string, _albumArtist = ''): string => (
  normalizeExternalLookupValue(title)
);

export const albumCollectionKeyForTrack = (
  track: EchoLinkTrackPreview,
  fallbackTitle: string,
): string => albumCollectionKey(
  track.album?.trim() || fallbackTitle,
);

const albumComparisonValue = (value: string): string => (
  normalizeExternalLookupValue(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
);

const textSimilarity = (leftValue: string, rightValue: string): number => {
  const left = Array.from(albumComparisonValue(leftValue));
  const right = Array.from(albumComparisonValue(rightValue));
  if (left.join('') === right.join('')) return 1;
  if (left.length === 0 || right.length === 0) return 0;
  const longest = Math.max(left.length, right.length);
  if (Math.abs(left.length - right.length) / longest > 0.1) return 0;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  left.forEach((leftCharacter, leftIndex) => {
    const current = [leftIndex + 1, ...Array<number>(right.length).fill(0)];
    right.forEach((rightCharacter, rightIndex) => {
      current[rightIndex + 1] = Math.min(
        current[rightIndex]! + 1,
        previous[rightIndex + 1]! + 1,
        previous[rightIndex]! + (leftCharacter === rightCharacter ? 0 : 1),
      );
    });
    previous = current;
  });
  return 1 - previous[right.length]! / longest;
};

const trackArtistValues = (tracks: EchoLinkTrackPreview[]): string[] => [...new Set(tracks
  .flatMap((track) => track.artist.split(
    /\s*(?:,|;|\uFF0C|\uFF1B|\u3001|\/|\uFF0F|&|\uFF06|\+|\||\uFF5C)\s*|\s+(?:feat\.?|ft\.?|featuring|x|\u00D7)\s+/iu,
  ))
  .map(albumComparisonValue)
  .filter(Boolean))].sort();

const artistSetSimilarity = (left: string[], right: string[]): number => {
  if (left.length === 0 || right.length === 0) return 0;
  const rightMatches = Array<number>(right.length).fill(-1);
  const assign = (leftIndex: number, seen: Set<number>): boolean => {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      if (seen.has(rightIndex) || textSimilarity(left[leftIndex]!, right[rightIndex]!) < 0.9) continue;
      seen.add(rightIndex);
      const previousMatch = rightMatches[rightIndex]!;
      if (previousMatch < 0 || assign(previousMatch, seen)) {
        rightMatches[rightIndex] = leftIndex;
        return true;
      }
    }
    return false;
  };
  const matches = left.reduce((count, _artist, index) => count + Number(assign(index, new Set())), 0);
  return matches / Math.max(left.length, right.length);
};

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

export const buildAlbumCollections = <T extends EchoLinkTrackPreview>(
  tracks: T[],
  fallbackTitle: string,
  idForTitle: (title: string, key: string) => string,
  subtitleForCount: (count: number, items: T[]) => string,
  artworkForTitle?: (title: string, key: string) => string | null,
): LibraryCollectionPreview[] => {
  const exactGroups = new Map<string, { items: T[]; title: string }>();
  tracks.forEach((track) => {
    const title = track.album?.trim() || fallbackTitle;
    const key = albumCollectionKey(title);
    const group = exactGroups.get(key);
    if (group) group.items.push(track);
    else exactGroups.set(key, { items: [track], title });
  });

  const groups = [...exactGroups.entries()]
    .map(([key, group]) => [key, { ...group, artists: trackArtistValues(group.items) }] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const parents = groups.map((_group, index) => index);
  const root = (index: number): number => {
    while (parents[index] !== index) index = parents[index]!;
    return index;
  };
  for (let left = 0; left < groups.length; left += 1) {
    for (let right = left + 1; right < groups.length; right += 1) {
      const leftGroup = groups[left]![1];
      const rightGroup = groups[right]![1];
      if (textSimilarity(leftGroup.title, rightGroup.title) < 0.9) continue;
      if (artistSetSimilarity(leftGroup.artists, rightGroup.artists) < 0.9) continue;
      const leftRoot = root(left);
      const rightRoot = root(right);
      parents[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
    }
  }

  const canonicalByKey = new Map(groups.map(([key], index) => {
    const [canonicalKey, canonicalGroup] = groups[root(index)]!;
    return [key, { key: canonicalKey, title: canonicalGroup.title }] as const;
  }));
  return buildTrackCollections(
    tracks,
    (track) => canonicalByKey.get(albumCollectionKeyForTrack(track, fallbackTitle))!.title,
    idForTitle,
    subtitleForCount,
    artworkForTitle,
    (track) => canonicalByKey.get(albumCollectionKeyForTrack(track, fallbackTitle))!.key,
  );
};
