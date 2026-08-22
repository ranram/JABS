export type ResponseDecoder<T> = {
  parse(value: unknown): T;
};

export function decodeResponse<T>(
  value: unknown,
  decoder: ResponseDecoder<T> | undefined,
  source: string
): T {
  if (!decoder) return value as T;
  try {
    return decoder.parse(value);
  } catch {
    throw new Error(`The local service returned an invalid response for ${source}.`);
  }
}
