import assert from 'node:assert/strict';
import test from 'node:test';
import { adjacentQueueItem } from './queue.ts';

test('a populated queue advances even when the current track is missing', () => {
  const items = [{ id: 'first' }, { id: 'second' }];
  assert.equal(adjacentQueueItem(items, 'missing', (item) => item.id, 1)?.id, 'first');
  assert.equal(adjacentQueueItem(items, 'first', (item) => item.id, 1)?.id, 'second');
});
