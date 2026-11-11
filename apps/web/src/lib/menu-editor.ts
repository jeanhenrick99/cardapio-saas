import { isImageRef } from '@cardapio/shared';
import { centsToInput, parseBRL } from './panel';

// ---------- Formato que a API devolve em GET /restaurants/:slug/menu ----------

export interface AdminOption {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
  position: number;
}

export interface AdminGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  position: number;
  options: AdminOption[];
}

export interface AdminProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number;
  sector: string;
  position: number;
  active: boolean;
  featured: boolean;
  imageUrl: string | null;
  optionGroups: AdminGroup[];
}

export interface AdminCategory {
  id: string;
  name: string;
  position: number;
  active: boolean;
  products: AdminProduct[];
}

// ---------- Formulário (tudo como texto, do jeito que o usuário digita) ----------

let keySeq = 0;
/** Chave estável para listas do React (grupos e opções ainda sem ID). */
export const newKey = () => `k${++keySeq}`;

export interface OptionForm {
  key: string;
  name: string;
  price: string;
  active: boolean;
}

export interface GroupForm {
  key: string;
  name: string;
  min: string;
  max: string;
  options: OptionForm[];
}

export interface ProductForm {
  categoryId: string;
  name: string;
  description: string;
  price: string;
  sector: string;
  active: boolean;
  featured: boolean;
  imageUrl: string;
  position: number;
  groups: GroupForm[];
}

export const emptyOption = (): OptionForm => ({ key: newKey(), name: '', price: '0,00', active: true });
export const emptyGroup = (): GroupForm => ({ key: newKey(), name: '', min: '0', max: '1', options: [emptyOption()] });

export function emptyProductForm(categoryId: string, position = 0): ProductForm {
  return {
    categoryId,
    name: '',
    description: '',
    price: '',
    sector: 'cozinha',
    active: true,
    featured: false,
    imageUrl: '',
    position,
    groups: [],
  };
}

export function productToForm(p: AdminProduct): ProductForm {
  return {
    categoryId: p.categoryId,
    name: p.name,
    description: p.description ?? '',
    price: centsToInput(p.priceCents),
    sector: p.sector,
    active: p.active,
    featured: p.featured,
    imageUrl: p.imageUrl ?? '',
    position: p.position,
    groups: p.optionGroups.map((g) => ({
      key: newKey(),
      name: g.name,
      min: String(g.minSelect),
      max: String(g.maxSelect),
      options: g.options.map((o) => ({ key: newKey(), name: o.name, price: centsToInput(o.priceCents), active: o.active })),
    })),
  };
}

/** Corpo aceito por POST/PUT /restaurants/:slug/products. */
export interface ProductBody {
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number;
  sector: string;
  position: number;
  active: boolean;
  featured: boolean;
  imageUrl: string | null;
  optionGroups: { name: string; minSelect: number; maxSelect: number; options: { name: string; priceCents: number; active: boolean }[] }[];
}

const isInt = (v: string) => /^\d+$/.test(v.trim());

/**
 * Valida o formulário com as mesmas regras do servidor e monta o corpo da requisição.
 * Devolve a lista de erros em português (vazia = pode salvar).
 */
export function validateProductForm(form: ProductForm): { body: ProductBody | null; errors: string[] } {
  const errors: string[] = [];
  const name = form.name.trim();
  if (!name) errors.push('Informe o nome do produto.');

  const priceCents = parseBRL(form.price);
  if (priceCents === null || form.price.trim() === '') errors.push('Informe um preço válido, como 25,90.');

  const sector = form.sector.trim().toLowerCase();
  if (!sector) errors.push('Informe o setor de produção (ex.: cozinha ou bar).');

  const imageUrl = form.imageUrl.trim();
  if (imageUrl && !isImageRef(imageUrl)) errors.push('O link da foto precisa começar com http:// ou https://.');

  const optionGroups: ProductBody['optionGroups'] = [];
  form.groups.forEach((g, gi) => {
    const label = g.name.trim() ? `"${g.name.trim()}"` : `Grupo ${gi + 1}`;
    if (!g.name.trim()) errors.push(`${label}: informe o nome do grupo.`);
    if (!isInt(g.min) || !isInt(g.max)) {
      errors.push(`${label}: mínimo e máximo precisam ser números inteiros.`);
      return;
    }
    const minSelect = Number(g.min);
    const maxSelect = Number(g.max);
    if (maxSelect < 1) errors.push(`${label}: o máximo precisa ser pelo menos 1.`);
    if (minSelect > maxSelect) errors.push(`${label}: o mínimo não pode ser maior que o máximo.`);
    if (g.options.length === 0) errors.push(`${label}: adicione pelo menos uma opção.`);
    if (minSelect > g.options.length) errors.push(`${label}: o mínimo (${minSelect}) é maior que o número de opções.`);

    const options = g.options.map((o, oi) => {
      if (!o.name.trim()) errors.push(`${label}: a opção ${oi + 1} está sem nome.`);
      const cents = parseBRL(o.price);
      if (cents === null) errors.push(`${label}: preço inválido na opção "${o.name.trim() || oi + 1}".`);
      return { name: o.name.trim(), priceCents: cents ?? 0, active: o.active };
    });
    optionGroups.push({ name: g.name.trim(), minSelect, maxSelect, options });
  });

  if (errors.length > 0) return { body: null, errors };
  return {
    errors,
    body: {
      categoryId: form.categoryId,
      name,
      description: form.description.trim() || null,
      priceCents: priceCents!,
      sector,
      position: form.position,
      active: form.active,
      featured: form.featured,
      imageUrl: imageUrl || null,
      optionGroups,
    },
  };
}

/** Move um item da lista uma posição para cima (-1) ou para baixo (+1). */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Setores já usados no cardápio, para sugerir no campo (cozinha e bar sempre aparecem). */
export function knownSectors(categories: AdminCategory[]): string[] {
  const set = new Set(['cozinha', 'bar']);
  categories.forEach((c) => c.products.forEach((p) => set.add(p.sector)));
  return [...set].sort();
}
