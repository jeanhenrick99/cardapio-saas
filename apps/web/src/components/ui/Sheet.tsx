'use client';

import { useEffect, useId, useRef } from 'react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Painel que sobe de baixo (padrão de apps de delivery no celular).
 * Fecha com Esc ou tocando fora; trava a rolagem da página por trás.
 */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button aria-label="Fechar" className="absolute inset-0 bg-black/50" onClick={onClose} tabIndex={-1} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl outline-none sm:rounded-3xl dark:bg-stone-900"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 pt-5 pb-3 dark:border-stone-800">
          <h2 id={titleId} className="text-lg leading-tight font-bold">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="-mt-1 -mr-2 rounded-full p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && (
          <div className="border-t border-stone-200 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-stone-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
