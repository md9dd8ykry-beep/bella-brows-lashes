# Como conectar a plataforma ao Supabase (passo a passo)

Tempo estimado: 15 minutos. Tudo no plano **Free** do Supabase, sem cartão de crédito.

> 🔒 **Nunca** compartilhe a chave `service_role` / `secret` nem a senha do banco. No site entram só a **Project URL** e a chave **publishable** (ou `anon`), que são públicas por definição: quem protege os dados são as regras de segurança (RLS) criadas pelo script.

## 1. Criar o projeto

1. Acesse https://supabase.com e entre com o GitHub.
2. Crie uma **organização** (tipo *Personal*, plano *Free*).
3. **New project**: nome `bella-plataforma`, região **South America (São Paulo)**, gere a senha do banco e guarde-a com você. Deixe **Data API** ativada.
4. Aguarde 1–2 minutos até o projeto ficar pronto.

## 2. Criar as tabelas e regras de segurança

1. No menu lateral: **SQL Editor → New query**.
2. Abra o arquivo [`supabase/migrations/0001_plataforma.sql`](../supabase/migrations/0001_plataforma.sql) no GitHub, clique em **Copy raw file**, cole no editor e clique em **Run**. Deve aparecer *Success. No rows returned*.
3. Nova query: copie e rode [`supabase/seed/0002_demo.sql`](../supabase/seed/0002_demo.sql). Ele cria as duas contas de demonstração (**bella** e **lumi-nails**) com serviços, horários, clientes e agendamentos fictícios. A última linha deve mostrar *Demonstração criada: bella e lumi-nails*.

Para renovar os dados de demonstração depois (datas relativas a hoje):
```sql
select app.seed_demo('https://md9dd8ykry-beep.github.io/bella-brows-lashes/');
```

## 3. Configurar os endereços de login

**Authentication → URL Configuration**
- **Site URL:** `https://md9dd8ykry-beep.github.io/bella-brows-lashes/admin/`
- **Redirect URLs → Add URL:** `https://md9dd8ykry-beep.github.io/bella-brows-lashes/admin/**`

Isso permite que o link de "Esqueci minha senha" volte para o painel.

## 4. Criar os logins das profissionais de demonstração

**Authentication → Users → Add user → Create new user**

| Conta | E-mail | Senha | Marcar |
|---|---|---|---|
| Bella | **o seu e-mail** (para testar a recuperação de senha) | uma senha sua, com 8+ caracteres | ✅ Auto Confirm User |
| Lumi | `demo-lumi@example.com` (fictício) | outra senha sua | ✅ Auto Confirm User |

Depois, no **SQL Editor**, vincule cada login à sua conta (troque o e-mail):
```sql
select app.link_owner('SEU-EMAIL@exemplo.com', 'bella', '(00) 98888-0001');
select app.link_owner('demo-lumi@example.com', 'lumi-nails');
```
O terceiro parâmetro (opcional) é o telefone que também poderá ser usado no campo de login.

> ℹ️ No plano gratuito, o e-mail padrão do Supabase envia **no máximo 2 e-mails por hora** e **só para endereços da equipe do projeto** — por isso a conta Bella usa o seu e-mail. Para produção, configure um SMTP próprio (veja `ARQUITETURA-E-CUSTOS.md`).

## 5. Copiar as duas informações públicas

**Project Settings → API Keys** (ou *Data API*):
- **Project URL** — algo como `https://abcdxyz.supabase.co`
- **Publishable key** — começa com `sb_publishable_…` (em projetos antigos, a chave `anon`)

Cole os dois em [`js/platform.config.js`](../js/platform.config.js) (ou envie para quem está fazendo a manutenção do site). Assim que o arquivo for publicado no GitHub, o site e o painel passam a usar o servidor.

## 6. Conferir

- Site: https://md9dd8ykry-beep.github.io/bella-brows-lashes/ → a faixa do topo deve dizer *"Site de demonstração · profissional e dados fictícios"* (e não "demonstração local").
- Painel da Bella: https://md9dd8ykry-beep.github.io/bella-brows-lashes/admin/?p=bella
- Painel da Lumi: https://md9dd8ykry-beep.github.io/bella-brows-lashes/admin/?p=lumi-nails
- Site da Lumi: https://md9dd8ykry-beep.github.io/bella-brows-lashes/?p=lumi-nails

## Cadastrar uma nova profissional (hoje, pelo SQL Editor)

```sql
insert into public.tenants (slug, status, name, tagline, timezone, theme)
values ('studio-ana', 'active', 'Studio Ana Lash', 'Cílios e sobrancelhas', 'America/Sao_Paulo',
        '{"primary":"#b5786a","primaryDeep":"#9a5f52","soft":"#ecd6cf","accent":"#a8845a","bg":"#f7f0ea","ink":"#4a352c","wordmark":"Ana","subtitle":"Lash Studio"}');
```
Crie o login em *Authentication → Users*, rode `select app.link_owner('email-dela', 'studio-ana');` e ela mesma configura serviços, horários, fotos e cores pelo painel. O site dela fica em `…/bella-brows-lashes/?p=studio-ana`.
