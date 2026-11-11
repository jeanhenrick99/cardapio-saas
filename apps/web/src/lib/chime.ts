/**
 * Campainha de "pedido novo" gerada com Web Audio (sem arquivo de som).
 * Os navegadores só liberam áudio depois de um clique na página,
 * por isso o AudioContext é criado/retomado a partir de um clique do usuário.
 */
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

export function playChime(): void {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  // Duas notas suaves (Mi e Lá), como uma campainha de balcão.
  [659.25, 880].forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(start);
    osc.stop(start + 0.65);
  });
}
