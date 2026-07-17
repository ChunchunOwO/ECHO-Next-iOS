export const adjacentQueueItem = <T>(
  items: T[],
  currentId: string | null | undefined,
  idForItem: (item: T) => string,
  direction: -1 | 1,
): T | undefined => {
  const currentIndex = items.findIndex((item) => idForItem(item) === currentId);
  return currentIndex >= 0
    ? items[currentIndex + direction]
    : direction > 0 ? items[0] : items[items.length - 1];
};
