import { ApiError } from './client-api';

/** Novo tamanho que cabe em `max` x `max`, mantendo a proporção (nunca aumenta a foto). */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Limite de tamanho do arquivo original (antes de comprimir). */
export const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;

/**
 * Reduz e comprime a foto no navegador antes de enviar:
 * uma foto de celular de 4 MB vira um WebP de ~100 KB.
 * Também resolve a rotação de fotos tiradas em pé (EXIF), porque o
 * navegador já desenha a imagem na orientação certa.
 */
export async function compressImage(file: File, maxSize: number): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem (JPG, PNG ou WebP).');
  if (file.size > MAX_ORIGINAL_BYTES) throw new Error('A foto é grande demais (máximo de 20 MB).');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Não foi possível abrir esta imagem. Tente outra foto.');
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSize);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // WebP é bem menor; navegadores antigos que não geram WebP caem para JPEG.
  const webp = await toBlob('image/webp', 0.82);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob('image/jpeg', 0.85);
  if (!jpeg) throw new Error('Não foi possível comprimir a imagem.');
  return jpeg;
}

/** Envia a foto já comprimida para a API e devolve o caminho para salvar no produto/loja. */
export async function uploadImage(slug: string, blob: Blob): Promise<string> {
  const res = await fetch(`/api/restaurants/${encodeURIComponent(slug)}/images`, {
    method: 'POST',
    headers: { 'content-type': blob.type },
    body: blob,
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new ApiError(body.error ?? `Erro ${res.status} ao enviar a foto`, res.status);
  return body.url;
}
