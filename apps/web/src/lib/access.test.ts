import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { accessFromSession } from './access';
import type { Me } from './types';

const me = (over: Partial<Me> = {}): Me => ({
  id: 'u1',
  email: 'a@b.dev',
  username: null,
  name: 'Fulano',
  isPlatformAdmin: false,
  restaurants: [
    { id: 'r1', name: 'Pizzaria', slug: 'pizzaria', role: 'OWNER' },
    { id: 'r2', name: 'Bar', slug: 'bar', role: 'STAFF' },
  ],
  ...over,
});

describe('accessFromSession', () => {
  it('membro entra com o próprio papel', () => {
    assert.deepEqual(accessFromSession(me(), 'pizzaria'), { name: 'Pizzaria', role: 'OWNER', support: false });
    assert.deepEqual(accessFromSession(me(), 'bar'), { name: 'Bar', role: 'STAFF', support: false });
  });

  it('quem não é membro não tem acesso', () => {
    assert.equal(accessFromSession(me(), 'outro'), null);
  });

  it('administrador da plataforma fora da equipe entra em modo suporte (nunca como funcionário)', () => {
    assert.equal(accessFromSession(me({ isPlatformAdmin: true, restaurants: [] }), 'pizzaria'), 'support');
  });

  it('administrador que também é membro usa o papel de membro, sem modo suporte', () => {
    assert.deepEqual(accessFromSession(me({ isPlatformAdmin: true }), 'bar'), { name: 'Bar', role: 'STAFF', support: false });
  });
});
