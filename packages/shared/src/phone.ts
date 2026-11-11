/** Só os dígitos do telefone: "(11) 98888-1111" → "11988881111". */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Telefone com dígitos suficientes para buscar (DDD + número). */
export const isSearchablePhone = (phone: string) => phoneDigits(phone).length >= 10;

/**
 * Mesmo telefone, ignorando formatação e o código do país:
 * "(11) 98888-1111" = "11988881111" = "+55 11 98888-1111".
 */
export function samePhone(a: string, b: string): boolean {
  const x = phoneDigits(a);
  const y = phoneDigits(b);
  if (x.length < 10 || y.length < 10) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}
