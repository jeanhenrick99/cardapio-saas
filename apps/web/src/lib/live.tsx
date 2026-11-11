'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { PanelEvent } from '@cardapio/shared';
import { api } from './client-api';

export type LiveStatus = 'connecting' | 'live' | 'offline';
type Listener = (event: PanelEvent) => void;

interface LiveContextValue {
  status: LiveStatus;
  subscribe: (fn: Listener) => () => void;
}

const LiveContext = createContext<LiveContextValue | null>(null);

/** Espera entre tentativas de reconexão: 1 s, 2 s, 4 s... até 30 s. */
export function reconnectDelay(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
}

/**
 * Uma conexão ao vivo por painel aberto. A cada (re)conexão, pede um passe novo
 * à API (pelo cookie de login) e abre o WebSocket direto na API com ele.
 */
export function LiveProvider({ slug, url, children }: { slug: string; url: string; children: React.ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (stopped) return;
      setStatus('offline');
      timer = setTimeout(connect, reconnectDelay(attempt++));
    };

    async function connect() {
      try {
        const { token } = await api<{ token: string }>(`/restaurants/${slug}/live-token`, { method: 'POST' });
        if (stopped) return;
        const socket = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
        ws = socket;
        socket.onmessage = (message) => {
          let event: PanelEvent;
          try {
            event = JSON.parse(String(message.data)) as PanelEvent;
          } catch {
            return;
          }
          if (event.type === 'ready') {
            attempt = 0;
            setStatus('live');
          }
          listeners.current.forEach((fn) => fn(event));
        };
        socket.onclose = () => {
          if (ws === socket) ws = null;
          schedule();
        };
      } catch {
        schedule();
      }
    }

    // Ao voltar para a aba depois de um tempo, tenta na hora em vez de esperar o próximo intervalo.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !ws && !stopped) {
        clearTimeout(timer);
        attempt = 0;
        void connect();
      }
    };

    void connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [slug, url]);

  const value: LiveContextValue = {
    status,
    subscribe: (fn) => {
      listeners.current.add(fn);
      return () => listeners.current.delete(fn);
    },
  };
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLiveStatus(): LiveStatus {
  return useContext(LiveContext)?.status ?? 'offline';
}

/** Executa `fn` a cada evento ao vivo (a função mais recente é sempre a usada). */
export function useLiveEvents(fn: Listener): void {
  const ctx = useContext(LiveContext);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => ctx?.subscribe((e) => latest.current(e)), [ctx]);
}

/** Intervalo de consulta de segurança: rápido sem conexão ao vivo, lento com ela. */
export function usePollingInterval(): number {
  return useLiveStatus() === 'live' ? 60_000 : 5_000;
}
