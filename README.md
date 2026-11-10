# 🍔 Cardápio SaaS

Plataforma de cardápio digital e pedidos para restaurantes, com **impressão automática na cozinha** via um agente local que fala ESC/POS direto com as impressoras térmicas.

> 🚧 Em desenvolvimento. Já funciona: API multi-restaurante com PostgreSQL, **pareamento do agente por código** e impressão com fila persistente, reconexão automática e garantia de não imprimir duas vezes.

## Como funciona

```
[Cliente pede no celular]
        │
        ▼
┌───────────── Nuvem (apps/api) ─────────────┐        ┌─── PC do restaurante (apps/print-agent) ───┐
│  Fastify + Prisma + PostgreSQL             │        │                                            │
│                                            │  WSS   │  Conexão (hello → welcome, heartbeat)      │
│  orders ─▶ print_jobs ── print_job ────────┼───────▶│  Fila SQLite (idempotente por jobId)       │
│                ▲                           │        │  Roteamento por setor                      │
│                └──────────── ack ──────────┼────────│  Layout → ESC/POS (CP860)                  │
└────────────────────────────────────────────┘        └───────┬───────────────┬──────────────┬─────┘
                                                              ▼               ▼              ▼
                                                         🖨️ Cozinha        🖨️ Bar        🖨️ Caixa
```

O navegador não consegue imprimir em silêncio numa térmica, e a nuvem não enxerga a rede local do restaurante. Por isso um **agente** roda no PC do restaurante, mantém uma conexão WebSocket de saída com o servidor (funciona atrás de qualquer roteador/NAT) e conversa com as impressoras.

## Estrutura

```
apps/
  api/           API: Fastify, Prisma, PostgreSQL e o hub WebSocket dos agentes
  print-agent/   Agente de impressão (Node + TypeScript)
packages/
  shared/        Tipos do pedido e do protocolo, validados com Zod
```

## Rodando

Requisitos: **Node.js 22.13+** e **Docker**.

```bash
npm install
```

```bash
cp apps/api/.env.example apps/api/.env
```

Suba o PostgreSQL, crie as tabelas e o restaurante de demonstração:

```bash
npm run db:up
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Em um terminal, suba a API:

```bash
npm run dev:api
```

### Pareando o agente

Gere um código de pareamento para o restaurante `demo` (vale por 10 minutos e só pode ser usado uma vez):

```bash
curl -X POST -H "authorization: Bearer dev-admin" localhost:8080/restaurants/demo/pairing-codes
```

Use o código retornado (ex.: `K7P-2QX`) para parear o agente:

```bash
npm run pair -- K7P-2QX
```

Em outro terminal, suba o agente:

```bash
npm run dev:agent
```

Agora crie pedidos e veja os cupons saindo no terminal do agente (e em `apps/print-agent/output/`):

```bash
npm run order
```

### Comandos

| Comando | O que faz |
|---|---|
| `npm run db:up` / `db:down` | Sobe/derruba o PostgreSQL no Docker |
| `npm run db:migrate` | Aplica as migrations do Prisma |
| `npm run db:studio` | Abre o Prisma Studio para ver os dados |
| `npm run order` | Cria um pedido aleatório no restaurante `demo` |
| `npm run pair -- CODIGO` | Pareia o agente (use `--force` para parear de novo) |
| `npm run test-print` | Imprime um cupom de teste em todas as impressoras, sem servidor |
| `npm test` | Roda os testes (Node test runner) |
| `npm run typecheck` | Checa os tipos de todos os pacotes |

## API

Rotas em `/restaurants/*` exigem `Authorization: Bearer <ADMIN_TOKEN>` (provisório, até existir login no painel).

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Status da API e do banco |
| `POST` | `/restaurants` | Cria um restaurante (`name`, `slug`) |
| `POST` | `/restaurants/:slug/orders` | Cria um pedido e o envia para impressão (sem corpo = pedido aleatório) |
| `GET` | `/restaurants/:slug/print-jobs` | Últimos 50 jobs com o resultado por impressora |
| `POST` | `/restaurants/:slug/pairing-codes` | Gera um código de pareamento |
| `GET` | `/restaurants/:slug/agents` | Agentes pareados e se estão online |
| `DELETE` | `/restaurants/:slug/agents/:id` | Revoga um agente e o desconecta na hora |
| `POST` | `/agents/pair` | Troca o código por um token (público, com limite de tentativas) |
| `WS` | `/agent` | Conexão dos agentes |

## Decisões técnicas

**Garantia de entrega sem duplicidade.** Cada pedido gera um `print_job` no banco, na mesma transação. O servidor reenvia tudo que está `QUEUED`/`SENT` quando o agente conecta; o agente grava o job no SQLite *antes* de imprimir e ignora `jobId` repetido (só reenvia a confirmação). Resultado: entrega *at-least-once* com impressão *exactly-once*.

**Sem condição de corrida no status.** O job é marcado como `SENT` *antes* de ser enviado, e só se ainda estiver pendente. O agente imprime em milissegundos, e um `SENT` gravado depois do ACK sobrescreveria o `PRINTED`.

**Numeração de pedidos segura.** O número (`#0042`) vem de um incremento atômico no restaurante dentro da transação, então dois pedidos simultâneos nunca recebem o mesmo número.

**Pareamento por código.** O dono gera um código curto (`K7P-2QX`, sem caracteres ambíguos como 0/O e 1/I), que vale 10 minutos e é consumido de forma atômica. O agente troca o código por um token longo, salvo em `data/credentials.json` com permissão `600`.

**Tokens nunca em texto puro.** O banco guarda só o hash SHA-256 do token do agente e do código de pareamento. Se o banco vazar, as credenciais não vazam. A comparação do token de admin é feita em tempo constante.

**Multi-tenant por construção.** O agente autenticado só enxerga e confirma jobs do próprio restaurante: todo `UPDATE` de ACK filtra por `restaurantId`.

**Revogação imediata.** Revogar um agente o desconecta na hora; ele para de tentar reconectar e orienta a parear de novo.

**Fila persistente local.** Se o PC desligar ou a impressora ficar sem papel, nada se perde. Cada impressora tem sua linha na fila, com retentativas e backoff exponencial; uma impressora com problema não trava as outras.

**Roteamento por setor.** Cada item do pedido tem um `sector` (`cozinha`, `bar`...). Cada impressora declara os setores que recebe; `"*"` recebe tudo (ex.: via de conferência do caixa, com preços).

**ESC/POS escrito à mão.** Sem biblioteca de impressão: os comandos (`ESC @`, `ESC a`, `GS !`, `GS V`...) estão em [`escpos/encoder.ts`](apps/print-agent/src/escpos/encoder.ts). Impressoras térmicas não entendem UTF-8, então o texto é convertido para a **code page 860 (Português)**. Sem isso, "Pão" sai impresso como "PÃ£o".

**Dinheiro em centavos.** Todos os valores são inteiros (`unitPriceCents`), evitando erros de ponto flutuante.

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

## Protocolo do agente

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
- [x] API com PostgreSQL, multi-restaurante
- [x] Pareamento do agente por código e revogação
- [ ] Login de usuários (dono do restaurante) no lugar do token de admin
- [ ] Cadastro do cardápio (categorias, produtos, complementos)
- [ ] Painel do restaurante com status das impressoras em tempo real
- [ ] Cardápio do cliente com QR Code na mesa
- [ ] Painel da cozinha (KDS)
- [ ] Impressoras USB e Bluetooth
- [ ] Instalador `.exe` com ícone na bandeja
- [ ] Pagamento Pix
