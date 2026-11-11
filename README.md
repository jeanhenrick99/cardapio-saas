# 🍽️ Bistroo

[![CI](https://github.com/jeanhenrick99/cardapio-saas/actions/workflows/ci.yml/badge.svg)](https://github.com/jeanhenrick99/cardapio-saas/actions/workflows/ci.yml)

**Bistroo** é uma plataforma de cardápio digital e pedidos para restaurantes, com **impressão automática na cozinha** via um agente local que fala ESC/POS direto com as impressoras térmicas.

> 🚧 Em desenvolvimento. Já funciona: **cardápio web para o cliente pedir pelo celular** (mesa, retirada ou delivery), **retaguarda** (cardápio, loja, impressoras, QR Codes) e **PDV** separados (mesas e comandas com conta aberta e fechamento, lançamento de pedidos e Kanban de delivery em tempo real), API multi-restaurante com PostgreSQL, **cardápio com complementos** (ex.: "escolha até 2 sabores"), **pedido público com preço calculado no servidor**, **login com papéis (dono/funcionário)**, **pareamento do agente por código** e impressão com fila persistente, reconexão automática e garantia de não imprimir duas vezes.

## Demo ao vivo

| | Link |
|---|---|
| 📱 Cardápio do cliente (mesa 7) | **https://bistroo-menu-chi.vercel.app/r/demo?mesa=7** |
| 🧑‍🍳 Retaguarda e PDV | **https://bistroo-menu-chi.vercel.app/login** → *Entrar como dono* ou *Entrar como garçom* |

> O primeiro acesso pode levar ~1 minuto: a API roda no plano gratuito do Render e "dorme" sem uso.
> Hospedagem: Vercel (site) + Render (API) + Neon (PostgreSQL). Veja o [guia de deploy](DEPLOY.md).

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
  web/           Cardápio do cliente e painel do restaurante: Next.js 16, React 19 e Tailwind CSS 4
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

Suba o PostgreSQL, crie as tabelas e os dados de demonstração (restaurante `demo` com um cardápio de 11 produtos, e o usuário `demo@cardapio.dev` / senha `demo12345`):

```bash
npm run db:up
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Agora suba tudo de uma vez (banco, API e site, no mesmo terminal):

```bash
npm run dev
```

Abra **http://localhost:3000/r/demo?mesa=7** e faça um pedido como cliente da mesa 7 (sem `?mesa=`, o cliente escolhe retirada ou delivery).

> 📱 **Para testar no celular:** conecte-o no mesmo Wi-Fi e abra o endereço "Network" que o Next mostra ao iniciar (ex.: `http://192.168.0.10:3000/r/demo?mesa=7`). É exatamente o link que iria no QR Code da mesa.

### Retaguarda e PDV

Abra **http://localhost:3000/login** e escolha uma conta de demonstração:

| Conta | E-mail / senha | O que vê |
|---|---|---|
| **Dono** | `demo@cardapio.dev` / `demo12345` | Retaguarda + PDV |
| **Garçom** | `garcom@cardapio.dev` / `demo12345` | Só o PDV |

O sistema tem duas áreas, como nos sistemas de restaurante:

**Retaguarda** (`/painel/<restaurante>`, só o dono): configurar e acompanhar o negócio. Menu lateral com busca (**Ctrl+K**) e seções recolhíveis (no celular vira gaveta), barra superior com o status da loja e o botão **Abrir PDV**.

- **Início**: pedidos, faturamento e ticket médio do dia, mais atalhos que avisam o que precisa de atenção (loja fechada, impressora offline com pedidos esperando)
- **Histórico de pedidos**: os pedidos chegam **na hora** (WebSocket), com destaque para os novos, campainha opcional, contador no título da aba e o status da impressão de cada um
- **Cardápio**: categorias (criar, renomear, reordenar, ocultar), produtos com preço, setor de impressão, foto, destaque e complementos (grupos com mínimo e máximo), e um botão rápido de esgotado/disponível
- **Loja**: abrir/fechar para pedidos, tempos de retirada e entrega, pedido mínimo do delivery, quantidade de mesas, taxa de serviço, logo e capa
- **QR Codes das mesas**: gera uma folha para imprimir (A4) com um QR Code por mesa, cada um levando a `/r/<restaurante>?mesa=N`, mais um QR geral para retirada/delivery. Cada QR também pode ser baixado em SVG. Avisa quando o endereço é `localhost` (não abre no celular)
- **Impressoras**: computadores conectados (online/offline), geração do código de pareamento e revogação

**PDV** (`/pdv/<restaurante>`, dono e equipe): a operação durante o expediente, em tela cheia com duas abas grandes, **Mesas e comandas** e **Delivery e balcão** (pensado para tablet ou monitor no balcão). Funcionário que entra é levado direto para cá e não acessa a retaguarda; o dono tem o botão **Retaguarda** para voltar.

- **Mesas e comandas** (mesma tela). **Mesas**: grade com as mesas cadastradas na Loja. Mesa livre ou ocupada, com o consumo e há quanto tempo está aberta. Tocar numa mesa abre a **conta**: o primeiro lançamento abre a conta, os seguintes somam nela, e o pedido que o cliente faz pelo **QR Code da mesa** entra na mesma conta, ao vivo
- **Comandas**: mesma ideia, para o cartão/comanda individual: digite o número para abrir. O cliente não abre comanda pelo cardápio online, só a equipe
- **Fechar conta**: resumo do consumo (pedidos cancelados não entram), taxa de serviço opcional (10% por padrão, configurável), desconto e forma de pagamento. A mesa fica livre e as contas fechadas nas últimas 12 h aparecem abaixo da grade
- **Disponibilidade**: no catálogo do PDV, a equipe marca um produto como **esgotado** com um toque, e ele some do cardápio do cliente na hora
- **Novo pedido** (botão no quadro de Delivery e balcão): pedidos de balcão (retirada) e telefone (delivery). Busca com `/` e Enter, produto sem complementos entra com um toque, e o telefone de um cliente que já pediu preenche nome e endereço. O pedido sai marcado como "PDV · lançado por <funcionário>" no painel e no cupom. "Loja fechada" e pedido mínimo valem só para o cardápio online
- **Delivery e balcão**: quadro **Kanban** (Recebido → Em preparo → Pronto → Saiu para entrega → Concluído). No computador, arraste os cards; no celular, use os botões de cada pedido. Mostra há quanto tempo o pedido espera (alerta aos 30 e aos 45 min) e atualiza ao vivo para toda a equipe

O funcionário (`STAFF`) acessa só o PDV. Cardápio, loja, impressoras e faturamento ficam na retaguarda, com o dono.

### Pareando o agente

Gere um código de pareamento na aba **Impressoras** do painel, ou pelo terminal (vale por 10 minutos e só pode ser usado uma vez):

```bash
npm run pairing-code
```

Use o código retornado (ex.: `K7P-2QX`) para parear o agente:

```bash
npm run pair -- K7P-2QX
```

Em outro terminal, suba o agente:

```bash
npm run dev:agent
```

Agora faça pedidos como um cliente faria: o script lê o cardápio público, monta um carrinho aleatório respeitando as regras dos complementos e envia. Os cupons aparecem no terminal do agente (e em `apps/print-agent/output/`):

```bash
npm run order
```

### Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o PostgreSQL, a API (porta 8080) e o site (porta 3000) juntos |
| `npm run dev:api` / `dev:web` / `dev:agent` | Sobe cada parte separadamente |
| `npm run db:up` / `db:down` | Sobe/derruba o PostgreSQL no Docker |
| `npm run db:migrate` | Aplica as migrations do Prisma |
| `npm run db:studio` | Abre o Prisma Studio para ver os dados |
| `npm run order` | Faz um pedido aleatório pelo cardápio público do restaurante `demo` |
| `npm run pairing-code` | Gera um código de pareamento para o restaurante `demo` |
| `npm run pair -- CODIGO` | Pareia o agente (use `--force` para parear de novo) |
| `npm run test-print` | Imprime um cupom de teste em todas as impressoras, sem servidor |
| `npm test` | Testes unitários (Node test runner) |
| `npm run test:integration` | Testes da API contra um PostgreSQL real (banco `cardapio_test`) |
| `npm run typecheck` | Checa os tipos de todos os pacotes |

## API

A sessão vai num cookie `httpOnly` (navegador) ou no header `Authorization: Bearer <token>` (scripts, apps, curl). Rotas de restaurante exigem que o usuário seja membro dele; algumas só o dono (**OWNER**) pode usar.

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/health` | público | Status da API e do banco |
| `POST` | `/auth/signup` | público | Cadastra o dono e o primeiro restaurante, já logado |
| `POST` | `/auth/login` | público | Login por e-mail e senha (com limite de tentativas) |
| `POST` | `/auth/logout` | logado | Encerra a sessão |
| `GET` | `/auth/me` | logado | Usuário e restaurantes dos quais é membro |
| `POST` | `/restaurants` | logado | Cria mais um restaurante (o usuário vira dono) |
| `GET` | `/public/restaurants/:slug/menu` | público | Cardápio para o cliente (só itens ativos) |
| `POST` | `/public/restaurants/:slug/orders` | público | Pedido do cliente: envia só IDs e quantidades, o servidor calcula o total |
| `GET` | `/restaurants/:slug/menu` | membro | Cardápio completo, incluindo itens desativados |
| `POST` / `PATCH` / `DELETE` | `/restaurants/:slug/categories[/:id]` | dono | Gerencia categorias |
| `POST` / `PUT` / `DELETE` | `/restaurants/:slug/products[/:id]` | dono | Gerencia produtos e seus complementos |
| `PATCH` | `/restaurants/:slug/products/:id/availability` | membro | Marca como esgotado ou disponível |
| `POST` | `/restaurants/:slug/orders` | membro | Pedido lançado pela equipe (balcão, telefone), com preços do cardápio |
| `GET` | `/restaurants/:slug/print-jobs` | membro | Últimos 50 jobs com o resultado por impressora |
| `GET` | `/restaurants/:slug/agents` | membro | Agentes pareados e se estão online |
| `POST` | `/restaurants/:slug/pairing-codes` | dono | Gera um código de pareamento |
| `DELETE` | `/restaurants/:slug/agents/:id` | dono | Revoga um agente e o desconecta na hora |
| `POST` | `/agents/pair` | público | Troca o código por um token (com limite de tentativas) |
| `WS` | `/agent` | token do agente | Conexão dos agentes |

Exemplo com curl:

```bash
TOKEN=$(curl -s -X POST localhost:8080/auth/login -H 'content-type: application/json' -d '{"email":"demo@cardapio.dev","password":"demo12345"}' | jq -r .token)
```

```bash
curl -H "authorization: Bearer $TOKEN" localhost:8080/restaurants/demo/menu
```

## Decisões técnicas

**O cliente nunca define o preço.** O carrinho envia só `productId`, `quantity` e `optionIds`. O servidor busca os preços no banco (sempre filtrando pelo restaurante do pedido) e valida as regras de cada grupo de complementos: mínimo e máximo de escolhas, opção desativada, opção de outro produto. A regra fica em uma função pura ([`menu/pricing.ts`](apps/api/src/menu/pricing.ts)), testada sem banco. Erros de regra de negócio voltam como **422** com uma mensagem que o cliente entende ("escolha pelo menos 1 em Ponto da carne").

**Painel em tempo real.** A API avisa o painel por WebSocket quando um pedido chega, quando a impressão é confirmada, quando um computador conecta/desconecta e quando a loja abre/fecha. Os avisos são só "sinais" (o painel recarrega os dados pela API), então nenhum dado do pedido trafega por esse canal. Como o painel conecta direto na API (outro domínio, sem o cookie de login), ele pede antes um **passe de uso único válido por 60 s** e conecta com ele. Cada restaurante só recebe os próprios avisos. Se a conexão cair, o painel mostra "Reconectando", volta a consultar a cada 5 s e reconecta com espera crescente (1 s, 2 s, 4 s... até 30 s). Testes de integração usam conexões WebSocket reais, inclusive um agente de impressão confirmando um pedido.

**Site e API no mesmo endereço.** O navegador chama `/api/*` no próprio site, e o Next repassa para a API ([`next.config.ts`](apps/web/next.config.ts)). Não precisa de CORS, e o cookie de sessão (que o painel vai usar) funciona com `SameSite=Lax`. O cardápio é carregado no servidor (React Server Component), então a página já chega pronta no celular.

**Carrinho que sobrevive a recarregar a página.** O carrinho fica salvo no celular (`localStorage`). Ao voltar, ele é conferido com o cardápio atual: itens que saíram são removidos e os preços são atualizados. A lógica do carrinho fica em funções puras ([`lib/cart.ts`](apps/web/src/lib/cart.ts)), testadas sem navegador. A interface valida mínimo e máximo dos complementos para dar resposta imediata ao cliente, mas quem decide é sempre o servidor.

**Etapas do pedido com regras compartilhadas.** O fluxo (delivery passa por "saiu para entrega"; retirada e mesa não; avançar ou voltar uma etapa; cancelar é definitivo) fica em [`order-status.ts`](packages/shared/src/order-status.ts), usado pela API para validar e pelo painel para mostrar só as colunas e botões permitidos. A mudança de etapa só é gravada se o pedido ainda estiver na etapa que o funcionário viu (`UPDATE ... WHERE status = <etapa lida>`): com dois funcionários clicando ao mesmo tempo, só um vence e o outro recebe um aviso. Um teste de integração dispara 5 cliques simultâneos para garantir isso.

**Fotos comprimidas no navegador e guardadas no banco.** O painel reduz cada foto para no máximo 1200 px e converte para WebP antes de enviar (uma foto de celular de 3,4 MB vira ~130 KB). Como o disco do servidor gratuito é apagado a cada deploy, as fotos ficam numa tabela do PostgreSQL, atrás de um módulo ([`images/storage.ts`](apps/api/src/images/storage.ts)) que permite trocar por S3/R2/Cloudinary mexendo em um lugar só. A API confere o tipo real do arquivo pelos primeiros bytes (um `.txt` ou um SVG com script renomeado para `.png` é recusado), limita o tamanho e serve cada foto com cache de 1 ano (`immutable`), já que toda foto nova ganha um endereço novo.

**Complementos flexíveis.** Um produto tem grupos com mínimo e máximo de escolhas, o que cobre os casos reais: "ponto da carne" (exatamente 1), "adicionais" (0 a 4), "pizza meio a meio" (1 a 2 sabores). Um produto cujo grupo obrigatório ficou sem opções disponíveis some do cardápio público, porque seria impossível pedi-lo.

**Conta aberta sem duplicidade.** Mesa e comanda viram uma conta (`Tab`) e cada pedido aponta para ela. Um índice único **parcial** no PostgreSQL (`restaurante + tipo + número` só onde `status = 'OPEN'`) garante uma única conta aberta por mesa, mesmo com o garçom e o QR Code lançando ao mesmo tempo: quem perde a corrida pega a conta já criada. Um teste dispara 6 lançamentos simultâneos na mesa livre e confere que só uma conta foi aberta. O fechamento também só é gravado se a conta ainda estiver aberta, então dois cliques em "Fechar" não fecham duas vezes. O cálculo (taxa, desconto limitado ao valor da conta) fica em [`tab.ts`](packages/shared/src/tab.ts), compartilhado entre o PDV (prévia) e a API (valor gravado).

**Histórico preservado.** O pedido guarda uma cópia do que foi pedido (nome, preço, complementos). Editar ou apagar um produto não altera pedidos antigos.

**Garantia de entrega sem duplicidade.** Cada pedido gera um `print_job` no banco, na mesma transação. O servidor reenvia tudo que está `QUEUED`/`SENT` quando o agente conecta; o agente grava o job no SQLite *antes* de imprimir e ignora `jobId` repetido (só reenvia a confirmação). Resultado: entrega *at-least-once* com impressão *exactly-once*.

**Sem condição de corrida no status.** O job é marcado como `SENT` *antes* de ser enviado, e só se ainda estiver pendente. O agente imprime em milissegundos, e um `SENT` gravado depois do ACK sobrescreveria o `PRINTED`.

**Numeração de pedidos segura.** O número (`#0042`) vem de um incremento atômico no restaurante dentro da transação, então dois pedidos simultâneos nunca recebem o mesmo número.

**Pareamento por código.** O dono gera um código curto (`K7P-2QX`, sem caracteres ambíguos como 0/O e 1/I), que vale 10 minutos e é consumido de forma atômica. O agente troca o código por um token longo, salvo em `data/credentials.json` com permissão `600`.

**Senhas com scrypt.** Hash *memory-hard* nativo do Node (sem dependência nativa como bcrypt/argon2), com salt aleatório e os parâmetros salvos junto (`scrypt$N$r$p$salt$hash`), o que permite aumentar o custo no futuro sem invalidar senhas antigas. Quando o e-mail não existe, o login calcula um hash falso: a resposta leva o mesmo tempo, então não dá para descobrir e-mails cadastrados pelo tempo nem pela mensagem.

**Sessões no banco, não JWT.** O token da sessão é aleatório e o banco guarda só o hash. Logout e expiração valem na hora, coisa que um JWT sem estado não permite sem uma lista de bloqueio. No navegador, o cookie é `httpOnly` (o JavaScript da página não lê, protegendo contra XSS), `SameSite=Lax` (protege contra CSRF) e `Secure` em produção.

**Tokens nunca em texto puro.** Sessões, tokens de agente e códigos de pareamento são guardados só como hash SHA-256. Se o banco vazar, as credenciais não vazam.

**Multi-tenant por construção.** Usuários se ligam a restaurantes por `Membership` com papel (`OWNER`/`STAFF`). Quem não é membro recebe **404**, não 403, para não revelar quais restaurantes existem. O agente autenticado só enxerga e confirma jobs do próprio restaurante: todo `UPDATE` de ACK filtra por `restaurantId`.

**Testes de integração com banco real.** Os testes sobem a API com `fastify.inject` contra um PostgreSQL de verdade (`cardapio_test`) e cobrem cadastro, login, sessão expirada, força bruta, isolamento entre restaurantes, papéis e numeração de pedidos sob concorrência. Cada teste cria dados únicos, então não é preciso apagar o banco entre execuções.

**Revogação imediata.** Revogar um agente o desconecta na hora; ele para de tentar reconectar e orienta a parear de novo.

**Fila persistente local.** Se o PC desligar ou a impressora ficar sem papel, nada se perde. Cada impressora tem sua linha na fila, com retentativas e backoff exponencial; uma impressora com problema não trava as outras.

**Roteamento por setor.** Cada item do pedido tem um `sector` (`cozinha`, `bar`...). Cada impressora declara os setores que recebe; `"*"` recebe tudo (ex.: via de conferência do caixa, com preços).

**ESC/POS escrito à mão.** Sem biblioteca de impressão: os comandos (`ESC @`, `ESC a`, `GS !`, `GS V`...) estão em [`escpos/encoder.ts`](apps/print-agent/src/escpos/encoder.ts). Impressoras térmicas não entendem UTF-8, então o texto é convertido para a **code page 860 (Português)**. Sem isso, "Pão" sai impresso como "PÃ£o".

**Dinheiro em centavos.** Todos os valores são inteiros (`unitPriceCents`), evitando erros de ponto flutuante.

## Integração contínua

A cada push e pull request, o [GitHub Actions](.github/workflows/ci.yml) roda em uma máquina limpa:

1. `npm ci` (instalação exata a partir do `package-lock.json`)
2. Checagem de tipos de todos os pacotes
3. Testes unitários (API, agente de impressão e site)
4. Testes de integração da API contra um **PostgreSQL real** (serviço do próprio GitHub Actions)
5. Build de produção do site

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
- [x] Cadastro, login e papéis (dono/funcionário)
- [x] Cardápio com categorias, produtos e complementos
- [x] Pedido público com preço calculado no servidor
- [x] Cardápio web do cliente (mesa, retirada e delivery)
- [x] Gerador de QR Code das mesas
- [ ] Convite de funcionários por e-mail
- [x] Fotos dos produtos, logo e capa (enviadas pelo painel)
- [ ] Taxa de entrega por bairro e horário de funcionamento
- [x] Painel do restaurante: pedidos em tempo real, loja e impressoras
- [x] Editor do cardápio no painel
- [x] Pedidos em tempo real por WebSocket, com campainha e reconexão automática
- [x] Etapas do pedido e Kanban de delivery/retirada
- [x] PDV para a equipe lançar pedidos (balcão, telefone, mesas)
- [x] Mesas e comandas com conta aberta e fechamento de conta
- [ ] Dividir a conta e transferir itens entre mesas
- [ ] Painel da cozinha (KDS)
- [ ] Impressoras USB e Bluetooth
- [ ] Instalador `.exe` com ícone na bandeja
- [ ] Pagamento Pix
