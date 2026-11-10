/**
 * Gera um código de pareamento para o agente (logando como o usuário demo).
 *   npm run pairing-code            → restaurante "demo"
 */
import { api, loginAsDemo } from './client';

const slug = process.argv[2] ?? 'demo';
const token = await loginAsDemo();
const { code, expiresAt } = await api<{ code: string; expiresAt: string }>(token, 'POST', `/restaurants/${slug}/pairing-codes`);
const minutes = Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000);
console.log(`✔ Código de pareamento: ${code}  (válido por ${minutes} min, uso único)`);
console.log(`  No agente, rode: npm run pair -- ${code}`);
