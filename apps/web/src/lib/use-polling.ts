'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client-api';

/**
 * Busca um recurso da API e repete a cada `intervalMs`.
 * Pausa quando a aba não está visível (economiza bateria e requisições).
 */
export function usePolling<T>(path: string, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  const refresh = useCallback(async () => {
    try {
      setData(await api<T>(pathRef.current));
      setError(null);
      setUpdatedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, intervalMs);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, intervalMs, path]);

  return { data, error, updatedAt, refresh };
}
