/**
 * Impressoras térmicas não entendem UTF-8: elas usam "code pages" de 1 byte.
 * A CP860 (Português) tem todos os acentos que usamos. Sem essa conversão,
 * "Pão" sai impresso como "PÃ£o".
 */
const CP860: Record<string, number> = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ã': 0x84, 'à': 0x85, 'Á': 0x86, 'ç': 0x87,
  'ê': 0x88, 'Ê': 0x89, 'è': 0x8a, 'Í': 0x8b, 'Ô': 0x8c, 'ì': 0x8d, 'Ã': 0x8e, 'Â': 0x8f,
  'É': 0x90, 'À': 0x91, 'È': 0x92, 'ô': 0x93, 'õ': 0x94, 'ò': 0x95, 'Ú': 0x96, 'ù': 0x97,
  'Ì': 0x98, 'Õ': 0x99, 'Ü': 0x9a, '¢': 0x9b, '£': 0x9c, 'Ù': 0x9d, 'Ó': 0x9f,
  'á': 0xa0, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5, 'ª': 0xa6, 'º': 0xa7,
  'Ò': 0xa9, '°': 0xf8,
};

/** Substituições para caracteres comuns que não existem na CP860. */
const FALLBACK: Record<string, string> = {
  ' ': ' ', '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '·': '-', '•': '*',
};

export const CP860_ESCPOS_TABLE = 3; // número da tabela no comando ESC t (padrão Epson)

export function encodeCp860(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text.normalize('NFC')) {
    const code = ch.codePointAt(0) ?? 0x3f;
    if (code >= 0x20 && code < 0x7f) bytes.push(code);
    else if (ch === '\n') bytes.push(0x0a);
    else if (CP860[ch] !== undefined) bytes.push(CP860[ch]);
    else {
      // Tenta remover o acento (ex.: "ő" → "o"); senão, imprime "?".
      const ascii = FALLBACK[ch] ?? ch.normalize('NFD').replace(/\p{M}/gu, '');
      for (const c of ascii) {
        const cc = c.codePointAt(0) ?? 0x3f;
        bytes.push(cc >= 0x20 && cc < 0x7f ? cc : 0x3f);
      }
    }
  }
  return Buffer.from(bytes);
}
