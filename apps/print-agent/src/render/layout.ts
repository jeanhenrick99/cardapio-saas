/**
 * Quebra um texto em linhas de no máximo `width` caracteres.
 * Linhas de continuação recebem `indent` na frente. Palavras maiores
 * que a largura são cortadas.
 */
export function wrap(text: string, width: number, indent = ''): string[] {
  if (width <= indent.length) throw new Error(`Largura ${width} pequena demais para o recuo`);
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  const limit = () => (lines.length === 0 ? width : width - indent.length);

  for (let word of words) {
    while (word.length > limit()) {
      if (current) {
        lines.push(current);
        current = '';
      }
      const room = limit();
      lines.push(word.slice(0, room));
      word = word.slice(room);
    }
    if (!word) continue;
    if (!current) current = word;
    else if (current.length + 1 + word.length <= limit()) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.map((line, i) => (i === 0 ? line : indent + line));
}

/** Texto à esquerda e valor alinhado à direita na primeira linha: "2x X-Burguer ...... R$ 50,00". */
export function twoColumns(left: string, right: string, width: number, indent = ''): string[] {
  const leftWidth = width - right.length - 1;
  if (leftWidth < 8) return [...wrap(left, width, indent), right.padStart(width)];
  const lines = wrap(left, leftWidth, indent);
  const first = lines[0] ?? '';
  return [`${first.padEnd(leftWidth)} ${right}`, ...lines.slice(1)];
}
