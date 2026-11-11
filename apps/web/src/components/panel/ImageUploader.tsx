'use client';

import { useRef, useState } from 'react';
import { isImageRef } from '@cardapio/shared';
import { compressImage, uploadImage } from '@/lib/image-upload';
import { CutleryIcon } from '../ui/icons';
import { inputClass } from './styles';

interface Props {
  slug: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Lado maior da foto depois de reduzida (px). */
  maxSize?: number;
  /** Formato da prévia: quadrada (produto/logo) ou larga (capa). */
  shape?: 'square' | 'wide';
  disabled?: boolean;
}

/** Escolher foto do computador/celular (comprime e envia) ou colar um link. */
export function ImageUploader({ slug, label, value, onChange, maxSize = 1200, shape = 'square', disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ busy: boolean; error: string | null; info: string | null }>({ busy: false, error: null, info: null });
  const [showLink, setShowLink] = useState(() => value.startsWith('http'));

  async function onFile(file: File | undefined) {
    if (!file) return;
    setStatus({ busy: true, error: null, info: null });
    try {
      const blob = await compressImage(file, maxSize);
      const url = await uploadImage(slug, blob);
      onChange(url);
      setStatus({
        busy: false,
        error: null,
        info: `Foto enviada (${Math.round(file.size / 1024)} KB → ${Math.round(blob.size / 1024)} KB).`,
      });
    } catch (err) {
      setStatus({ busy: false, error: err instanceof Error ? err.message : 'Não foi possível enviar a foto.', info: null });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const preview = value && isImageRef(value) ? value : null;
  const box = shape === 'wide' ? 'aspect-[3/1] w-full max-w-md' : 'h-24 w-24';

  return (
    <div>
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      <div className="flex flex-wrap items-center gap-4">
        <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-gold-deep ring-1 ring-line ${box}`}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={`Prévia: ${label}`} className="h-full w-full object-cover" />
          ) : (
            <CutleryIcon className="h-8 w-8" />
          )}
        </div>
        {!disabled && (
          <div className="flex flex-col items-start gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={status.busy}
                onClick={() => fileRef.current?.click()}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-gold ring-1 ring-gold-deep hover:ring-gold disabled:opacity-60"
              >
                {status.busy ? 'Enviando...' : preview ? 'Trocar foto' : 'Enviar foto'}
              </button>
              {preview && (
                <button type="button" onClick={() => onChange('')} className="rounded-lg px-3 py-1.5 text-sm text-red-300 hover:text-red-200">
                  Remover
                </button>
              )}
            </div>
            <button type="button" onClick={() => setShowLink((s) => !s)} className="text-xs text-muted hover:text-fg">
              {showLink ? 'Ocultar link' : 'ou usar um link da internet'}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
        )}
      </div>
      {showLink && !disabled && (
        <input
          type="url"
          aria-label={`Link da imagem: ${label}`}
          value={value.startsWith('/api/') ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className={`${inputClass} mt-3`}
        />
      )}
      {status.error && <p role="alert" className="mt-2 text-xs text-red-300">{status.error}</p>}
      {status.info && <p role="status" className="mt-2 text-xs text-emerald-300">{status.info}</p>}
    </div>
  );
}
