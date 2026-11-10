import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Hash de senha com scrypt (nativo do Node, sem dependência nativa como bcrypt/argon2).
 * scrypt é "memory-hard": cada tentativa custa memória e CPU, o que torna
 * ataques de força bruta com GPU muito mais caros.
 *
 * Formato salvo: scrypt$N$r$p$salt$hash  (parâmetros junto do hash permitem
 * aumentar o custo no futuro sem quebrar senhas antigas).
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function scryptAsync(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem precisa comportar 128 * N * r bytes
    scrypt(password, salt, KEY_LENGTH, { ...options, maxmem: 256 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !n || !r || !p || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'), { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * Hash "falso" usado quando o e-mail não existe: o login leva o mesmo tempo
 * com ou sem usuário, então não dá para descobrir e-mails cadastrados
 * medindo o tempo de resposta.
 */
let dummyHash: Promise<string> | null = null;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(password, await dummyHash);
  return false;
}
