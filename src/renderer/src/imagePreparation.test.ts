import { expect, it, vi } from 'vitest';
import { prepareImage } from './imagePreparation';

it('limits simultaneous preparations and keeps going after a failed image', async () => {
  let complete!: () => void;
  let fail!: (error: Error) => void;
  const first = prepareImage(() => new Promise<void>((resolve) => { complete = resolve; }));
  const second = prepareImage(() => new Promise<void>((_, reject) => { fail = reject; }));
  const next = vi.fn(async () => 'next image');
  const third = prepareImage(next);
  expect(next).not.toHaveBeenCalled();
  const rejected = expect(second).rejects.toThrow('Invalid image');
  fail(new Error('Invalid image'));
  await rejected;
  await expect(third).resolves.toBe('next image');
  complete();
  await first;
});
