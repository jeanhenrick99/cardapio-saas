const time = () => new Date().toLocaleTimeString('pt-BR', { hour12: false });

export const log = {
  info: (msg: string) => console.log(`[${time()}] ${msg}`),
  warn: (msg: string) => console.warn(`[${time()}] ⚠ ${msg}`),
  error: (msg: string) => console.error(`[${time()}] ✖ ${msg}`),
};
