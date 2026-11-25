# Bella Brows & Lashes — site demonstrativo com Agenda Inteligente

Site responsivo (prioridade para celular) de um estúdio **fictício** de sobrancelhas e extensão de cílios, com uma **agenda interativa que funciona de verdade dentro do protótipo**: calcula horários livres, soma procedimentos, bloqueia conflitos e registra as reservas feitas na demonstração.

> ⚠️ **Demonstração.** Não há reservas nem pagamentos reais. Endereço, WhatsApp, Instagram, clientes e imagens são fictícios/ilustrativos.

---

## 1. Como abrir

**Jeito mais simples:** dê dois cliques em `index.html`. Funciona offline, sem instalar nada.

**Recomendado (igual ao site publicado):** rode um servidor local na pasta do projeto:

```bash
cd bella-brows-lashes
python3 -m http.server 8000
# abra http://localhost:8000 no navegador (ou no celular, pelo IP do computador na mesma rede)
```

## 2. Estrutura

```
bella-brows-lashes/
├── index.html              # Página única: herói, menu, procedimentos, resultados, localização, contato, rodapé e agenda
├── css/style.css           # Estilos (mobile-first, breakpoints 640px e 960px)
├── js/
│   ├── config.js           # ★ Tudo o que a profissional edita: marca, contatos, endereço, procedimentos, preços, durações, regras da agenda
│   ├── scheduler.js        # Motor de disponibilidade (funções puras, sem tela) — reaproveitável no backend
│   ├── storage.js          # Repositório de agendamentos (localStorage) + dados de demonstração
│   ├── payment.js          # Provedor de pagamento de DEMONSTRAÇÃO (interface pronta para Pix/gateway)
│   ├── ui.js               # Utilitários: moeda, duração, datas, máscara de telefone, diálogos, links do WhatsApp
│   ├── site.js             # Preenche o site a partir da config (serviços, resultados, mapa, prévia do painel)
│   └── booking.js          # Fluxo da Agenda Inteligente (5 passos + tela final)
├── assets/
│   ├── img/                # Logo e ilustrações SVG (substituíveis)
│   └── fonts/              # Cardo e Montserrat (licença OFL, incluídas no projeto)
├── tests/
│   ├── scheduler.test.js   # Testes da lógica da agenda (Node.js)
│   └── e2e_playwright.py   # Teste ponta a ponta no navegador (celular e desktop)
└── tools/gen_images.py     # Script que gerou as ilustrações (opcional)
```

**Por que HTML, CSS e JavaScript puros?** Carregam rápido (sem frameworks nem bibliotecas externas; ilustrações vetoriais e fontes locais), abrem direto do arquivo, publicam de graça no GitHub Pages e são fáceis de manter. A lógica já está separada em camadas (config → regras → armazenamento → tela), então migrar para React/Vue ou para um backend no futuro não exige reescrever as regras.

## 3. Agenda Inteligente — como funciona

1. **Procedimentos** — escolha um ou mais; tempo total e valor total são somados na hora.
2. **Data** — calendário mostra só os dias com horário livre **para a duração escolhida**. Domingos, datas bloqueadas, dias passados e dias lotados ficam desabilitados.
3. **Horário** — calculado considerando:
   - períodos de atendimento (manhã 07h–11h30, tarde 13h30–17h30) — um atendimento **nunca atravessa o intervalo** do almoço;
   - duração total (ex.: 40 min reserva 40 min; 100 min reserva 100 min);
   - intervalo de preparo de 10 min entre atendimentos (`bufferMin`);
   - agendamentos já existentes, datas e faixas bloqueadas;
   - antecedência mínima de 60 min para o mesmo dia.
4. **Seus dados** — nome completo e WhatsApp (com máscara e validação).
5. **Confirmação** — resumo com cliente, procedimentos, duração, data, horário, valor total e **sinal de 50%**. O pagamento do sinal é **simulado** (nenhuma cobrança).

Ao confirmar, a reserva é **gravada e o horário some da agenda** imediatamente. Antes de gravar, o sistema relê os dados e confere de novo se o horário continua livre — se outra aba já reservou, a cliente volta ao passo 3 com aviso. Assim duas clientes não conseguem reservar o mesmo horário **neste navegador**.

**Dados de demonstração:** na primeira visita são criados agendamentos fictícios relativos à data de hoje (um dia parcialmente ocupado, um dia lotado, um dia bloqueado e uma tarde bloqueada). No rodapé, *“Ver agenda da profissional (demonstração)”* mostra todas as reservas, permite cancelar (o horário volta a ficar livre) e restaurar a demonstração.

### Limites honestos do protótipo

- As reservas ficam no `localStorage` **do navegador de quem usa**. Outra pessoa, em outro celular, não vê essas reservas.
- Não há autenticação, banco de dados nem controle de concorrência no servidor.
- **Para uso comercial real** é necessário: backend + banco de dados, autenticação da profissional, revalidação da reserva no servidor dentro de uma transação (ou restrição de unicidade), confirmação de pagamento via webhook do provedor, e LGPD (política de privacidade/consentimento para dados das clientes).

## 4. Personalizar para uma profissional

Quase tudo está em **`js/config.js`**:

