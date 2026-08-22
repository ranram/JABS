const backgroundImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const maximumBackgroundBytes = 15 * 1024 * 1024;

export async function readTopEightBackground(file: File): Promise<string> {
  if (!backgroundImageTypes.has(file.type) || file.size > maximumBackgroundBytes) {
    throw new Error('Choose a PNG, JPEG, or WebP background no larger than 15 MB.');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('JABS could not read this background image.'));
    reader.onerror = () => reject(new Error('JABS could not read this background image.'));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight
    || image.naturalWidth > 8192 || image.naturalHeight > 8192
    || image.naturalWidth * image.naturalHeight > 40_000_000) {
    throw new Error('Choose a valid background no larger than 8192×8192 or 40 megapixels.');
  }
  return dataUrl;
}
