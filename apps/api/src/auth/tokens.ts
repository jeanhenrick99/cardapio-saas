import { createHash, randomBytes, randomInt } from 'node:crypto';

/** Token longo e aleatório do agente. Só é mostrado uma vez, no pareamento. */
export function generateAgentToken(): string {
  return `agt_${randomBytes(32).toString('base64url')}`;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Sem 0/O, 1/I/L: evita confusão ao digitar o código. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Código curto de pareamento no formato "K7P-2QX". */
export function generatePairingCode(): string {
  const chars = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
  return `${chars.slice(0, 3).join('')}-${chars.slice(3).join('')}`;
}

/** Aceita "k7p2qx", "K7P 2QX", "k7p-2qx"... e devolve "K7P-2QX". */
export function normalizePairingCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (raw.length !== 6 || [...raw].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}
