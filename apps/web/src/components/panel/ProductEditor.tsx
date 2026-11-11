'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/client-api';
import {
  emptyGroup,
  emptyOption,
  moveItem,
  validateProductForm,
  type AdminCategory,
  type GroupForm,
  type OptionForm,
  type ProductForm,
} from '@/lib/menu-editor';
import { Sheet } from '../ui/Sheet';
import { inputClass, primaryButton, secondaryButton } from './styles';

interface Props {
  slug: string;
  productId: string | null; // null = produto novo
  initial: ProductForm;
  categories: AdminCategory[];
  sectors: string[];
  onClose: () => void;
  onSaved: () => void;
}

const small = `${inputClass} py-2`;

/** Formulário de produto: dados básicos, foto, destaque e grupos de complementos. */
export function ProductEditor({ slug, productId, initial, categories, sectors, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ProductForm>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const errorsRef = useRef<HTMLUListElement>(null);

  // Os erros ficam no topo do formulário: rola até eles para o usuário ver o que corrigir.
  useEffect(() => {
    if (errors.length) errorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [errors]);

  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setGroup = (gi: number, patch: Partial<GroupForm>) =>
    setForm((f) => ({ ...f, groups: f.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) }));
  const setOption = (gi: number, oi: number, patch: Partial<OptionForm>) =>
    setGroup(gi, { options: form.groups[gi]!.options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) });

  async function save() {
    const { body, errors: problems } = validateProductForm(form);
    setErrors(problems);
    if (!body) return;
    setSaving(true);
    try {
      await api(productId ? `/restaurants/${slug}/products/${productId}` : `/restaurants/${slug}/products`, {
        method: productId ? 'PUT' : 'POST',
        body,
      });
      onSaved();
    } catch (err) {
      setErrors([err instanceof ApiError ? err.message : 'Não foi possível salvar.']);
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={productId ? 'Editar produto' : 'Novo produto'}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-3 py-2 text-muted hover:text-fg">
            Cancelar
          </button>
          <button type="button" onClick={() => void save()} disabled={saving} className={primaryButton}>
            {saving ? 'Salvando...' : 'Salvar produto'}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {errors.length > 0 && (
          <ul ref={errorsRef} role="alert" className="space-y-1 rounded-xl bg-wine-deep px-4 py-3 text-sm text-red-200 ring-1 ring-wine-hover/60">
            {errors.map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-semibold">Nome</span>
            <input value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} className={inputClass} placeholder="Ex.: X-Burguer" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-semibold">Descrição <span className="font-normal text-muted">(opcional)</span></span>
            <textarea
              value={form.description}
              maxLength={500}
              rows={2}
              onChange={(e) => set('description', e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder="Ingredientes, tamanho, porção..."
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Preço</span>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">R$</span>
              <input inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} className={`${inputClass} pl-10`} placeholder="0,00" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Categoria</span>
            <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={inputClass}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Setor de produção</span>
            <input list="sectors" value={form.sector} onChange={(e) => set('sector', e.target.value)} className={inputClass} />
            <datalist id="sectors">
              {sectors.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <span className="mt-1 block text-xs text-muted">Define em qual impressora o item sai (cozinha, bar...).</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Link da foto <span className="font-normal text-muted">(opcional)</span></span>
            <input type="url" value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} className={inputClass} placeholder="https://..." />
          </label>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="h-5 w-5 accent-gold" />
            Disponível no cardápio
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} className="h-5 w-5 accent-gold" />
            Mostrar nos destaques
          </label>
        </div>

        {/* Complementos */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Complementos</h3>
              <p className="text-xs text-muted">Ex.: &quot;Ponto da carne&quot; (mín. 1, máx. 1) ou &quot;Adicionais&quot; (mín. 0, máx. 4).</p>
            </div>
            <button type="button" onClick={() => set('groups', [...form.groups, emptyGroup()])} className={`${secondaryButton} text-sm`}>
              + Grupo
            </button>
          </div>

          {form.groups.length === 0 && <p className="rounded-xl px-4 py-3 text-sm text-muted ring-1 ring-line">Este produto não tem complementos.</p>}

          <div className="space-y-4">
            {form.groups.map((group, gi) => (
              <fieldset key={group.key} className="rounded-xl bg-bg/40 p-3 ring-1 ring-line">
                <legend className="sr-only">Grupo {gi + 1}</legend>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-40 flex-1">
                    <span className="mb-1 block text-xs font-semibold text-muted">Nome do grupo</span>
                    <input value={group.name} onChange={(e) => setGroup(gi, { name: e.target.value })} className={small} placeholder="Ex.: Adicionais" />
                  </label>
                  <label className="w-20">
                    <span className="mb-1 block text-xs font-semibold text-muted">Mínimo</span>
                    <input inputMode="numeric" value={group.min} onChange={(e) => setGroup(gi, { min: e.target.value })} className={small} />
                  </label>
                  <label className="w-20">
                    <span className="mb-1 block text-xs font-semibold text-muted">Máximo</span>
                    <input inputMode="numeric" value={group.max} onChange={(e) => setGroup(gi, { max: e.target.value })} className={small} />
                  </label>
                  <div className="flex gap-1 pb-1">
                    <IconButton label="Subir grupo" disabled={gi === 0} onClick={() => set('groups', moveItem(form.groups, gi, -1))}>↑</IconButton>
                    <IconButton label="Descer grupo" disabled={gi === form.groups.length - 1} onClick={() => set('groups', moveItem(form.groups, gi, 1))}>↓</IconButton>
                    <IconButton label="Remover grupo" danger onClick={() => set('groups', form.groups.filter((_, i) => i !== gi))}>✕</IconButton>
                  </div>
                </div>

                <ul className="mt-3 space-y-2">
                  {group.options.map((option, oi) => (
                    <li key={option.key} className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label={`Nome da opção ${oi + 1}`}
                        value={option.name}
                        onChange={(e) => setOption(gi, oi, { name: e.target.value })}
                        className={`${small} min-w-36 flex-1`}
                        placeholder="Nome da opção"
                      />
                      <div className="relative w-28">
                        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted">+R$</span>
                        <input
                          aria-label={`Preço da opção ${oi + 1}`}
                          inputMode="decimal"
                          value={option.price}
                          onChange={(e) => setOption(gi, oi, { price: e.target.value })}
                          className={`${small} pl-10`}
                        />
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-muted" title="Desmarque quando acabar">
                        <input type="checkbox" checked={option.active} onChange={(e) => setOption(gi, oi, { active: e.target.checked })} className="h-4 w-4 accent-gold" />
                        Disponível
                      </label>
                      <IconButton
                        label={`Remover opção ${oi + 1}`}
                        danger
                        onClick={() => setGroup(gi, { options: group.options.filter((_, i) => i !== oi) })}
                      >
                        ✕
                      </IconButton>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setGroup(gi, { options: [...group.options, emptyOption()] })} className="mt-2 text-sm text-gold hover:text-gold-soft">
                  + Opção
                </button>
              </fieldset>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-line disabled:opacity-30 ${
        danger ? 'text-red-300 hover:bg-wine-deep' : 'text-muted hover:text-gold'
      }`}
    >
      {children}
    </button>
  );
}
