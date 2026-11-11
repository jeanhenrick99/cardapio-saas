/** Menores arquivos válidos de cada formato (só a assinatura), para os testes. */
export const TINY_WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x1a, 0, 0, 0]), Buffer.from('WEBPVP8L'), Buffer.alloc(14, 1)]);
export const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
export const TINY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