| O que mudar | Onde |
|---|---|
| Nome, frase de apresentação, imagem principal | `brand` |
| WhatsApp (só dígitos, com 55 + DDD), mensagem padrão, Instagram | `contact` |
| Endereço, horário exibido, link e mapa incorporado do Google Maps | `location` |
| Procedimentos: nome, descrição, **duração (min)**, **preço**, foto | `services` |
| Dias de atendimento, períodos, intervalo entre atendimentos, antecedência, janela, % do sinal | `agenda` |
| Datas fechadas (feriados, férias) e faixas bloqueadas | `agenda.blockedDates` / `agenda.blockedRanges` |

Mapa real: no Google Maps, abra o endereço → **Compartilhar → Incorporar um mapa**, copie só a URL do `src` e cole em `location.mapsEmbedUrl`. Em `location.mapsUrl` coloque o link de compartilhamento do local.

### Trocar imagens por fotos reais

- Coloque as fotos em `assets/img/` (de preferência **.webp** ou **.jpg** com até ~1600 px de largura e < 250 KB).
- Procedimentos: altere o campo `image` de cada serviço em `config.js`. Proporção ideal **4:3**.
- Resultados (antes/depois): edite a lista `RESULTS` em `js/site.js`. Fotos **quadradas (1:1)**, com mesmo enquadramento e luz no antes e no depois. Depois de trocar, remova o aviso “Imagens ilustrativas…” em `index.html` e o selo “Ilustração” em `js/site.js`.
- Use apenas fotos de trabalhos próprios e com **autorização das clientes**.
- Logo: substitua `assets/img/logo-marca.svg` (símbolo) e ajuste o texto “Bella / Brows & Lashes” no `index.html`. Também há `assets/img/logo.svg` (versão completa, com o nome em curvas).

## 5. Publicar no GitHub Pages (grátis)

1. Crie uma conta em <https://github.com> e clique em **New repository** (ex.: `bella-brows-lashes`), público.
2. Na página do repositório, **Add file → Upload files** e arraste **o conteúdo** da pasta `bella-brows-lashes` (o `index.html` deve ficar na raiz do repositório). Clique em **Commit changes**.
   - Pelo terminal: `git init && git add . && git commit -m "Site Bella" && git branch -M main && git remote add origin https://github.com/SEU-USUARIO/bella-brows-lashes.git && git push -u origin main`
3. Vá em **Settings → Pages**. Em *Build and deployment*, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e salve.
4. Em 1–2 minutos o site estará em `https://SEU-USUARIO.github.io/bella-brows-lashes/`.
5. Domínio próprio (opcional): em **Settings → Pages → Custom domain**, informe o domínio e crie no seu provedor um registro **CNAME** apontando para `SEU-USUARIO.github.io`.

Todos os caminhos do projeto são relativos, então ele funciona tanto na raiz de um domínio quanto em uma subpasta do GitHub Pages. Atalho útil para divulgação: `…/index.html#agenda` abre o site já com a agenda aberta.

## 6. Testes

```bash
node tests/scheduler.test.js          # 11 testes da lógica de horários (sem instalar nada)
```

Cobrem: soma de procedimentos e sinal; dias fechados/bloqueados/passados; primeiro e último horário de cada período; atendimentos que não atravessam o almoço; buffer entre atendimentos; cancelamento liberando horário; faixas bloqueadas; antecedência mínima; dia lotado; checagem final contra dupla reserva; e uma varredura com 200 reservas aleatórias garantindo que nenhuma se sobrepõe.

Teste no navegador (opcional, requer Python + Playwright): `python3 tests/e2e_playwright.py` com o servidor local ligado. Ele percorre o fluxo completo no tamanho de um celular (390×844), tenta reservar o mesmo horário em duas abas e confere que a segunda é bloqueada.

## 7. Próximo passo: painel administrativo

O código foi organizado para receber um painel com login individual por profissional:

- `config.js` → vira `GET /api/profissionais/:id/config` (procedimentos, preços, durações, horários, fotos, endereço, contatos).
- `storage.js` → trocar por um `ApiBookingRepository` com os mesmos métodos (`list`, `create`, `cancel`), falando com `POST/GET/PATCH /api/agendamentos`.
- `scheduler.js` → roda **também no servidor** (Node.js) para validar cada reserva antes de gravar.
- `payment.js` → provedor real (Pix via Mercado Pago, Asaas, Efí, PagBank etc.) mantendo `createCharge` e `confirm`.

Sugestão de tabelas: `profissionais`, `procedimentos`, `regras_agenda` (dias/períodos), `bloqueios` (datas/faixas), `clientes`, `agendamentos` (data, início, fim, status, procedimentos), `pagamentos`. Opções práticas de backend: **Supabase** (Postgres + login + regras de acesso) ou **Firebase**; ou Node.js/Express com PostgreSQL. Telas do painel: login, agenda diária/semanal/mensal, lista de clientes, cancelar/remarcar, editar procedimentos e horários, bloquear datas, trocar fotos/logo/contatos.

## 8. Créditos

- Fontes **Cardo** e **Montserrat** — SIL Open Font License (arquivos em `assets/fonts/`).
- Logo e ilustrações criadas para este projeto (vetores originais).
