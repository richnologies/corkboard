const HEIC_EXTENSIONS = /\.(heic|heif)$/i;
const HEIC_MIME = /^image\/hei[cf]/i;

export const IMAGE_ACCEPT =
  'image/*,.heic,.heif,image/heic,image/heif';

export const IMAGE_LIMITS = {
  maxSourceBytes: 20 * 1024 * 1024,
  maxFullDimension: 1920,
  thumbDimension: 400,
  fullQuality: 0.85,
  thumbQuality: 0.75,
} as const;

const BITMAP_OPTIONS: ImageBitmapOptions = { imageOrientation: 'from-image' };

export class ImagePrepareError extends Error {
  constructor(readonly code: 'IMAGE_TOO_LARGE' | 'IMAGE_INVALID' | 'IMAGE_PROCESS_FAILED') {
    super(code);
  }
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return HEIC_EXTENSIONS.test(file.name);
}

function isHeicFile(file: File): boolean {
  if (HEIC_MIME.test(file.type)) return true;
  return HEIC_EXTENSIONS.test(file.name);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = url;
  });
}

async function decodeViaImageElement(file: File): Promise<ImageBitmap> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return await createImageBitmap(img, BITMAP_OPTIONS);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeHeicViaLibheif(file: File): Promise<ImageBitmap> {
  const { heicTo } = await import('heic-to');
  return await heicTo({
    blob: file,
    type: 'bitmap',
    options: BITMAP_OPTIONS,
  });
}

async function decodeToImageBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, BITMAP_OPTIONS);
  } catch {
    if (!isHeicFile(file)) {
      throw new ImagePrepareError('IMAGE_PROCESS_FAILED');
    }

    try {
      return await decodeViaImageElement(file);
    } catch {
      try {
        return await decodeHeicViaLibheif(file);
      } catch {
        throw new ImagePrepareError('IMAGE_PROCESS_FAILED');
      }
    }
  }
}

export async function prepareImageFile(
  file: File,
): Promise<{ full: File; thumb: File }> {
  if (file.size > IMAGE_LIMITS.maxSourceBytes) {
    throw new ImagePrepareError('IMAGE_TOO_LARGE');
  }
  if (!isImageFile(file)) {
    throw new ImagePrepareError('IMAGE_INVALID');
  }

  const bitmap = await decodeToImageBitmap(file);
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
