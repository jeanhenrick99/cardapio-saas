/**
 * Cria um pedido aleatório pela API (logando como o usuário demo).
 *   npm run order            → restaurante "demo"
 *   npm run order -- outro   → restaurante "outro"
 */
import { api, loginAsDemo } from './client';

const slug = process.argv[2] ?? 'demo';
const token = await loginAsDemo();
const body = await api<{ order: { number: number }; printJob: { status: string } }>(token, 'POST', `/restaurants/${slug}/orders`);
console.log(`✔ Pedido #${body.order.number} criado (job ${body.printJob.status})`);
