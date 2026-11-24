// A 70% cap height matches the bundled Bebas Neue used by custom scoreboards.
// Only enlarge small capitals. Wider names still go through the usual text fitting.
export function importedFontSizeAdjust(bytes: ArrayBuffer): string | undefined {
  if (bytes.byteLength < 12) return undefined;
  const font = new DataView(bytes);
  const tablesEnd = 12 + font.getUint16(4) * 16;
  if (tablesEnd > bytes.byteLength) return undefined;
  let unitsPerEm = 0;
  let capHeight = 0;
  for (let record = 12; record < tablesEnd; record += 16) {
    const tag = font.getUint32(record);
    const offset = font.getUint32(record + 8);
    const length = font.getUint32(record + 12);
    if (offset < tablesEnd || offset + length > bytes.byteLength) continue;
    if (tag === 0x68656164 && length >= 20) unitsPerEm = font.getUint16(offset + 18); // head
    if (tag === 0x4f532f32 && length >= 90 && font.getUint16(offset) >= 2) { // OS/2
      capHeight = font.getInt16(offset + 88);
    }
  }
  if (unitsPerEm === 0 || capHeight <= 0) return undefined;
  const percentage = Math.min(200, Math.round(70 * unitsPerEm / capHeight));
  return percentage > 100 ? `${percentage}%` : undefined;
}
