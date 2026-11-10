import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encodeEscPos } from './encoder';

describe('encodeEscPos', () => {
  const bytes = encodeEscPos({
    columns: 32,
    lines: [{ kind: 'text', text: 'Olá', align: 'center', bold: true, size: 2 }, { kind: 'cut' }],
  });

  it('inicia a impressora e seleciona a CP860', () => {
    assert.deepEqual([...bytes.subarray(0, 5)], [0x1b, 0x40, 0x1b, 0x74, 3]);
  });

  it('gera alinhamento, negrito, tamanho, texto e corte', () => {
    assert.deepEqual(
      [...bytes.subarray(5)],
      [0x1b, 0x61, 1, 0x1b, 0x45, 1, 0x1d, 0x21, 0x11, 0x4f, 0x6c, 0xa0, 0x0a, 0x1d, 0x56, 0x42, 0x00],
    );
  });
});
