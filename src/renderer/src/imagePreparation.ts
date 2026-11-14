const concurrentImages = 2;
let active = 0;
const waiting: Array<() => void> = [];

/** Avoid decoding and encoding an entire scene's large images simultaneously. */
export async function prepareImage<T>(work: () => Promise<T>): Promise<T> {
  if (active >= concurrentImages) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
