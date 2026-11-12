# 🚀 Deploy (planos gratuitos)

| Parte | Serviço | Arquivo de configuração |
|---|---|---|
| Banco PostgreSQL | [Neon](https://neon.tech) | — |
| API (Fastify + WebSocket) | [Render](https://render.com) | [`render.yaml`](render.yaml) + [`apps/api/Dockerfile`](apps/api/Dockerfile) |
| Site (Next.js) | [Vercel](https://vercel.com) | [`apps/web/next.config.ts`](apps/web/next.config.ts) |

```
Celular do cliente ──▶ Vercel (site) ──/api/*──▶ Render (API) ──▶ Neon (PostgreSQL)
                                                     ▲
PC do restaurante (agente) ──── WebSocket (wss) ─────┘
```

Faça na ordem abaixo: cada etapa usa o endereço gerado na anterior. Tempo total: cerca de 20 minutos.

---

## 1. Banco de dados: Neon

1. Entre em **neon.tech** → **Sign up** → **Continue with GitHub**.
2. **Create project**:
   - **Name:** `cardapio`
   - **Region:** **AWS US East 1 (N. Virginia)** — mesma região da API e da Vercel
   - **Postgres version:** a mais recente
3. Na tela do projeto, clique em **Connect**.
4. **Desligue** a opção **Connection pooling** e copie a connection string. Ela tem este formato:
   ```
   postgresql://usuario:senha@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```
   > Use a conexão **direta** (sem pooling): o Prisma precisa dela para aplicar as migrations.

⚠️ Essa string contém a senha do banco. **Não cole no código nem no README**: ela vai só no painel do Render.

---

## 2. API: Render

1. Entre em **render.com** → **Get Started** → **GitHub**, e autorize o acesso ao repositório `cardapio-saas`.
2. **New +** → **Blueprint** → escolha o repositório `cardapio-saas`.
3. O Render lê o [`render.yaml`](render.yaml) e mostra o serviço **cardapio-api**. Em **DATABASE_URL**, cole a connection string do Neon.
4. **Apply**. O primeiro build leva de 5 a 10 minutos. Na inicialização, a API:
   1. aplica as migrations no banco (`prisma migrate deploy`)
   2. cria o restaurante e o usuário de demonstração (pode rodar quantas vezes for, não duplica)
   3. sobe o servidor
5. Quando aparecer **Live**, copie o endereço do serviço (ex.: `https://cardapio-api.onrender.com`) e teste no navegador:
   ```
   https://cardapio-api.onrender.com/health        → {"ok":true}
   https://cardapio-api.onrender.com/public/restaurants/demo/menu
   ```

> 💤 **Plano gratuito:** o serviço "dorme" depois de 15 minutos sem acessos. O primeiro acesso depois disso demora cerca de 1 minuto para acordar. É normal.

---

## 3. Site: Vercel

1. Entre em **vercel.com** → **Sign up** → **Continue with GitHub**.
2. **Add New…** → **Project** → **Import** no repositório `cardapio-saas`.
3. Configure:
   - **Root Directory:** clique em **Edit** e escolha **`apps/web`**
   - **Framework Preset:** Next.js (detectado sozinho)
   - **Environment Variables:**

     | Nome | Valor |
     |---|---|
     | `API_URL` | o endereço da API no Render, **sem barra no final** (ex.: `https://cardapio-api.onrender.com`) |

   > O `API_URL` precisa existir **antes** do primeiro build: o redirecionamento `/api/*` → API é montado durante o build.
4. **Deploy**. Em 1 a 2 minutos a Vercel mostra o endereço do site (ex.: `https://cardapio-saas.vercel.app`).
5. Volte em **Settings → Environment Variables** e adicione:

   | Nome | Valor |
   |---|---|
   | `NEXT_PUBLIC_SITE_URL` | o endereço do site (ex.: `https://cardapio-saas.vercel.app`) |

   e faça **Deployments → ⋯ → Redeploy**. Assim, os QR Codes das mesas já saem com o endereço público.

---

## 4. Conferir

| Teste | Esperado |
|---|---|
| Abrir `https://SEU-SITE.vercel.app/r/demo?mesa=7` no **celular** | Cardápio do Restaurante Demo, com o selo "Mesa 7" |
| Fazer um pedido | Tela "Pedido #… enviado!" |
| `https://SEU-SITE.vercel.app` → **Entrar como dono** | Painel abre; o pedido aparece em **Pedidos** |
| Painel → **QR Codes das mesas** | QR Codes com o endereço da Vercel; escaneie com o celular |

Depois, coloque o link no topo do [README](README.md) (seção "Demo ao vivo").

---

## 5. Agente de impressão apontando para a produção

No computador do restaurante, em `apps/print-agent/agent.config.json`:

```json
{
  "serverUrl": "wss://cardapio-api.onrender.com/agent",
  "printers": [ ... ]
}
```

Depois gere um código em **Painel → Impressoras** e rode:

```bash
npm run pair -- CODIGO --force
```

```bash
npm run dev:agent
```

---

## Atualizações

- **Site:** a Vercel publica sozinha a cada `git push` na `main`.
- **API:** o Render também (`autoDeploy: true`); migrations novas são aplicadas na inicialização.
- O **CI** do GitHub Actions roda os testes no mesmo push. Se ele ficar vermelho, corrija antes que o deploy chegue aos usuários.

## Administrador da plataforma (suporte)

O administrador acessa **/admin**: lista todos os restaurantes, cadastra clientes (gerando o link de acesso do dono) e entra na base de qualquer um em **modo suporte**.

1. No Render, abra o serviço **cardapio-api** → **Environment** → **Add Environment Variable**:
   - `PLATFORM_ADMIN_EMAIL`: o seu e-mail (vários, separados por vírgula)
   - `PLATFORM_ADMIN_PASSWORD`: uma senha de 12 ou mais caracteres
2. **Save Changes**. O Render reinicia a API e, na inicialização, cria a sua conta já como administrador.
3. Entre na página inicial do site com esse e-mail e senha: você cai direto em `/admin`.
4. Depois do primeiro login, você pode **apagar** `PLATFORM_ADMIN_PASSWORD` do Render: ela só serve para criar a conta e nunca sobrescreve uma senha existente.

Quem define os administradores é a lista `PLATFORM_ADMIN_EMAIL`: tirar um e-mail dela remove o poder de administrador na próxima inicialização.

## Segurança e limites conhecidos

- O **administrador da plataforma** enxerga e altera os dados de todos os restaurantes. Use uma senha forte e exclusiva; cada entrada na base de um cliente fica registrada.

- A **conta de demonstração** (`demo@cardapio.dev` / `demo12345`) é pública de propósito, para quem visitar o portfólio. Qualquer pessoa pode editar o cardápio do restaurante demo. Para um restaurante real, crie outra conta pelo cadastro.
- Segredos (`DATABASE_URL`) ficam **só** nos painéis do Render e da Vercel, nunca no repositório.
- No plano gratuito do Render, o serviço dorme sem uso; um agente conectado mantém o WebSocket aberto, mas não há garantia de que isso evite a suspensão. Para um restaurante de verdade, use um plano pago.
