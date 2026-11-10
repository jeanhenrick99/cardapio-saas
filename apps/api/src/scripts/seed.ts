/** Cria o restaurante de demonstração (rodar quantas vezes quiser). */
import { prisma } from '../db';

const restaurant = await prisma.restaurant.upsert({
  where: { slug: 'demo' },
  update: {},
  create: { slug: 'demo', name: 'Restaurante Demo' },
});
console.log(`✔ Restaurante "${restaurant.name}" pronto (slug: ${restaurant.slug})`);
await prisma.$disconnect();
