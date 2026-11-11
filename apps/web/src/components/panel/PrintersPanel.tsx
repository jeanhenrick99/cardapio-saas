'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client-api';
import { timeAgo } from '@/lib/panel';
import type { Agent, Role } from '@/lib/types';
import { usePolling } from '@/lib/use-polling';
import { card, primaryButton } from './styles';

export function PrintersPanel({ slug, role }: { slug: string; role: Role }) {
  const isOwner = role === 'OWNER';
  const { data: agents, refresh } = usePolling<Agent[]>(`/restaurants/${slug}/agents`, 10_000);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!pairing) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pairing]);

  // Quando um computador novo aparece depois de gerar o código, o código já foi usado.
  const [pairedName, setPairedName] = useState<string | null>(null);
  const [knownIds, setKnownIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!agents) return;
    if (pairing && knownIds) {
      const newcomer = agents.find((a) => !knownIds.has(a.id) && !a.revokedAt);
      if (newcomer) {
        setPairing(null);
        setPairedName(newcomer.name);
      }
    }
    setKnownIds(new Set(agents.map((a) => a.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage só a novas listas de agentes
  }, [agents]);

  const remaining = pairing ? Math.max(0, new Date(pairing.expiresAt).getTime() - now) : 0;
  const expired = pairing !== null && remaining === 0;

  async function generateCode() {
    setError(null);
    setPairedName(null);
    try {
      setPairing(await api(`/restaurants/${slug}/pairing-codes`, { method: 'POST' }));
      setNow(Date.now());
      void refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível gerar o código.');
    }
  }

  async function revoke(agent: Agent) {
    if (!window.confirm(`Revogar o acesso de "${agent.name}"? Ele será desconectado e precisará ser pareado de novo.`)) return;
    try {
      await api(`/restaurants/${slug}/agents/${agent.id}`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível revogar.');
    }
  }

  const active = agents?.filter((a) => !a.revokedAt) ?? [];
  const revoked = agents?.filter((a) => a.revokedAt) ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Impressoras</h1>
        <p className="text-sm text-muted">
          O agente de impressão roda no computador do restaurante e imprime os pedidos na cozinha, no bar e no caixa.
        </p>
      </div>

      {isOwner && (
        <div className={card}>
          <h2 className="font-semibold">Conectar um novo computador</h2>
          {pairedName && (
            <p role="status" className="mt-3 rounded-xl px-4 py-3 text-sm text-emerald-300 ring-1 ring-emerald-700/70">
              ✓ &quot;{pairedName}&quot; foi conectado com sucesso.
            </p>
          )}
          {!pairing || expired ? (
            <>
              <p className="mt-1 text-sm text-muted">Gere um código e digite-o no agente. O código vale 10 minutos e só pode ser usado uma vez.</p>
              <button onClick={generateCode} className={`${primaryButton} mt-4`}>
                {expired ? 'Gerar novo código' : 'Gerar código de pareamento'}
              </button>
            </>
          ) : (
            <div className="mt-3 text-center">
              <div className="font-mono text-5xl font-bold tracking-[0.2em] text-gold" aria-label={`Código ${pairing.code.split('').join(' ')}`}>
                {pairing.code}
              </div>
              <p className="mt-2 text-sm text-muted">
                Expira em {Math.floor(remaining / 60000)}:{String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}
              </p>
              <p className="mt-4 text-sm">No computador do restaurante, rode:</p>
              <code className="mt-2 inline-block rounded-lg bg-surface-2 px-3 py-2 text-sm text-gold-soft ring-1 ring-line">
                npm run pair -- {pairing.code}
              </code>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-wine-deep px-4 py-3 text-sm text-red-200 ring-1 ring-wine-hover/60">
          {error}
        </p>
      )}

      <div className={card}>
        <h2 className="mb-3 font-semibold">Computadores conectados</h2>
        {agents === null ? (
          <p className="text-sm text-muted">Carregando...</p>
        ) : active.length === 0 ? (
          <p className="text-sm text-muted">Nenhum agente pareado ainda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {active.map((agent) => (
              <li key={agent.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className={`h-2.5 w-2.5 rounded-full ${agent.online ? 'bg-emerald-400' : 'bg-muted/50'}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{agent.name}</div>
                  <div className="text-xs text-muted">
                    {agent.online ? 'Online' : agent.lastSeenAt ? `Offline · visto ${timeAgo(agent.lastSeenAt)}` : 'Nunca conectou'}
                    {agent.printers.length > 0 && ` · ${agent.printers.join(', ')}`}
                    {agent.version && ` · v${agent.version}`}
                  </div>
                </div>
                {isOwner && (
                  <button onClick={() => void revoke(agent)} className="text-sm text-red-300 hover:text-red-200">
                    Revogar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {revoked.length > 0 && <p className="mt-3 text-xs text-muted">{revoked.length} agente(s) revogado(s) anteriormente.</p>}
      </div>
    </div>
  );
}
