import sharp from 'sharp';

/** Longest edge for place-list cover thumbnails (≈44px UI @3x). */
export const PLACE_COVER_THUMB_SIZE = 240;

export async function createJpegThumb(
  input: Buffer,
  maxDimension = PLACE_COVER_THUMB_SIZE,
): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
}
