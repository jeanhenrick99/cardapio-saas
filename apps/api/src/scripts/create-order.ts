/**
 * Cria um pedido aleatório pela API.
 *   npm run order            → restaurante "demo"
 *   npm run order -- outro   → restaurante "outro"
 */
import { env } from '../env';

const slug = process.argv[2] ?? 'demo';
const res = await fetch(`http://localhost:${env.PORT}/restaurants/${slug}/orders`, {
  method: 'POST',
  headers: { authorization: `Bearer ${env.ADMIN_TOKEN}` },
});
const body = (await res.json()) as { order?: { number: number }; printJob?: { status: string }; error?: string };
if (!res.ok) {
  console.error(`✖ HTTP ${res.status}: ${body.error ?? JSON.stringify(body)}`);
  process.exit(1);
}
console.log(`✔ Pedido #${body.order?.number} criado (job ${body.printJob?.status})`);
