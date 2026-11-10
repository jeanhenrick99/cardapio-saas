import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { twoColumns, wrap } from './layout';

describe('wrap', () => {
  it('quebra por palavras respeitando a largura', () => {
    assert.deepEqual(wrap('X-Burguer duplo com bacon', 12), ['X-Burguer', 'duplo com', 'bacon']);
  });

  it('aplica recuo nas linhas de continuação', () => {
    const lines = wrap('2x Pizza grande meio a meio', 12, '   ');
    assert.deepEqual(lines, ['2x Pizza', '   grande', '   meio a', '   meio']);
    for (const l of lines) assert.ok(l.length <= 12);
  });

  it('corta palavras maiores que a largura', () => {
    assert.deepEqual(wrap('Supercalifragilistico', 8), ['Supercal', 'ifragili', 'stico']);
  });

  it('texto vazio não gera linhas', () => {
    assert.deepEqual(wrap('   ', 10), []);
  });
});

describe('twoColumns', () => {
  it('alinha o valor à direita na largura total', () => {
    const [line] = twoColumns('2x Coca', 'R$ 10,00', 20);
    assert.equal(line, '2x Coca     R$ 10,00');
    assert.equal(line?.length, 20);
  });

  it('quebra o texto da esquerda sem invadir o valor', () => {
    const lines = twoColumns('1x Hambúrguer artesanal da casa', 'R$ 39,90', 24, '   ');
    assert.equal(lines[0], '1x Hambúrguer   R$ 39,90');
    for (const l of lines) assert.ok(l.length <= 24);
  });
});
