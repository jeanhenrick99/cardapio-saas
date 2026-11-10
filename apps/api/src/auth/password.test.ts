import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password';

describe('senhas', () => {
  it('verifica a senha correta e recusa a errada', async () => {
    const hash = await hashPassword('senha-forte-123');
    assert.ok(await verifyPassword('senha-forte-123', hash));
    assert.ok(!(await verifyPassword('senha-forte-124', hash)));
  });

  it('usa salt aleatório: mesma senha gera hashes diferentes', async () => {
    const [a, b] = await Promise.all([hashPassword('igual'), hashPassword('igual')]);
    assert.notEqual(a, b);
    assert.match(a, /^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it('não guarda a senha em texto puro', async () => {
    assert.ok(!(await hashPassword('minha-senha')).includes('minha-senha'));
  });

  it('recusa hashes malformados sem lançar erro', async () => {
    assert.equal(await verifyPassword('x', 'md5$abc'), false);
    assert.equal(await verifyPassword('x', ''), false);
  });

  it('verificação falsa sempre retorna false', async () => {
    assert.equal(await verifyAgainstDummy('qualquer'), false);
  });
});
