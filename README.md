# Bella Brows & Lashes — plataforma de agendamento para profissionais da beleza

Projeto demonstrativo com **duas áreas**:

- **Site público da profissional** (`index.html?p=<slug>`): apresentação, procedimentos e valores, resultados, localização, fale conosco e a **Agenda Inteligente**.
- **Área da profissional** (`admin/?p=<slug>`): login personalizado com a marca dela e painel com visão geral, agenda (dia/semana/mês), clientes, pagamentos, pedidos de cancelamento/remarcação, procedimentos, horários e personalização do site.

A mesma instalação atende **várias profissionais**, cada uma com login, identidade visual, site, agenda, clientes e pagamentos próprios. Uma não vê os dados da outra.

> ⚠️ **Demonstração:** Bella Brows & Lashes e Lumi Nail Studio são empresas fictícias. Endereços, telefones e clientes são fictícios; fotos são ilustrativas (banco de imagens com licença livre).

## Links

| | |
|---|---|
| Site público (Bella) | https://md9dd8ykry-beep.github.io/bella-brows-lashes/ |
| Site público (Lumi) | https://md9dd8ykry-beep.github.io/bella-brows-lashes/?p=lumi-nails |
| Painel (Bella) | https://md9dd8ykry-beep.github.io/bella-brows-lashes/admin/?p=bella |
| Painel (Lumi) | https://md9dd8ykry-beep.github.io/bella-brows-lashes/admin/?p=lumi-nails |
| Versão estável anterior (só site + agenda local) | branch `estavel-v1-site-publico` |

## Dois modos de funcionamento

| | Demonstração local | Plataforma (Supabase) |
|---|---|---|
| Quando | `js/platform.config.js` vazio | Project URL + chave pública preenchidas |
| Site público | Funciona; reservas só no navegador | Dados do banco; reservas reais e compartilhadas |
| Painel | Mostra como conectar (não simula login) | Login real, recuperação de senha, dados por conta |
| Concorrência | Só dentro do mesmo navegador | Garantida no banco (restrição de exclusão) |

Para ligar o modo plataforma, siga **[docs/CONFIGURAR-SUPABASE.md](docs/CONFIGURAR-SUPABASE.md)**.

## Estrutura

```
index.html                 site público (telas independentes + agenda)
css/style.css
js/
  platform.config.js       ★ URL e chave pública do Supabase
  config.js                conteúdo do modo demonstração local
  core/api.js              cliente REST do Supabase (Auth, RPC, Storage) sem bibliotecas
  data.js                  escolhe a fonte de dados (plataforma ou local) e aplica a identidade visual
  scheduler.js             cálculo de horários livres (funções puras, testadas)
  storage.js               reservas no navegador (modo local)
  site.js                  telas, procedimentos, galeria, cancelar/remarcar
  booking.js               Agenda Inteligente (5 passos)
  ui.js, payment.js
admin/                     área da profissional (index.html, admin.css, admin.js)
supabase/
  migrations/0001_plataforma.sql   tabelas, RLS, funções públicas e do painel, Storage
  seed/0002_demo.sql               contas de demonstração (bella, lumi-nails)
docs/
  CONFIGURAR-SUPABASE.md   passo a passo de configuração
  ARQUITETURA-E-CUSTOS.md  segurança, multi-profissional, pagamentos, custos
tests/                     testes da lógica, do banco e ponta a ponta
assets/                    imagens, logos e fontes (Cardo e Montserrat, licença OFL)
```

## O que está funcionando

**Site público**
- Início com logo, apresentação e 5 botões; cada botão abre **somente** a sua tela (com "Início" para voltar e suporte ao botão voltar do celular).
- Agenda Inteligente: vários procedimentos com soma de tempo e valor; calendário só com dias que têm horário livre para a duração escolhida; horários que respeitam expediente, pausas, intervalo entre atendimentos, bloqueios, férias, datas especiais e antecedência.
- Política de cancelamento exibida e aceita antes de confirmar; sinal informado com a chave Pix da profissional.
- Pedido de cancelamento ou remarcação pela cliente (protocolo + WhatsApp).

**Painel**
- Login com logo, nome e cores da profissional; e-mail **ou** telefone; recuperação de senha por e-mail.
- Visão geral com cards (hoje, semana, clientes do mês, aguardando confirmação, sinais recebidos, recebido no mês, pendências, pedidos) e próximos atendimentos.
- Agenda dia/semana/mês com horários livres, bloqueios e filtros por situação; detalhes completos de cada atendimento; confirmar, concluir, falta, cancelar (motivo obrigatório), remarcar com sugestão de horários livres, reativar.
- Clientes com busca por nome/telefone, histórico, procedimentos realizados, valores pagos, próximos horários e anotações.
- Pagamentos com filtros por data, forma e situação; recebidos, sinais, Pix, cartão, pendentes; registro **manual** e estorno.
- Procedimentos: criar, editar, ocultar, excluir, com foto (envio para o Storage ou link).
- Horários: dias e períodos (almoço/pausas), intervalo, antecedência, janela, % do sinal, política de cancelamento, datas especiais, folgas, férias, feriados e bloqueios.
- Personalização: nome, logo, foto principal, cores (com paletas prontas), descrição, WhatsApp, Instagram, endereço, mapa, chave Pix e galeria de resultados.
- Histórico de alterações e pedidos das clientes.

## O que é simulado ou depende de integração externa

- **Pix/cartão automáticos:** não integrados. O sinal é confirmado manualmente pela profissional. A estrutura (`payments.confirmation`, `provider`, `provider_ref`) está pronta para um webhook de gateway.
- **E-mails de recuperação:** usam o e-mail padrão do Supabase (limite de 2/hora, só para a equipe do projeto). Em produção, configurar SMTP próprio.
- **Cadastro self-service de profissionais, aprovação e planos pagos:** tabelas prontas (`plans`, `signup_requests`, `platform_admins`, `tenants.status`); telas e cobrança ainda não construídas.
- **Fotos:** ilustrativas, hospedadas no Unsplash (licença livre). Se alguma não carregar, o site usa uma imagem local. Para uso real, substitua pelas fotos da profissional no painel.
- **Antes e depois:** a galeria aceita pares antes/depois (comparador deslizante); os exemplos de demonstração usam só fotos únicas, porque não há pares reais com licença livre.

## Testes

```bash
node tests/scheduler.test.js            # 11 testes da lógica de horários
python3 tests/db/test_db.py             # 68 testes de segurança, isolamento, regras e concorrência no banco
python3 tests/e2e_platform.py           # 45 verificações no navegador (celular e computador)
python3 tests/e2e_playwright.py         # fluxo do modo demonstração local
```

Os testes de banco e ponta a ponta usam um PostgreSQL local preparado com `tests/db/00_supabase_local.sql` e o simulador da API em `tests/supabase_shim.py` (o mesmo código do site e do painel, contra um banco idêntico ao do Supabase).

## Publicação

- GitHub Pages: **Settings → Pages → Deploy from a branch → main / (root)**. Cada envio para a `main` publica em ~1 minuto.
- Desenvolvimento em branches; a versão estável anterior está preservada em `estavel-v1-site-publico`.

## Custos

Resumo em [docs/ARQUITETURA-E-CUSTOS.md](docs/ARQUITETURA-E-CUSTOS.md): demonstração **R$ 0/mês** (GitHub Pages + Supabase Free); produção a partir de **US$ 25/mês** (Supabase Pro, sem pausa e com backup) + domínio opcional (R$ 40/ano no Registro.br), atendendo várias profissionais no mesmo projeto.
