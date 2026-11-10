# 🍔 Cardápio SaaS

Plataforma de cardápio digital e pedidos para restaurantes, com **impressão automática na cozinha** via um agente local que fala ESC/POS direto com as impressoras térmicas.

> 🚧 Em desenvolvimento. Esta primeira etapa entrega o **núcleo de impressão**: um pedido criado na nuvem sai impresso na impressora certa, sem diálogo de impressão, com fila persistente, reconexão automática e garantia de não imprimir duas vezes.

## Como funciona

```
[Cliente pede no celular]
        │
        ▼
┌──────────── Nuvem (apps/api) ─────────┐        ┌─── PC do restaurante (apps/print-agent) ───┐
│  POST /orders                         │        │                                            │
│     │                                 │  WSS   │  Conexão (hello → welcome, heartbeat)      │
│  Jobs de impressão ── print_job ──────┼───────▶│  Fila SQLite (idempotente por jobId)       │
│     ▲                                 │        │  Roteamento por setor                      │
│     └──────────────── ack ────────────┼────────│  Layout → ESC/POS (CP860)                  │
└───────────────────────────────────────┘        └───────┬───────────────┬──────────────┬─────┘
                                                         ▼               ▼              ▼
                                                    🖨️ Cozinha        🖨️ Bar        🖨️ Caixa
```

O navegador não consegue imprimir em silêncio numa térmica, e a nuvem não enxerga a rede local do restaurante. Por isso um **agente** roda no PC do restaurante, mantém uma conexão WebSocket de saída com o servidor (funciona atrás de qualquer roteador/NAT) e conversa com as impressoras.

## Estrutura

```
apps/
  print-agent/   Agente de impressão (Node + TypeScript)
  api/           Servidor de desenvolvimento que simula a nuvem
packages/
  shared/        Tipos do pedido e do protocolo, validados com Zod
```

## Rodando

Requisitos: **Node.js 22.13+** (usa o módulo nativo `node:sqlite` e o `WebSocket` global).

```bash
npm install
```

Em um terminal, suba o servidor:

```bash
npm run dev:api
```

Em outro, suba o agente (usa `agent.config.example.json` se não houver `agent.config.json`):

```bash
npm run dev:agent
```

Agora crie pedidos: pressione **ENTER** no terminal do servidor, ou:

```bash
curl -X POST localhost:8080/orders
```

Os cupons aparecem no terminal do agente e ficam salvos em `apps/print-agent/output/` como `.txt` (prévia) e `.bin` (bytes ESC/POS reais).

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm test` | Roda os testes (Node test runner) |
| `npm run typecheck` | Checa os tipos de todos os pacotes |
| `npm run test-print` | Imprime um cupom de teste em todas as impressoras, sem servidor |
| `curl localhost:8080/jobs` | Lista os jobs e o status de cada impressora |

## Decisões técnicas

**Garantia de entrega sem duplicidade.** Cada job tem um `jobId` estável. O servidor reenvia tudo que não foi confirmado quando o agente reconecta; o agente grava o job no SQLite *antes* de imprimir e ignora `jobId` repetido (só reenvia a confirmação). Resultado: entrega *at-least-once* com impressão *exactly-once*.

**Fila persistente local.** Se o PC desligar ou a impressora ficar sem papel, nada se perde. Cada impressora tem sua linha na fila, com retentativas e backoff exponencial; uma impressora com problema não trava as outras.

**Outbox de confirmações.** Se a internet cair depois de imprimir, o ACK fica guardado e é enviado na próxima conexão.

**Roteamento por setor.** Cada item do pedido tem um `sector` (`cozinha`, `bar`...). Cada impressora declara os setores que recebe; `"*"` recebe tudo (ex.: via de conferência do caixa, com preços).

**O servidor envia o pedido, não o cupom.** O agente monta o layout a partir do JSON do pedido. Isso deixa o protocolo pequeno e permite adaptar o layout à largura de cada impressora (32 colunas em papel 58 mm, 48 colunas em 80 mm).

**ESC/POS escrito à mão.** Sem biblioteca de impressão: os comandos (`ESC @`, `ESC a`, `GS !`, `GS V`...) estão em [`escpos/encoder.ts`](apps/print-agent/src/escpos/encoder.ts). Impressoras térmicas não entendem UTF-8, então o texto é convertido para a **code page 860 (Português)**. Sem isso, "Pão" sai impresso como "PÃ£o".

**Dinheiro em centavos.** Todos os valores são inteiros (`unitPriceCents`), evitando erros de ponto flutuante.

**Conexão resiliente.** Autenticação por token na primeira mensagem, heartbeat a cada 15 s e reconexão com backoff exponencial + jitter (até 30 s), para que vários agentes não reconectem todos ao mesmo tempo.

## Configurando impressoras reais

Copie o exemplo e edite:

```bash
cp apps/print-agent/agent.config.example.json apps/print-agent/agent.config.json
```

Impressora de rede (Ethernet/Wi-Fi, porta RAW 9100):

```json
{
  "name": "cozinha",
  "type": "network",
  "host": "192.168.0.50",
  "port": 9100,
  "columns": 48,
  "sectors": ["cozinha"]
}
```

A impressora virtual aceita `"failureRate": 0.5` para simular falhas e ver as retentativas funcionando.

## Protocolo

| Direção | Mensagem | Quando |
|---|---|---|
| agente → servidor | `hello` | Ao conectar, com token e lista de impressoras |
| servidor → agente | `welcome` | Token aceito |
| servidor → agente | `print_job` | Novo pedido (`jobId` + pedido) |
| agente → servidor | `ack` | Job finalizado, com o resultado por impressora |
| agente → servidor | `heartbeat` | A cada 15 s |

Os schemas ficam em [`packages/shared/src/protocol.ts`](packages/shared/src/protocol.ts).

## Roadmap

- [x] Agente com impressora virtual e de rede
- [x] Fila SQLite, ACK, idempotência e retentativas
- [x] Conexão WebSocket com reconexão automática
- [x] Roteamento por setor
- [ ] Pareamento do agente por código (sem token manual)
- [ ] Impressoras USB e Bluetooth
- [ ] Instalador `.exe` com ícone na bandeja e "imprimir teste"
- [ ] API real (Postgres, multi-tenant, autenticação)
- [ ] Painel do restaurante com status das impressoras em tempo real
- [ ] Cardápio do cliente com QR Code na mesa
- [ ] Painel da cozinha (KDS)
- [ ] Pagamento Pix
