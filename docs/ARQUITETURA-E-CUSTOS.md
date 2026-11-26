# Arquitetura, segurança e custos da plataforma

## Visão geral

```
 Cliente (celular)                     Profissional (celular/notebook)
        │                                         │
        ▼                                         ▼
  index.html?p=<slug>                      admin/?p=<slug>
  site público em telas                    login + painel
        │  funções public_* (anon)                │  funções admin_* (login)
        └──────────────┬──────────────────────────┘
                       ▼
           Supabase (São Paulo)
           ├─ Auth: e-mail/senha, recuperação de senha
           ├─ Postgres + Row Level Security (isolamento por profissional)
           │    restrição de exclusão contra reservas sobrepostas
           └─ Storage: tenant-assets/<id-da-profissional>/…
```

- **Hospedagem:** GitHub Pages (arquivos estáticos). Não há servidor próprio para manter.
- **Banco, login e imagens:** Supabase. Toda regra importante roda **no banco**, não no navegador.
- **Sem dependências externas no frontend:** HTML, CSS e JavaScript puros; o cliente da API (`js/core/api.js`) usa só os endpoints REST oficiais.

## Multi‑profissional (multi‑tenancy)

| Camada | Como cada profissional fica isolada |
|---|---|
| Endereço | `?p=<slug>` escolhe o site e a tela de login (logo, nome e cores próprios) |
| Login | Supabase Auth. Cada login é vinculado a uma conta em `tenant_members` |
| Dados | Todas as tabelas privadas têm `tenant_id` e **RLS**: só membros da conta leem ou alteram |
| Funções do painel | `admin_*` rodam com o papel da usuária (RLS vale) **e** conferem a associação (`app.require_member`) |
| Site público | Visitantes não leem tabelas; só chamam `public_*`, que nunca devolvem nome/telefone de clientes |
| Imagens | Pasta por profissional no Storage, com política de escrita restrita à própria conta |
| Plano/status | A profissional não consegue alterar `status`, `plan_id` nem `slug` (permissão de coluna) |

Testado automaticamente: `tests/db/test_db.py` (68 verificações) e `tests/e2e_platform.py` (45 verificações no navegador), incluindo requisições forjadas de uma conta tentando ler dados da outra.

## Concorrência de horários

A tabela `appointments` tem uma **restrição de exclusão** (`EXCLUDE USING gist`) que impede, no próprio banco, dois atendimentos ativos sobrepostos na mesma conta (considerando o intervalo de preparo). A função `public_book` revalida expediente, bloqueios, antecedência e preços **no servidor** e devolve `SLOT_TAKEN` se outra cliente reservou primeiro. Testado com até 8 reservas simultâneas no mesmo horário: só uma passa.

## Pagamentos

- Hoje: a cliente vê o valor do sinal e a chave Pix; a reserva fica **"Aguardando sinal"**. A profissional confere o comprovante e registra o pagamento no painel (Pix, cartão, dinheiro, transferência). Nada é marcado como pago automaticamente.
- Preparado para gateway: a tabela `payments` tem `confirmation` (`manual`/`gateway`), `provider` e `provider_ref`. A integração futura = uma Edge Function que cria a cobrança Pix e um **webhook** que grava o pagamento confirmado com `confirmation='gateway'`.

## Cancelamentos e remarcações

- A cliente pede pelo site (protocolo + WhatsApp). O pedido aparece em **Solicitações** e no atendimento.
- A profissional aceita/recusa, cancela (motivo obrigatório) ou remarca. Tudo vai para o **histórico** (`appointment_events`).
- A política de cancelamento é configurada no painel e **mostrada à cliente antes de agendar** (aceite obrigatório, gravado em `policy_accepted`). **Nenhuma retenção de sinal é automática**: ao cancelar, a profissional decide se registra devolução.

## Preparação para comercialização (próximas etapas)

Já existe no banco: `plans` (limites por plano, ex. número de procedimentos), `tenants.status` (`pending`/`active`/`suspended`), `platform_admins` e `signup_requests` (+ `public_signup_request`).

Falta construir:
1. Página de cadastro de novas profissionais → grava em `signup_requests`.
2. Painel da proprietária da plataforma (aprovar, ativar, suspender, trocar plano).
3. Cobrança da assinatura (Asaas, Mercado Pago ou Stripe) com webhook que ativa/suspende a conta.
4. Domínio próprio por profissional (opcional) e SMTP próprio para e-mails.

## Custos para colocar em produção

Valores consultados em novembro/2026 — confira antes de contratar.

| Item | Opção de baixo custo | Limites / observações |
|---|---|---|
| Hospedagem do site | **GitHub Pages — grátis** (repositório público) | Suficiente para o site e o painel (são arquivos estáticos) |
| Banco, login, imagens | **Supabase Free — US$ 0** | 500 MB de banco, 1 GB de arquivos, 5 GB de tráfego, 50 mil usuários ativos/mês, até 2 projetos; **pausa após 1 semana sem uso** e **sem backups** |
| Supabase em produção | **Supabase Pro — a partir de US$ 25/mês** (inclui US$ 10 de crédito de computação, que cobre uma instância Micro) | 8 GB de banco, 100 GB de arquivos, 250 GB de tráfego, 100 mil usuários; não pausa; backups diários por 7 dias. Um único projeto atende **todas** as profissionais |
| E-mails de login (recuperar senha) | SMTP próprio (Brevo, Resend etc. têm planos gratuitos com limite diário) | O e-mail padrão do Supabase envia só 2 e-mails/hora e só para a equipe do projeto — não serve para produção |
| Domínio | **.com.br no Registro.br — R$ 40/ano** | Opcional; um domínio da plataforma basta (profissionais em `?p=` ou subpasta) |
| Pix automático (futuro) | Gateway com cobrança por transação | Taxas variam por provedor; avaliar antes de integrar |
| Assinaturas das profissionais (futuro) | Mesmo gateway, recorrência | Não implementado nesta etapa, como combinado |

**Resumo:** demonstração e primeiras clientes — **R$ 0/mês**. Produção com segurança (sem pausa e com backup) — cerca de **US$ 25/mês** (Supabase Pro) **+ R$ 40/ano** de domínio, para várias profissionais no mesmo projeto.
