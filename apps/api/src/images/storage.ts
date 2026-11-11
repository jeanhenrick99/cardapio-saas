import type { PrismaClient } from '@prisma/client';
import { uploadedImagePath } from '@cardapio/shared';

/**
 * Armazenamento das fotos. Hoje: tabela Image no PostgreSQL.
 * Para trocar por S3/R2/Cloudinary, basta reimplementar saveImage/loadImage.
 */

/** As fotos chegam já comprimidas pelo navegador (~100 KB); 800 KB é uma margem folgada. */
export const IMAGE_MAX_BYTES = 800 * 1024;
export const IMAGE_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/**
 * Descobre o tipo real do arquivo pelos primeiros bytes ("assinatura"),
 * sem confiar no Content-Type enviado: um .txt renomeado para .png é recusado.
 */
export function sniffImageType(data: Buffer): ImageType | null {
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

export async function saveImage(prisma: PrismaClient, restaurantId: string, data: Buffer, contentType: ImageType) {
  const image = await prisma.image.create({
    data: { restaurantId, contentType, size: data.length, data: new Uint8Array(data) },
    select: { id: true, size: true, contentType: true },
  });
  return { ...image, url: uploadedImagePath(image.id) };
}

export function loadImage(prisma: PrismaClient, id: string) {
  return prisma.image.findUnique({ where: { id }, select: { data: true, contentType: true } });
}
