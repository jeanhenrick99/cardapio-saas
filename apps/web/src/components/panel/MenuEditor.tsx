'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatBRL } from '@cardapio/shared';
import { api, ApiError } from '@/lib/client-api';
import {
  emptyProductForm,
  knownSectors,
  moveItem,
  productToForm,
  type AdminCategory,
  type AdminProduct,
  type ProductForm,
} from '@/lib/menu-editor';
import type { Role } from '@/lib/types';
import { ProductEditor } from './ProductEditor';
import { card, inputClass, primaryButton } from './styles';

type Editing = { productId: string | null; form: ProductForm } | null;

export function MenuEditor({ slug, role }: { slug: string; role: Role }) {
  const isOwner = role === 'OWNER';
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    try {
      setCategories(await api<AdminCategory[]>(`/restaurants/${slug}/menu`));
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Erro ao carregar o cardápio.' });
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Executa uma ação, mostra o resultado e recarrega o cardápio. */
  async function run(action: () => Promise<unknown>, success?: string) {
    setMessage(null);
    try {
      await action();
      if (success) setMessage({ ok: true, text: success });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Não foi possível concluir a ação.' });
    }
    await load();
  }

  const base = `/restaurants/${slug}`;

  function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    setNewCategory('');
    void run(() => api(`${base}/categories`, { method: 'POST', body: { name, position: categories?.length ?? 0 } }), `Categoria "${name}" criada.`);
  }

  function moveCategory(index: number, delta: -1 | 1) {
    if (!categories) return;
    const reordered = moveItem(categories, index, delta);
    setCategories(reordered); // atualiza na hora; o servidor confirma em seguida
    void run(() =>
      Promise.all(
        reordered.map((c, position) => (c.position === position ? null : api(`${base}/categories/${c.id}`, { method: 'PATCH', body: { position } }))),
      ),
    );
  }

  function deleteCategory(c: AdminCategory) {
    if (!window.confirm(`Excluir a categoria "${c.name}"?`)) return;
    void run(() => api(`${base}/categories/${c.id}`, { method: 'DELETE' }), `Categoria "${c.name}" excluída.`);
  }

  function deleteProduct(p: AdminProduct) {
    if (!window.confirm(`Excluir "${p.name}"? Pedidos antigos não são afetados.`)) return;
    void run(() => api(`${base}/products/${p.id}`, { method: 'DELETE' }), `"${p.name}" excluído.`);
  }

  function toggleAvailability(p: AdminProduct) {
    void run(
      () => api(`${base}/products/${p.id}/availability`, { method: 'PATCH', body: { active: !p.active } }),
      p.active ? `"${p.name}" marcado como esgotado.` : `"${p.name}" disponível de novo.`,
    );
  }

  if (!categories) return <p className="text-muted">{message?.text ?? 'Carregando...'}</p>;

  const sectors = knownSectors(categories);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Cardápio</h1>
          <p className="text-sm text-muted">
            {isOwner ? 'Categorias, produtos, preços e complementos.' : 'Somente o dono edita o cardápio. Você pode marcar produtos como esgotados.'}
          </p>
        </div>
        {isOwner && (
          <form onSubmit={addCategory} className="flex w-full gap-2 sm:w-auto">
            <input
              aria-label="Nome da nova categoria"
              value={newCategory}
              maxLength={80}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Nova categoria"
              className={`${inputClass} py-2 sm:w-56`}
            />
            <button type="submit" disabled={!newCategory.trim()} className={`${primaryButton} py-2 whitespace-nowrap`}>
              Adicionar
            </button>
          </form>
        )}
      </div>

      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={`rounded-xl px-4 py-3 text-sm ring-1 ${message.ok ? 'text-emerald-300 ring-emerald-700/70' : 'bg-wine-deep text-red-200 ring-wine-hover/60'}`}
        >
          {message.text}
        </p>
      )}

      {categories.length === 0 && <div className={`${card} text-center text-muted`}>Crie a primeira categoria para começar o cardápio.</div>}

      {categories.map((category, ci) => (
        <section key={category.id} className={card} aria-label={category.name}>
          <div className="flex flex-wrap items-center gap-3">
            {renaming?.id === category.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = renaming.name.trim();
                  setRenaming(null);
                  if (name && name !== category.name) void run(() => api(`${base}/categories/${category.id}`, { method: 'PATCH', body: { name } }));
                }}
              >
                <input autoFocus aria-label="Novo nome da categoria" value={renaming.name} maxLength={80} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} className={`${inputClass} py-1.5`} />
                <button type="submit" className="text-sm font-semibold text-gold">Salvar</button>
                <button type="button" onClick={() => setRenaming(null)} className="text-sm text-muted">Cancelar</button>
              </form>
            ) : (
              <h2 className="flex-1 font-display text-xl font-semibold text-gold-soft">
                {category.name}
                {!category.active && <span className="ml-2 align-middle text-xs font-sans font-semibold text-muted uppercase ring-1 ring-line rounded-full px-2 py-0.5">Oculta</span>}
              </h2>
            )}

            {isOwner && renaming?.id !== category.id && (
              <div className="flex flex-wrap items-center gap-1 text-sm">
                <SmallButton label="Subir categoria" disabled={ci === 0} onClick={() => moveCategory(ci, -1)}>↑</SmallButton>
                <SmallButton label="Descer categoria" disabled={ci === categories.length - 1} onClick={() => moveCategory(ci, 1)}>↓</SmallButton>
                <TextButton onClick={() => setRenaming({ id: category.id, name: category.name })}>Renomear</TextButton>
                <TextButton
                  onClick={() =>
                    void run(
                      () => api(`${base}/categories/${category.id}`, { method: 'PATCH', body: { active: !category.active } }),
                      category.active ? `"${category.name}" oculta do cardápio.` : `"${category.name}" visível no cardápio.`,
                    )
                  }
                >
                  {category.active ? 'Ocultar' : 'Mostrar'}
                </TextButton>
                <TextButton danger onClick={() => deleteCategory(category)}>Excluir</TextButton>
              </div>
            )}
          </div>

          <ul className="mt-4 divide-y divide-line">
            {category.products.length === 0 && <li className="py-3 text-sm text-muted">Nenhum produto nesta categoria.</li>}
            {category.products.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className={`font-medium ${p.active ? '' : 'text-muted line-through'}`}>
                    {p.featured && <span className="mr-1 text-gold" title="Em destaque">★</span>}
                    {p.name}
                  </div>
                  <div className="text-xs text-muted">
                    {p.sector}
                    {p.optionGroups.length > 0 && ` · ${p.optionGroups.length} ${p.optionGroups.length === 1 ? 'grupo' : 'grupos'} de complementos`}
                  </div>
                </div>
                <span className="font-semibold text-gold tabular-nums">{formatBRL(p.priceCents)}</span>
                <button
                  onClick={() => toggleAvailability(p)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                    p.active ? 'text-emerald-300 ring-emerald-700/70 hover:bg-emerald-950/40' : 'bg-wine-deep text-red-200 ring-wine-hover/60'
                  }`}
                  title={p.active ? 'Clique para marcar como esgotado' : 'Clique para voltar a vender'}
                >
                  {p.active ? 'Disponível' : 'Esgotado'}
                </button>
                {isOwner && (
                  <div className="flex gap-1 text-sm">
                    <TextButton onClick={() => setEditing({ productId: p.id, form: productToForm(p) })}>Editar</TextButton>
                    <TextButton danger onClick={() => deleteProduct(p)}>Excluir</TextButton>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {isOwner && (
            <button
              onClick={() => setEditing({ productId: null, form: emptyProductForm(category.id, category.products.length) })}
              className="mt-3 text-sm font-semibold text-gold hover:text-gold-soft"
            >
              + Novo produto em {category.name}
            </button>
          )}
        </section>
      ))}

      {editing && (
        <ProductEditor
          key={editing.productId ?? 'novo'}
          slug={slug}
          productId={editing.productId}
          initial={editing.form}
          categories={categories}
          sectors={sectors}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void run(async () => undefined, editing.productId ? 'Produto atualizado.' : 'Produto criado.');
          }}
        />
      )}
    </div>
  );
}

function TextButton({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-2 py-1 ${danger ? 'text-red-300 hover:text-red-200' : 'text-muted hover:text-gold'}`}>
      {children}
    </button>
  );
}

function SmallButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} disabled={disabled} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted ring-1 ring-line hover:text-gold disabled:opacity-30">
      {children}
    </button>
  );
}
