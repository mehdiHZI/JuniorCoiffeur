/**
 * Compression d'images côté client (Canvas) avant upload Supabase.
 * Réduit stockage et bande passante (plan FREE 1 Go / 5 Go egress).
 */

export type CompressionOptions =
  | { maxWidth: number; maxHeight: number; quality?: number }
  | { maxDimension: number; quality?: number };

const DEFAULT_QUALITY = 0.8;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de charger l'image"));
    };
    img.src = url;
  });
}

function computeDimensions(
  width: number,
  height: number,
  options: CompressionOptions
): { width: number; height: number } {
  if ("maxDimension" in options) {
    const max = options.maxDimension;
    if (width <= max && height <= max) return { width, height };
    const scale = max / Math.max(width, height);
    return {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    };
  }
  const maxW = options.maxWidth;
  const maxH = options.maxHeight;
  if (width <= maxW && height <= maxH) return { width, height };
  const scale = Math.min(maxW / width, maxH / height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/**
 * Compresse une image (File) et retourne un Blob JPEG.
 * - Avatars : { maxWidth: 400, maxHeight: 400, quality: 0.8 }
 * - Feed : { maxDimension: 1200, quality: 0.8 }
 * - Prestations : { maxDimension: 1000, quality: 0.8 }
 */
export async function compressImage(
  file: File,
  options: CompressionOptions
): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("Le fichier n'est pas une image"));
  }

  const img = await loadImage(file);
  const quality = options.quality ?? DEFAULT_QUALITY;
  const { width, height } = computeDimensions(img.width, img.height, options);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas non disponible"));

  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Échec de la compression"));
      },
      "image/jpeg",
      quality
    );
  });
}
