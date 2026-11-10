/** Cardápio de demonstração usado pelo seed. Preços em centavos. */
type Option = { name: string; priceCents?: number };
type Group = { name: string; minSelect: number; maxSelect: number; options: Option[] };
type Product = { name: string; description?: string; priceCents: number; sector: string; optionGroups?: Group[] };

const pointOfMeat: Group = {
  name: 'Ponto da carne',
  minSelect: 1,
  maxSelect: 1,
  options: [{ name: 'Mal passado' }, { name: 'Ao ponto' }, { name: 'Bem passado' }],
};
const burgerExtras: Group = {
  name: 'Adicionais',
  minSelect: 0,
  maxSelect: 4,
  options: [
    { name: 'Bacon', priceCents: 400 },
    { name: 'Ovo', priceCents: 300 },
    { name: 'Cheddar', priceCents: 500 },
    { name: 'Cebola caramelizada', priceCents: 350 },
  ],
};

export const DEMO_MENU: { name: string; products: Product[] }[] = [
  {
    name: 'Lanches',
    products: [
      { name: 'X-Burguer', description: 'Pão brioche, blend 160 g, queijo prato e maionese da casa', priceCents: 2500, sector: 'cozinha', optionGroups: [pointOfMeat, burgerExtras] },
      { name: 'X-Salada', description: 'Blend 160 g, queijo, alface, tomate e maionese', priceCents: 2700, sector: 'cozinha', optionGroups: [pointOfMeat, burgerExtras] },
      { name: 'X-Tudo', description: 'Dois blends, bacon, ovo, presunto, queijo e salada', priceCents: 3900, sector: 'cozinha', optionGroups: [pointOfMeat] },
    ],
  },
  {
    name: 'Pizzas',
    products: [
      {
        name: 'Pizza grande (8 fatias)',
        description: 'Escolha até 2 sabores',
        priceCents: 5900,
        sector: 'cozinha',
        optionGroups: [
          {
            name: 'Sabores',
            minSelect: 1,
            maxSelect: 2,
            options: [{ name: 'Calabresa' }, { name: 'Margherita' }, { name: 'Quatro queijos', priceCents: 500 }, { name: 'Frango com catupiry', priceCents: 500 }],
          },
          { name: 'Borda', minSelect: 0, maxSelect: 1, options: [{ name: 'Catupiry', priceCents: 900 }, { name: 'Cheddar', priceCents: 900 }] },
        ],
      },
    ],
  },
  {
    name: 'Porções',
    products: [
      { name: 'Batata frita', description: '400 g', priceCents: 1900, sector: 'cozinha', optionGroups: [{ name: 'Cobertura', minSelect: 0, maxSelect: 1, options: [{ name: 'Cheddar e bacon', priceCents: 800 }] }] },
      { name: 'Pão de queijo (10 un.)', priceCents: 1500, sector: 'cozinha' },
    ],
  },
  {
    name: 'Açaí',
    products: [
      {
        name: 'Açaí 500 ml',
        priceCents: 2200,
        sector: 'cozinha',
        optionGroups: [
          { name: 'Complementos (até 3 grátis)', minSelect: 0, maxSelect: 3, options: [{ name: 'Granola' }, { name: 'Banana' }, { name: 'Leite em pó' }, { name: 'Paçoca' }] },
          { name: 'Extras', minSelect: 0, maxSelect: 2, options: [{ name: 'Nutella', priceCents: 600 }, { name: 'Morango', priceCents: 400 }] },
        ],
      },
    ],
  },
  {
    name: 'Bebidas',
    products: [
      { name: 'Coca-Cola lata', priceCents: 700, sector: 'bar' },
      { name: 'Suco natural 500 ml', priceCents: 1100, sector: 'bar', optionGroups: [{ name: 'Sabor', minSelect: 1, maxSelect: 1, options: [{ name: 'Laranja' }, { name: 'Limão' }, { name: 'Maracujá' }] }] },
      { name: 'Caipirinha', priceCents: 1800, sector: 'bar', optionGroups: [{ name: 'Fruta', minSelect: 1, maxSelect: 1, options: [{ name: 'Limão' }, { name: 'Morango', priceCents: 200 }, { name: 'Maracujá', priceCents: 200 }] }] },
      { name: 'Chopp 300 ml', priceCents: 1200, sector: 'bar' },
    ],
  },
];
