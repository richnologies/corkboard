export const IMAGE_LIMITS = {
  maxSourceBytes: 20 * 1024 * 1024,
  maxFullDimension: 1920,
  thumbDimension: 400,
  fullQuality: 0.85,
  thumbQuality: 0.75,
} as const;

export class ImagePrepareError extends Error {
  constructor(readonly code: 'IMAGE_TOO_LARGE' | 'IMAGE_INVALID' | 'IMAGE_PROCESS_FAILED') {
    super(code);
  }
}

export async function prepareImageFile(
  file: File,
): Promise<{ full: File; thumb: File }> {
  if (file.size > IMAGE_LIMITS.maxSourceBytes) {
    throw new ImagePrepareError('IMAGE_TOO_LARGE');
  }
  if (!file.type.startsWith('image/')) {
    throw new ImagePrepareError('IMAGE_INVALID');
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const full = await bitmapToJpegFile(
      bitmap,
      IMAGE_LIMITS.maxFullDimension,
      IMAGE_LIMITS.fullQuality,
      file.name,
    );
    const thumb = await bitmapToJpegFile(
      bitmap,
      IMAGE_LIMITS.thumbDimension,
      IMAGE_LIMITS.thumbQuality,
      file.name,
      true,
    );
    return { full, thumb };
  } catch {
    throw new ImagePrepareError('IMAGE_PROCESS_FAILED');
  } finally {
    bitmap.close();
  }
}

async function bitmapToJpegFile(
  source: ImageBitmap,
  maxDimension: number,
  quality: number,
  originalName: string,
  isThumb = false,
): Promise<File> {
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new ImagePrepareError('IMAGE_PROCESS_FAILED');
  }
  ctx.drawImage(source, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new ImagePrepareError('IMAGE_PROCESS_FAILED')),
      'image/jpeg',
      quality,
    );
  });

  const base = originalName.replace(/\.[^.]+$/, '') || 'photo';
  const suffix = isThumb ? '-thumb' : '';
  return new File([blob], `${base}${suffix}.jpg`, { type: 'image/jpeg' });
}
