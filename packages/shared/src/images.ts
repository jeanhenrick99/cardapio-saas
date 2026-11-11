/** Caminho público de uma foto enviada (servida pela API, via proxy /api do site). */
export const uploadedImagePath = (id: string) => `/api/images/${id}`;

const UPLOADED = /^\/api\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTERNAL = /^https?:\/\/\S+$/i;

/** Aceita uma foto enviada (/api/images/<id>) ou um link http(s) externo. */
export function isImageRef(value: string): boolean {
  return value.length <= 500 && (UPLOADED.test(value) || EXTERNAL.test(value));
}
