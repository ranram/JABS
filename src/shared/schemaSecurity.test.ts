import { expect, it } from 'vitest';
import { libraryPlayerSchema } from './playerLibrary';
import { matchQueueSchema } from './matchQueue';

it('rejects oversized queue snapshots before collecting per-entry errors', () => {
  // The native queue is capped at 100; reject a malformed oversized snapshot
  // before collecting an error for each entry in the renderer.
  const queue = matchQueueSchema.shape.entries.safeParse(Array.from({ length: 101 }, () => null));
  expect(queue.success).toBe(false);
  if (!queue.success) expect(queue.error.issues).toHaveLength(1);
});

it('keeps saved player text limits measured in UTF-16 units after the validator upgrade', () => {
  const schema = libraryPlayerSchema.shape.imported.shape.name;
  expect(schema.safeParse('😀'.repeat(100)).success).toBe(true);
  expect(schema.safeParse('😀'.repeat(101)).success).toBe(false);
});
