/** Cria o restaurante e o usuário de demonstração (pode rodar quantas vezes quiser). */
import { hashPassword } from '../auth/password';
import { prisma } from '../db';
import { DEMO_RESTAURANT, DEMO_STAFF, DEMO_USER } from './demo';
import { DEMO_FEATURED, DEMO_MENU } from './demo-menu';

const restaurant = await prisma.restaurant.upsert({
  where: { slug: DEMO_RESTAURANT.slug },
  update: {},
  create: { ...DEMO_RESTAURANT, pickupMinutes: 25, deliveryMinutes: 45, minOrderCents: 3000 },
});

const user = await prisma.user.upsert({
  where: { email: DEMO_USER.email },
  update: {},
  create: { name: DEMO_USER.name, email: DEMO_USER.email, passwordHash: await hashPassword(DEMO_USER.password) },
});

await prisma.membership.upsert({
  where: { userId_restaurantId: { userId: user.id, restaurantId: restaurant.id } },
  update: {},
  create: { userId: user.id, restaurantId: restaurant.id, role: 'OWNER' },
});

// Cardápio: só cria se o restaurante ainda não tiver nenhuma categoria.
if ((await prisma.category.count({ where: { restaurantId: restaurant.id } })) === 0) {
  for (const [ci, category] of DEMO_MENU.entries()) {
    await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        name: category.name,
        position: ci,
        products: {
          create: category.products.map((p, pi) => ({
            restaurantId: restaurant.id,
            name: p.name,
            description: p.description,
            priceCents: p.priceCents,
            sector: p.sector,
            position: pi,
            optionGroups: {
              create: (p.optionGroups ?? []).map((g, gi) => ({
                name: g.name,
                minSelect: g.minSelect,
                maxSelect: g.maxSelect,
                position: gi,
                options: { create: g.options.map((o, oi) => ({ name: o.name, priceCents: o.priceCents ?? 0, position: oi })) },
              })),
            },
          })),
        },
      },
    });
  }
  console.log(`✔ Cardápio de demonstração com ${DEMO_MENU.reduce((n, c) => n + c.products.length, 0)} produtos`);
}

// Destaques: marca alguns produtos se o restaurante ainda não tiver nenhum.
if ((await prisma.product.count({ where: { restaurantId: restaurant.id, featured: true } })) === 0) {
  const { count } = await prisma.product.updateMany({
    where: { restaurantId: restaurant.id, name: { in: DEMO_FEATURED } },
    data: { featured: true },
  });
  console.log(`✔ ${count} produtos em destaque`);
}

const staff = await prisma.user.upsert({
  where: { email: DEMO_STAFF.email },
  update: {},
  create: { name: DEMO_STAFF.name, email: DEMO_STAFF.email, passwordHash: await hashPassword(DEMO_STAFF.password) },
});
await prisma.membership.upsert({
  where: { userId_restaurantId: { userId: staff.id, restaurantId: restaurant.id } },
  update: {},
  create: { userId: staff.id, restaurantId: restaurant.id, role: 'STAFF' },
});

console.log(`✔ Restaurante "${restaurant.name}" (slug: ${restaurant.slug})`);
console.log(`✔ Usuário ${DEMO_USER.email} / senha ${DEMO_USER.password} (dono do restaurante)`);
console.log(`✔ Usuário ${DEMO_STAFF.email} / senha ${DEMO_STAFF.password} (garçom: só PDV)`);
await prisma.$disconnect();
