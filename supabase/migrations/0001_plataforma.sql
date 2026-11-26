-- =====================================================================
-- PLATAFORMA DE AGENDAMENTO PARA PROFISSIONAIS DA BELEZA (multi-tenant)
-- Supabase / PostgreSQL 15+
--
-- Como aplicar: Supabase → SQL Editor → New query → colar este arquivo → Run.
-- Pode ser executado de novo com segurança (idempotente onde possível).
--
-- Segurança:
--  * Cada profissional (tenant) só enxerga os próprios dados: Row Level
--    Security em TODAS as tabelas privadas + checagem explícita nas funções.
--  * Visitantes (anon) não leem tabelas; usam apenas funções public_*,
--    que devolvem só dados públicos (nunca nome/telefone de clientes).
--  * Reservas simultâneas: restrição de exclusão (GiST) no banco impede
--    sobreposição de horários mesmo com duas clientes ao mesmo tempo.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists app;

-- ------------------------------------------------------------- planos
create table if not exists public.plans (
  id            text primary key,
  name          text not null,
  price_cents   integer not null default 0,
  max_services  integer,
  features      jsonb not null default '{}'::jsonb,
  active        boolean not null default true
);

insert into public.plans (id, name, price_cents, max_services, features) values
  ('demo',    'Demonstração', 0,    null, '{"gallery": true}'),
  ('basico',  'Básico',       0,    8,    '{"gallery": false}'),
  ('pro',     'Profissional', 0,    null, '{"gallery": true}')
on conflict (id) do nothing;

-- ------------------------------------------------------------- profissionais (tenants)
create table if not exists public.tenants (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  status           text not null default 'pending' check (status in ('pending','active','suspended')),
  plan_id          text not null default 'demo' references public.plans(id),
  -- identidade / site
  name             text not null,
  tagline          text not null default '',
  logo_url         text,
  hero_url         text,
  theme            jsonb not null default '{}'::jsonb,
  whatsapp         text not null default '',
  instagram_url    text not null default '',
  address_line1    text not null default '',
  address_line2    text not null default '',
  address_is_demo  boolean not null default true,
  maps_url         text not null default '',
  pix_key          text not null default '',
  is_demo          boolean not null default false,
  -- regras da agenda
  timezone         text not null default 'America/Sao_Paulo',
  slot_step_min    integer not null default 15 check (slot_step_min between 5 and 60),
  buffer_min       integer not null default 10 check (buffer_min between 0 and 120),
  min_notice_min   integer not null default 60 check (min_notice_min between 0 and 10080),
  window_days      integer not null default 60 check (window_days between 1 and 365),
  deposit_percent  integer not null default 50 check (deposit_percent between 0 and 100),
  -- política de cancelamento (exibida à cliente ANTES de agendar)
  cancel_policy_text     text not null default '',
  cancel_deadline_hours  integer not null default 24 check (cancel_deadline_hours between 0 and 720),
  deposit_retention      boolean not null default false,
  created_at       timestamptz not null default now()
);

create table if not exists public.tenant_members (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null,
  role        text not null default 'owner' check (role in ('owner','staff')),
  login_phone text,               -- permite entrar digitando o telefone
  created_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index if not exists tenant_members_user_idx on public.tenant_members(user_id);

create table if not exists public.platform_admins (
  user_id uuid primary key
);

-- pedidos de cadastro de novas profissionais (fluxo comercial futuro)
create table if not exists public.signup_requests (
  id          uuid primary key default gen_random_uuid(),
  business    text not null,
  contact     text not null,
  email       text not null,
  segment     text not null default '',
  status      text not null default 'new' check (status in ('new','approved','rejected')),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------- serviços
create table if not exists public.services (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null check (length(name) between 2 and 80),
  description   text not null default '',
  image_url     text,
  price         numeric(10,2) not null check (price >= 0),
  duration_min  integer not null check (duration_min between 5 and 600),
  active        boolean not null default true,
  sort          integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists services_tenant_idx on public.services(tenant_id, sort);

-- ------------------------------------------------------------- horários
-- Vários períodos por dia da semana (o intervalo de almoço/pausas é o espaço entre períodos)
create table if not exists public.business_hours (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),   -- 0 = domingo
  start_time time not null,
  end_time   time not null,
  check (end_time > start_time)
);
create index if not exists business_hours_tenant_idx on public.business_hours(tenant_id, weekday);

-- Datas especiais: substituem o horário normal daquele dia (sem períodos = fechado)
create table if not exists public.special_days (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  day        date not null,
  periods    jsonb not null default '[]'::jsonb,   -- [{"start":"09:00","end":"12:00"}]
  note       text not null default '',
  unique (tenant_id, day)
);

-- Folgas, férias, feriados e bloqueios de horário
create table if not exists public.time_off (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  kind       text not null default 'bloqueio' check (kind in ('folga','ferias','feriado','bloqueio','pausa')),
  reason     text not null default '',
  check (ends_at > starts_at)
);
create index if not exists time_off_tenant_idx on public.time_off(tenant_id, starts_at);

-- ------------------------------------------------------------- clientes
create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  phone         text not null,
  phone_digits  text not null,
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  unique (tenant_id, phone_digits)
);

-- ------------------------------------------------------------- agendamentos
create table if not exists public.appointments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete restrict,
  code         text not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  block_until  timestamptz not null,          -- fim + intervalo de preparo
  status       text not null default 'pending'
               check (status in ('pending','confirmed','completed','cancelled','no_show')),
  services     jsonb not null,                -- retrato dos serviços no momento da reserva
  total        numeric(10,2) not null,
  deposit_due  numeric(10,2) not null default 0,
  source       text not null default 'site' check (source in ('site','painel')),
  policy_accepted boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (tenant_id, code),
  check (ends_at > starts_at and block_until >= ends_at)
);
create index if not exists appointments_tenant_time_idx on public.appointments(tenant_id, starts_at);

-- >>> CONTROLE DE CONCORRÊNCIA: impossível existir dois atendimentos ativos sobrepostos
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_no_overlap') then
    alter table public.appointments add constraint appointments_no_overlap
      exclude using gist (tenant_id with =, tstzrange(starts_at, block_until, '[)') with &&)
      where (status in ('pending','confirmed','completed'));
  end if;
end $$;

-- ------------------------------------------------------------- pagamentos
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  appointment_id  uuid not null references public.appointments(id) on delete cascade,
  kind            text not null check (kind in ('deposit','balance','full','refund')),
  method          text not null check (method in ('pix','card','cash','transfer','other')),
  amount          numeric(10,2) not null check (amount > 0),
  status          text not null default 'confirmed' check (status in ('confirmed','voided')),
  -- origem da confirmação: 'manual' (profissional) ou, no futuro, 'gateway' (webhook)
  confirmation    text not null default 'manual' check (confirmation in ('manual','gateway')),
  provider        text,
  provider_ref    text,
  note            text not null default '',
  confirmed_by    uuid,
  created_at      timestamptz not null default now()
);
create index if not exists payments_tenant_idx on public.payments(tenant_id, created_at);
create index if not exists payments_appt_idx on public.payments(appointment_id);

-- ------------------------------------------------------------- histórico e solicitações
create table if not exists public.appointment_events (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  appointment_id  uuid not null references public.appointments(id) on delete cascade,
  type            text not null,
  actor           text not null check (actor in ('client','professional','system')),
  actor_user      uuid,
  reason          text not null default '',
  data            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists events_appt_idx on public.appointment_events(appointment_id, created_at);
create index if not exists events_tenant_idx on public.appointment_events(tenant_id, created_at desc);

create table if not exists public.change_requests (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  appointment_id  uuid not null references public.appointments(id) on delete cascade,
  type            text not null check (type in ('cancel','reschedule')),
  reason          text not null default '',
  preferred       text not null default '',
  status          text not null default 'open' check (status in ('open','accepted','declined')),
  response        text not null default '',
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index if not exists requests_tenant_idx on public.change_requests(tenant_id, status, created_at desc);

-- ------------------------------------------------------------- galeria (antes/depois)
create table if not exists public.gallery_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  title       text not null,
  before_url  text,
  after_url   text not null,
  credit      text not null default '',
  is_illustrative boolean not null default true,
  sort        integer not null default 0
);

-- =====================================================================
-- FUNÇÕES AUXILIARES
-- =====================================================================
create or replace function app.uid() returns uuid
language sql stable as $$ select auth.uid() $$;

create or replace function app.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenant_members m where m.tenant_id = t and m.user_id = auth.uid());
$$;

create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;

create or replace function app.digits(t text) returns text
language sql immutable as $$ select regexp_replace(coalesce(t,''), '\D', '', 'g') $$;

create or replace function app.hm(t time) returns text
language sql immutable as $$ select to_char(t, 'HH24:MI') $$;

create or replace function app.err(code text, msg text) returns void
language plpgsql as $$ begin raise exception '%', msg using errcode = 'P0001', hint = code; end $$;

create or replace function app.require_member(t uuid) returns void
language plpgsql stable as $$
begin
  if auth.uid() is null then perform app.err('AUTH', 'Sessão expirada. Entre novamente.'); end if;
  if t is null or not app.is_member(t) then perform app.err('FORBIDDEN', 'Acesso negado a esta conta.'); end if;
end $$;

-- Períodos de atendimento de uma data (considera datas especiais)
create or replace function app.periods_for(t uuid, d date)
returns table(start_time time, end_time time)
language sql stable security definer set search_path = public as $$
  select (p->>'start')::time, (p->>'end')::time
    from public.special_days s, jsonb_array_elements(s.periods) p
   where s.tenant_id = t and s.day = d
  union all
  select h.start_time, h.end_time from public.business_hours h
   where h.tenant_id = t and h.weekday = extract(dow from d)::int
     and not exists (select 1 from public.special_days s where s.tenant_id = t and s.day = d)
$$;

create or replace function app.new_code(t uuid) returns text
language plpgsql volatile as $$
declare c text;
begin
  loop
    -- 6 caracteres sem 0/O/1/I para facilitar a leitura
    c := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
            from generate_series(1, 6));
    exit when not exists (select 1 from public.appointments where tenant_id = t and code = c);
  end loop;
  return c;
end $$;

-- Situação financeira de um agendamento
create or replace function app.paid_amount(a uuid) returns numeric
language sql stable as $$
  select coalesce(sum(case when kind = 'refund' then -amount else amount end), 0)
    from public.payments where appointment_id = a and status = 'confirmed'
$$;

create or replace function app.appt_json(a public.appointments, tz text) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', a.id, 'code', a.code, 'status', a.status,
    'date', to_char(a.starts_at at time zone tz, 'YYYY-MM-DD'),
    'start', to_char(a.starts_at at time zone tz, 'HH24:MI'),
    'end', to_char(a.ends_at at time zone tz, 'HH24:MI'),
    'duration_min', (extract(epoch from (a.ends_at - a.starts_at)) / 60)::int,
    'services', a.services, 'total', a.total, 'deposit_due', a.deposit_due,
    'paid', app.paid_amount(a.id),
    'remaining', a.total - app.paid_amount(a.id),
    'payment_status', case
        when app.paid_amount(a.id) >= a.total then 'paid'
        when app.paid_amount(a.id) >= a.deposit_due and a.deposit_due > 0 then 'deposit_paid'
        when app.paid_amount(a.id) > 0 then 'partial'
        else 'unpaid' end,
    'source', a.source, 'created_at', a.created_at,
    'client', (select jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone) from public.clients c where c.id = a.client_id),
    'open_requests', (select count(*) from public.change_requests r where r.appointment_id = a.id and r.status = 'open')
  )
$$;

create or replace function app.log(a public.appointments, ev text, actor text, reason text default '', data jsonb default '{}')
returns void language sql as $$
  insert into public.appointment_events(tenant_id, appointment_id, type, actor, actor_user, reason, data)
  values (a.tenant_id, a.id, ev, actor, auth.uid(), coalesce(reason,''), coalesce(data,'{}'::jsonb))
$$;

-- =====================================================================
-- FUNÇÕES PÚBLICAS (site da cliente) — SECURITY DEFINER, só dados públicos
-- =====================================================================

-- Perfil público, serviços, regras da agenda e galeria
create or replace function public.public_site(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t public.tenants;
begin
  select * into t from public.tenants where slug = p->>'slug' and status = 'active';
  if not found then perform app.err('NOT_FOUND', 'Profissional não encontrada.'); end if;
  return jsonb_build_object(
    'tenant', jsonb_build_object(
      'slug', t.slug, 'name', t.name, 'tagline', t.tagline, 'logo_url', t.logo_url, 'hero_url', t.hero_url,
      'theme', t.theme, 'whatsapp', t.whatsapp, 'instagram_url', t.instagram_url,
      'address_line1', t.address_line1, 'address_line2', t.address_line2, 'address_is_demo', t.address_is_demo,
      'maps_url', t.maps_url, 'pix_key', t.pix_key, 'is_demo', t.is_demo, 'timezone', t.timezone),
    'agenda', jsonb_build_object(
      'slot_step_min', t.slot_step_min, 'buffer_min', t.buffer_min, 'min_notice_min', t.min_notice_min,
      'window_days', t.window_days, 'deposit_percent', t.deposit_percent,
      'cancel_policy_text', t.cancel_policy_text, 'cancel_deadline_hours', t.cancel_deadline_hours,
      'deposit_retention', t.deposit_retention,
      'today', to_char(now() at time zone t.timezone, 'YYYY-MM-DD'),
      'now_min', (extract(hour from now() at time zone t.timezone) * 60 + extract(minute from now() at time zone t.timezone))::int,
      'weekly', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'start', app.hm(h.start_time), 'end', app.hm(h.end_time)) order by h.weekday, h.start_time)
                 from public.business_hours h where h.tenant_id = t.id), '[]'::jsonb),
      'special_days', coalesce((select jsonb_agg(jsonb_build_object('date', s.day, 'periods', s.periods)) from public.special_days s
                 where s.tenant_id = t.id and s.day >= (now() at time zone t.timezone)::date), '[]'::jsonb)),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description,
                 'image_url', s.image_url, 'price', s.price, 'duration_min', s.duration_min) order by s.sort, s.created_at)
                 from public.services s where s.tenant_id = t.id and s.active), '[]'::jsonb),
    'gallery', coalesce((select jsonb_agg(jsonb_build_object('title', g.title, 'before_url', g.before_url, 'after_url', g.after_url,
                 'credit', g.credit, 'is_illustrative', g.is_illustrative) order by g.sort)
                 from public.gallery_items g where g.tenant_id = t.id), '[]'::jsonb)
  );
end $$;

-- Horários ocupados (sem dados pessoais): agendamentos ativos e bloqueios
create or replace function public.public_busy(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t public.tenants; d1 date; d2 date;
begin
  select * into t from public.tenants where slug = p->>'slug' and status = 'active';
  if not found then perform app.err('NOT_FOUND', 'Profissional não encontrada.'); end if;
  d1 := coalesce((p->>'from')::date, (now() at time zone t.timezone)::date);
  d2 := least(coalesce((p->>'to')::date, d1 + t.window_days), d1 + 120);
  return jsonb_build_object(
    'bookings', coalesce((select jsonb_agg(jsonb_build_object(
        'date', to_char(a.starts_at at time zone t.timezone, 'YYYY-MM-DD'),
        'start', to_char(a.starts_at at time zone t.timezone, 'HH24:MI'),
        'durationMin', (extract(epoch from (a.ends_at - a.starts_at)) / 60)::int))
      from public.appointments a
      where a.tenant_id = t.id and a.status in ('pending','confirmed','completed')
        and a.starts_at >= (d1::timestamp at time zone t.timezone)
        and a.starts_at <  ((d2 + 1)::timestamp at time zone t.timezone)), '[]'::jsonb),
    -- bloqueios recortados por dia, em horário local
    'blocks', coalesce((select jsonb_agg(jsonb_build_object(
        'date', to_char(g.day, 'YYYY-MM-DD'),
        'start', to_char(greatest(o.starts_at at time zone t.timezone, g.day::timestamp), 'HH24:MI'),
        'end', case when (o.ends_at at time zone t.timezone) >= (g.day + 1)::timestamp then '24:00'
                    else to_char(o.ends_at at time zone t.timezone, 'HH24:MI') end))
      from public.time_off o
      cross join lateral (select gs::date as day from generate_series((o.starts_at at time zone t.timezone)::date,
                                         ((o.ends_at - interval '1 second') at time zone t.timezone)::date, interval '1 day') gs) g
      where o.tenant_id = t.id and o.ends_at > (d1::timestamp at time zone t.timezone)
        and o.starts_at < ((d2 + 1)::timestamp at time zone t.timezone)
        and g.day between d1 and d2), '[]'::jsonb)
  );
end $$;

-- Cria o agendamento com TODAS as validações no servidor
create or replace function public.public_book(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  t public.tenants; d date; st time; ids uuid[]; n_ids int;
  dur int; tot numeric; dep numeric; svc jsonb;
  s_at timestamptz; e_at timestamptz; local_now timestamp;
  cl public.clients; a public.appointments; nm text; ph text;
begin
  select * into t from public.tenants where slug = p->>'slug' and status = 'active';
  if not found then perform app.err('NOT_FOUND', 'Profissional não encontrada.'); end if;

  nm := btrim(regexp_replace(coalesce(p->>'name',''), '\s+', ' ', 'g'));
  ph := btrim(coalesce(p->>'phone',''));
  if length(nm) < 5 or position(' ' in nm) = 0 then perform app.err('INVALID', 'Informe nome e sobrenome.'); end if;
  if length(app.digits(ph)) not between 10 and 13 then perform app.err('INVALID', 'Informe um WhatsApp válido com DDD.'); end if;
  if t.cancel_policy_text <> '' and coalesce((p->>'accept_policy')::boolean, false) is not true then
    perform app.err('POLICY', 'É preciso aceitar a política de cancelamento.');
  end if;

  begin
    d := (p->>'date')::date; st := (p->>'start')::time;
    select array_agg(distinct x::uuid) into ids from jsonb_array_elements_text(p->'service_ids') x;
  exception when others then perform app.err('INVALID', 'Dados do agendamento inválidos.');
  end;
  n_ids := coalesce(array_length(ids, 1), 0);
  if n_ids = 0 then perform app.err('INVALID', 'Escolha ao menos um procedimento.'); end if;

  select sum(s.duration_min), sum(s.price),
         jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'price', s.price, 'duration_min', s.duration_min) order by s.sort)
    into dur, tot, svc
    from public.services s where s.tenant_id = t.id and s.active and s.id = any(ids);
  if (select count(*) from public.services s where s.tenant_id = t.id and s.active and s.id = any(ids)) <> n_ids then
    perform app.err('INVALID', 'Procedimento indisponível.');
  end if;
  dep := round(tot * t.deposit_percent / 100.0, 2);

  local_now := now() at time zone t.timezone;
  if d < local_now::date or d > local_now::date + t.window_days then
    perform app.err('OUT_OF_WINDOW', 'Data fora do período de agendamento.');
  end if;
  if (d + st) < local_now + make_interval(mins => t.min_notice_min) then
    perform app.err('TOO_SOON', 'Este horário exige mais antecedência.');
  end if;
  if not exists (select 1 from app.periods_for(t.id, d) pr
                  where st >= pr.start_time and (st + make_interval(mins => dur))::time <= pr.end_time
                    and st + make_interval(mins => dur) > st) then
    perform app.err('OUTSIDE_HOURS', 'Horário fora do expediente.');
  end if;

  s_at := (d + st) at time zone t.timezone;
  e_at := s_at + make_interval(mins => dur);
  if exists (select 1 from public.time_off o where o.tenant_id = t.id
              and tstzrange(o.starts_at, o.ends_at) && tstzrange(s_at, e_at)) then
    perform app.err('BLOCKED', 'Horário bloqueado pela profissional.');
  end if;

  insert into public.clients(tenant_id, name, phone, phone_digits)
  values (t.id, nm, ph, app.digits(ph))
  on conflict (tenant_id, phone_digits) do update set phone = excluded.phone
  returning * into cl;

  begin
    insert into public.appointments(tenant_id, client_id, code, starts_at, ends_at, block_until,
                                    status, services, total, deposit_due, source, policy_accepted)
    values (t.id, cl.id, app.new_code(t.id), s_at, e_at, e_at + make_interval(mins => t.buffer_min),
            'pending', svc, tot, dep, 'site', coalesce((p->>'accept_policy')::boolean, false))
    returning * into a;
  exception when exclusion_violation then
    perform app.err('SLOT_TAKEN', 'Este horário acabou de ser reservado. Escolha outro, por favor.');
  end;

  perform app.log(a, 'created', 'client', '', jsonb_build_object('name_informed', nm));
  return jsonb_build_object('code', a.code, 'status', a.status, 'date', d, 'start', app.hm(st),
                            'end', to_char(e_at at time zone t.timezone, 'HH24:MI'),
                            'total', tot, 'deposit_due', dep, 'duration_min', dur, 'services', svc);
end $$;

-- Cliente pede cancelamento ou remarcação (confirma com protocolo + telefone)
create or replace function public.public_request_change(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare t public.tenants; a public.appointments; typ text;
begin
  select * into t from public.tenants where slug = p->>'slug' and status = 'active';
  if not found then perform app.err('NOT_FOUND', 'Profissional não encontrada.'); end if;
  typ := p->>'type';
  if typ not in ('cancel','reschedule') then perform app.err('INVALID', 'Tipo de solicitação inválido.'); end if;
  select a2.* into a from public.appointments a2 join public.clients c on c.id = a2.client_id
   where a2.tenant_id = t.id and a2.code = upper(btrim(p->>'code')) and c.phone_digits = app.digits(p->>'phone');
  if not found then perform app.err('NOT_FOUND', 'Não encontramos agendamento com esse protocolo e telefone.'); end if;
  if a.status not in ('pending','confirmed') then perform app.err('INVALID', 'Este agendamento não pode mais ser alterado.'); end if;
  if exists (select 1 from public.change_requests r where r.appointment_id = a.id and r.status = 'open') then
    perform app.err('DUPLICATE', 'Já existe uma solicitação em análise para este agendamento.');
  end if;
  insert into public.change_requests(tenant_id, appointment_id, type, reason, preferred)
  values (t.id, a.id, typ, left(coalesce(p->>'reason',''), 500), left(coalesce(p->>'preferred',''), 200));
  perform app.log(a, case typ when 'cancel' then 'cancel_requested' else 'reschedule_requested' end, 'client',
                  left(coalesce(p->>'reason',''), 500), jsonb_build_object('preferred', p->>'preferred'));
  return jsonb_build_object('ok', true,
    'date', to_char(a.starts_at at time zone t.timezone, 'YYYY-MM-DD'),
    'start', to_char(a.starts_at at time zone t.timezone, 'HH24:MI'),
    'within_deadline', a.starts_at - now() < make_interval(hours => t.cancel_deadline_hours),
    'policy', t.cancel_policy_text);
end $$;

-- Login digitando telefone: devolve o e-mail de acesso da profissional daquele site
create or replace function public.public_login_email(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare e text;
begin
  select u.email into e
    from public.tenant_members m join public.tenants t on t.id = m.tenant_id
    join auth.users u on u.id = m.user_id
   where t.slug = p->>'slug' and m.login_phone is not null and app.digits(m.login_phone) = app.digits(p->>'phone')
   limit 1;
  return jsonb_build_object('email', e);
end $$;

-- Pedido de cadastro de nova profissional (fluxo comercial futuro)
create or replace function public.public_signup_request(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  insert into public.signup_requests(business, contact, email, segment)
  values (left(p->>'business',100), left(p->>'contact',100), left(p->>'email',200), left(coalesce(p->>'segment',''),60));
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- FUNÇÕES DO PAINEL — SECURITY INVOKER (RLS vale) + checagem de membro
-- =====================================================================

create or replace function public.admin_me(p jsonb default '{}') returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'tenants', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'role', m.role,
                                                             'status', t.status, 'plan_id', t.plan_id))
                           from public.tenant_members m join public.tenants t on t.id = m.tenant_id
                          where m.user_id = auth.uid()), '[]'::jsonb),
    'platform_admin', app.is_platform_admin())
$$;

create or replace function public.admin_overview(p jsonb) returns jsonb
language plpgsql stable as $$
declare tid uuid := (p->>'tenant_id')::uuid; t public.tenants; today date; wk_start date; mo_start date;
begin
  perform app.require_member(tid);
  select * into t from public.tenants where id = tid;
  today := (now() at time zone t.timezone)::date;
  wk_start := today - extract(dow from today)::int;     -- semana de domingo a sábado
  mo_start := date_trunc('month', today)::date;
  return jsonb_build_object(
    'today', today,
    'today_count', (select count(*) from public.appointments a where a.tenant_id = tid and a.status in ('pending','confirmed','completed')
                      and (a.starts_at at time zone t.timezone)::date = today),
    'week_count', (select count(*) from public.appointments a where a.tenant_id = tid and a.status in ('pending','confirmed','completed')
                      and (a.starts_at at time zone t.timezone)::date between wk_start and wk_start + 6),
    'month_clients', (select count(distinct a.client_id) from public.appointments a where a.tenant_id = tid
                      and a.status in ('pending','confirmed','completed')
                      and (a.starts_at at time zone t.timezone)::date between mo_start and (mo_start + interval '1 month' - interval '1 day')::date),
    'pending_count', (select count(*) from public.appointments a where a.tenant_id = tid and a.status = 'pending' and a.starts_at >= now() - interval '1 day'),
    'deposits_received', (select coalesce(sum(amount),0) from public.payments y where y.tenant_id = tid and y.status = 'confirmed' and y.kind = 'deposit'
                      and (y.created_at at time zone t.timezone)::date >= mo_start),
    'received_month', (select coalesce(sum(case when kind='refund' then -amount else amount end),0) from public.payments y
                      where y.tenant_id = tid and y.status = 'confirmed' and (y.created_at at time zone t.timezone)::date >= mo_start),
    'pending_amount', (select coalesce(sum(a.total - app.paid_amount(a.id)),0) from public.appointments a where a.tenant_id = tid
                      and a.status in ('pending','confirmed') and a.starts_at >= now() - interval '1 day'),
    'open_requests', (select count(*) from public.change_requests r where r.tenant_id = tid and r.status = 'open'),
    'upcoming', coalesce((select jsonb_agg(x.j order by x.s) from (
                  select app.appt_json(a, t.timezone) j, a.starts_at s from public.appointments a
                   where a.tenant_id = tid and a.status in ('pending','confirmed') and a.ends_at >= now()
                   order by a.starts_at limit 6) x), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_appointments(p jsonb) returns jsonb
language plpgsql stable as $$
declare tid uuid := (p->>'tenant_id')::uuid; t public.tenants; d1 date; d2 date;
begin
  perform app.require_member(tid);
  select * into t from public.tenants where id = tid;
  d1 := (p->>'from')::date; d2 := coalesce((p->>'to')::date, d1);
  return coalesce((select jsonb_agg(app.appt_json(a, t.timezone) order by a.starts_at)
    from public.appointments a
    where a.tenant_id = tid
      and a.starts_at >= (d1::timestamp at time zone t.timezone)
      and a.starts_at <  ((d2 + 1)::timestamp at time zone t.timezone)
      and (p->>'status' is null or a.status = p->>'status')), '[]'::jsonb);
end $$;

create or replace function public.admin_appointment(p jsonb) returns jsonb
language plpgsql stable as $$
declare tid uuid := (p->>'tenant_id')::uuid; t public.tenants; a public.appointments;
begin
  perform app.require_member(tid);
  select * into t from public.tenants where id = tid;
  select * into a from public.appointments where id = (p->>'id')::uuid and tenant_id = tid;
  if not found then perform app.err('NOT_FOUND', 'Agendamento não encontrado.'); end if;
  return app.appt_json(a, t.timezone) || jsonb_build_object(
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'kind', y.kind, 'method', y.method, 'amount', y.amount,
                 'status', y.status, 'confirmation', y.confirmation, 'note', y.note, 'created_at', y.created_at) order by y.created_at)
                 from public.payments y where y.appointment_id = a.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e.type, 'actor', e.actor, 'reason', e.reason, 'data', e.data,
                 'created_at', e.created_at) order by e.created_at)
                 from public.appointment_events e where e.appointment_id = a.id), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'type', r.type, 'reason', r.reason, 'preferred', r.preferred,
                 'status', r.status, 'response', r.response, 'created_at', r.created_at) order by r.created_at)
                 from public.change_requests r where r.appointment_id = a.id), '[]'::jsonb),
    'policy', jsonb_build_object('text', t.cancel_policy_text, 'deadline_hours', t.cancel_deadline_hours,
                 'deposit_retention', t.deposit_retention, 'accepted', a.policy_accepted,
                 'within_deadline', a.starts_at - now() < make_interval(hours => t.cancel_deadline_hours))
  );
end $$;

create or replace function public.admin_set_status(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid; a public.appointments; old text; nw text := p->>'status';
begin
  perform app.require_member(tid);
  select * into a from public.appointments where id = (p->>'id')::uuid and tenant_id = tid for update;
  if not found then perform app.err('NOT_FOUND', 'Agendamento não encontrado.'); end if;
  if nw not in ('pending','confirmed','completed','cancelled','no_show') then perform app.err('INVALID', 'Situação inválida.'); end if;
  if nw = 'cancelled' and length(btrim(coalesce(p->>'reason',''))) < 3 then perform app.err('INVALID', 'Informe o motivo do cancelamento.'); end if;
  old := a.status;
  begin
    update public.appointments set status = nw where id = a.id returning * into a;
  exception when exclusion_violation then
    perform app.err('SLOT_TAKEN', 'Não é possível reativar: o horário já foi ocupado por outro agendamento.');
  end;
  perform app.log(a, 'status_changed', 'professional', p->>'reason', jsonb_build_object('from', old, 'to', nw));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_reschedule(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid; t public.tenants; a public.appointments;
        d date := (p->>'date')::date; st time := (p->>'start')::time; dur interval; s_at timestamptz; old_d text;
begin
  perform app.require_member(tid);
  select * into t from public.tenants where id = tid;
  select * into a from public.appointments where id = (p->>'id')::uuid and tenant_id = tid for update;
  if not found then perform app.err('NOT_FOUND', 'Agendamento não encontrado.'); end if;
  if a.status not in ('pending','confirmed') then perform app.err('INVALID', 'Só é possível remarcar agendamentos ativos.'); end if;
  dur := a.ends_at - a.starts_at;
  s_at := (d + st) at time zone t.timezone;
  old_d := to_char(a.starts_at at time zone t.timezone, 'YYYY-MM-DD HH24:MI');
  begin
    update public.appointments set starts_at = s_at, ends_at = s_at + dur,
           block_until = s_at + dur + make_interval(mins => t.buffer_min)
     where id = a.id returning * into a;
  exception when exclusion_violation then
    perform app.err('SLOT_TAKEN', 'Esse horário conflita com outro agendamento.');
  end;
  perform app.log(a, 'rescheduled', 'professional', p->>'reason',
                  jsonb_build_object('from', old_d, 'to', to_char(s_at at time zone t.timezone, 'YYYY-MM-DD HH24:MI')));
  return jsonb_build_object('ok', true);
end $$;

-- Registro MANUAL de pagamento (Pix, cartão, dinheiro…) confirmado pela profissional
create or replace function public.admin_record_payment(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid; a public.appointments; y public.payments;
begin
  perform app.require_member(tid);
  select * into a from public.appointments where id = (p->>'appointment_id')::uuid and tenant_id = tid for update;
  if not found then perform app.err('NOT_FOUND', 'Agendamento não encontrado.'); end if;
  if coalesce((p->>'amount')::numeric, 0) <= 0 then perform app.err('INVALID', 'Informe um valor maior que zero.'); end if;
  insert into public.payments(tenant_id, appointment_id, kind, method, amount, note, confirmation, confirmed_by)
  values (tid, a.id, p->>'kind', p->>'method', (p->>'amount')::numeric, coalesce(p->>'note',''), 'manual', auth.uid())
  returning * into y;
  perform app.log(a, 'payment_confirmed', 'professional', coalesce(p->>'note',''),
                  jsonb_build_object('kind', y.kind, 'method', y.method, 'amount', y.amount));
  -- sinal confirmado manualmente → agendamento confirmado
  if a.status = 'pending' and y.kind <> 'refund' and app.paid_amount(a.id) >= a.deposit_due then
    update public.appointments set status = 'confirmed' where id = a.id returning * into a;
    perform app.log(a, 'status_changed', 'system', 'Sinal registrado pela profissional', jsonb_build_object('from', 'pending', 'to', 'confirmed'));
  end if;
  return jsonb_build_object('ok', true, 'payment_id', y.id);
end $$;

create or replace function public.admin_void_payment(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid; y public.payments; a public.appointments;
begin
  perform app.require_member(tid);
  update public.payments set status = 'voided' where id = (p->>'id')::uuid and tenant_id = tid and status = 'confirmed' returning * into y;
  if not found then perform app.err('NOT_FOUND', 'Pagamento não encontrado.'); end if;
  select * into a from public.appointments where id = y.appointment_id;
  perform app.log(a, 'payment_voided', 'professional', coalesce(p->>'reason',''), jsonb_build_object('amount', y.amount, 'method', y.method));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_payments(p jsonb) returns jsonb
language plpgsql stable as $$
declare tid uuid := (p->>'tenant_id')::uuid; t public.tenants;
begin
  perform app.require_member(tid);
  select * into t from public.tenants where id = tid;
  return jsonb_build_object(
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', y.id, 'kind', y.kind, 'method', y.method, 'amount', y.amount, 'status', y.status, 'confirmation', y.confirmation,
        'note', y.note, 'created_at', y.created_at, 'date', to_char(y.created_at at time zone t.timezone, 'YYYY-MM-DD'),
        'appointment_id', a.id, 'code', a.code, 'client', c.name,
        'appt_date', to_char(a.starts_at at time zone t.timezone, 'YYYY-MM-DD')) order by y.created_at desc)
      from public.payments y join public.appointments a on a.id = y.appointment_id join public.clients c on c.id = a.client_id
      where y.tenant_id = tid
        and (p->>'from' is null or (y.created_at at time zone t.timezone)::date >= (p->>'from')::date)
        and (p->>'to' is null or (y.created_at at time zone t.timezone)::date <= (p->>'to')::date)
        and (p->>'method' is null or y.method = p->>'method')), '[]'::jsonb),
    'open', coalesce((select jsonb_agg(app.appt_json(a, t.timezone) order by a.starts_at)
      from public.appointments a
      where a.tenant_id = tid and a.status in ('pending','confirmed','completed') and app.paid_amount(a.id) < a.total
        and (p->>'from' is null or (a.starts_at at time zone t.timezone)::date >= (p->>'from')::date)
        and (p->>'to' is null or (a.starts_at at time zone t.timezone)::date <= (p->>'to')::date)), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_clients(p jsonb) returns jsonb
language plpgsql stable as $$
declare tid uuid := (p->>'tenant_id')::uuid; q text := btrim(coalesce(p->>'q','')); t public.tenants;
begin
  perform app.require_member(tid);
  select * into t from public.tenants where id = tid;
  return coalesce((select jsonb_agg(x.j order by x.n) from (
    select c.name n, jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone,
      'visits', (select count(*) from public.appointments a where a.client_id = c.id and a.status = 'completed'),
      'total_appointments', (select count(*) from public.appointments a where a.client_id = c.id),
      'paid', (select coalesce(sum(case when y.kind='refund' then -y.amount else y.amount end),0) from public.payments y
               join public.appointments a on a.id = y.appointment_id where a.client_id = c.id and y.status = 'confirmed'),
      'next', (select to_char(a.starts_at at time zone t.timezone, 'YYYY-MM-DD HH24:MI') from public.appointments a
               where a.client_id = c.id and a.status in ('pending','confirmed') and a.starts_at >= now() order by a.starts_at limit 1)) j
    from public.clients c
    where c.tenant_id = tid
      and (q = '' or c.name ilike '%' || q || '%' or (app.digits(q) <> '' and c.phone_digits like '%' || app.digits(q) || '%'))
    limit 300) x), '[]'::jsonb);
end $$;

create or replace function public.admin_client(p jsonb) returns jsonb
language plpgsql stable as $$
declare tid uuid := (p->>'tenant_id')::uuid; t public.tenants; c public.clients;
begin
  perform app.require_member(tid);
  select * into t from public.tenants where id = tid;
  select * into c from public.clients where id = (p->>'id')::uuid and tenant_id = tid;
  if not found then perform app.err('NOT_FOUND', 'Cliente não encontrada.'); end if;
  return jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'notes', c.notes, 'since', c.created_at,
    'appointments', coalesce((select jsonb_agg(app.appt_json(a, t.timezone) order by a.starts_at desc)
                     from public.appointments a where a.client_id = c.id), '[]'::jsonb));
end $$;

create or replace function public.admin_save_client_notes(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid;
begin
  perform app.require_member(tid);
  update public.clients set notes = left(coalesce(p->>'notes',''), 2000) where id = (p->>'id')::uuid and tenant_id = tid;
  return jsonb_build_object('ok', found);
end $$;

-- Configurações completas da conta (para as telas de edição)
create or replace function public.admin_settings(p jsonb) returns jsonb
language plpgsql stable as $$
declare tid uuid := (p->>'tenant_id')::uuid; t public.tenants;
begin
  perform app.require_member(tid);
  select * into t from public.tenants where id = tid;
  return jsonb_build_object(
    'tenant', to_jsonb(t),
    'services', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort, s.created_at) from public.services s where s.tenant_id = tid), '[]'::jsonb),
    'weekly', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'start', app.hm(h.start_time), 'end', app.hm(h.end_time)) order by h.weekday, h.start_time)
                 from public.business_hours h where h.tenant_id = tid), '[]'::jsonb),
    'special_days', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'date', s.day, 'periods', s.periods, 'note', s.note) order by s.day)
                 from public.special_days s where s.tenant_id = tid and s.day >= (now() at time zone t.timezone)::date - 30), '[]'::jsonb),
    'time_off', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'reason', o.reason,
                 'start', to_char(o.starts_at at time zone t.timezone, 'YYYY-MM-DD HH24:MI'),
                 'end', to_char(o.ends_at at time zone t.timezone, 'YYYY-MM-DD HH24:MI')) order by o.starts_at)
                 from public.time_off o where o.tenant_id = tid and o.ends_at >= now() - interval '30 days'), '[]'::jsonb),
    'gallery', coalesce((select jsonb_agg(to_jsonb(g) order by g.sort) from public.gallery_items g where g.tenant_id = tid), '[]'::jsonb),
    'plan', (select to_jsonb(pl) from public.plans pl where pl.id = t.plan_id)
  );
end $$;

create or replace function public.admin_save_profile(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid; v jsonb := p->'profile';
begin
  perform app.require_member(tid);
  update public.tenants set
    name = coalesce(nullif(btrim(v->>'name'),''), name),
    tagline = coalesce(v->>'tagline', tagline),
    logo_url = coalesce(v->>'logo_url', logo_url),
    hero_url = coalesce(v->>'hero_url', hero_url),
    theme = coalesce(v->'theme', theme),
    whatsapp = case when v ? 'whatsapp' then app.digits(v->>'whatsapp') else whatsapp end,
    instagram_url = coalesce(v->>'instagram_url', instagram_url),
    address_line1 = coalesce(v->>'address_line1', address_line1),
    address_line2 = coalesce(v->>'address_line2', address_line2),
    address_is_demo = coalesce((v->>'address_is_demo')::boolean, address_is_demo),
    maps_url = coalesce(v->>'maps_url', maps_url),
    pix_key = coalesce(v->>'pix_key', pix_key)
  where id = tid;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_save_service(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid; v jsonb := p->'service'; sid uuid; lim int;
begin
  perform app.require_member(tid);
  if length(btrim(coalesce(v->>'name',''))) < 2 then perform app.err('INVALID', 'Informe o nome do procedimento.'); end if;
  if coalesce((v->>'price')::numeric, -1) < 0 then perform app.err('INVALID', 'Informe um preço válido.'); end if;
  if coalesce((v->>'duration_min')::int, 0) not between 5 and 600 then perform app.err('INVALID', 'Duração entre 5 e 600 minutos.'); end if;
  if v->>'id' is null then
    select pl.max_services into lim from public.tenants t join public.plans pl on pl.id = t.plan_id where t.id = tid;
    if lim is not null and (select count(*) from public.services where tenant_id = tid) >= lim then
      perform app.err('PLAN_LIMIT', 'Seu plano permite até ' || lim || ' procedimentos.');
    end if;
    insert into public.services(tenant_id, name, description, image_url, price, duration_min, active, sort)
    values (tid, btrim(v->>'name'), coalesce(v->>'description',''), nullif(v->>'image_url',''), (v->>'price')::numeric,
            (v->>'duration_min')::int, coalesce((v->>'active')::boolean, true),
            coalesce((v->>'sort')::int, (select coalesce(max(sort),0)+1 from public.services where tenant_id = tid)))
    returning id into sid;
  else
    update public.services set name = btrim(v->>'name'), description = coalesce(v->>'description',''),
           image_url = nullif(v->>'image_url',''), price = (v->>'price')::numeric, duration_min = (v->>'duration_min')::int,
           active = coalesce((v->>'active')::boolean, true), sort = coalesce((v->>'sort')::int, sort)
     where id = (v->>'id')::uuid and tenant_id = tid returning id into sid;
    if sid is null then perform app.err('NOT_FOUND', 'Procedimento não encontrado.'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', sid);
end $$;

create or replace function public.admin_delete_service(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid;
begin
  perform app.require_member(tid);
  delete from public.services where id = (p->>'id')::uuid and tenant_id = tid;   -- agendamentos guardam retrato próprio
  return jsonb_build_object('ok', found);
end $$;

-- Horários semanais + regras gerais da agenda
create or replace function public.admin_save_hours(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid; r jsonb; s jsonb := p->'settings';
begin
  perform app.require_member(tid);
  if p ? 'weekly' then
    delete from public.business_hours where tenant_id = tid;
    for r in select * from jsonb_array_elements(p->'weekly') loop
      if (r->>'end')::time <= (r->>'start')::time then perform app.err('INVALID', 'Período com horário final antes do inicial.'); end if;
      insert into public.business_hours(tenant_id, weekday, start_time, end_time)
      values (tid, (r->>'weekday')::smallint, (r->>'start')::time, (r->>'end')::time);
    end loop;
    if exists (select 1 from public.business_hours a join public.business_hours b
                on a.tenant_id = b.tenant_id and a.weekday = b.weekday and a.id <> b.id
               where a.tenant_id = tid and a.start_time < b.end_time and b.start_time < a.end_time) then
      perform app.err('INVALID', 'Há períodos sobrepostos no mesmo dia.');
    end if;
  end if;
  if s is not null then
    update public.tenants set
      slot_step_min = coalesce((s->>'slot_step_min')::int, slot_step_min),
      buffer_min = coalesce((s->>'buffer_min')::int, buffer_min),
      min_notice_min = coalesce((s->>'min_notice_min')::int, min_notice_min),
      window_days = coalesce((s->>'window_days')::int, window_days),
      deposit_percent = coalesce((s->>'deposit_percent')::int, deposit_percent),
      cancel_policy_text = coalesce(s->>'cancel_policy_text', cancel_policy_text),
      cancel_deadline_hours = coalesce((s->>'cancel_deadline_hours')::int, cancel_deadline_hours),
      deposit_retention = coalesce((s->>'deposit_retention')::boolean, deposit_retention)
    where id = tid;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_save_special_day(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid;
begin
  perform app.require_member(tid);
  insert into public.special_days(tenant_id, day, periods, note)
  values (tid, (p->>'date')::date, coalesce(p->'periods','[]'::jsonb), coalesce(p->>'note',''))
  on conflict (tenant_id, day) do update set periods = excluded.periods, note = excluded.note;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_delete_special_day(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid;
begin
  perform app.require_member(tid);
  delete from public.special_days where id = (p->>'id')::uuid and tenant_id = tid;
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.admin_add_time_off(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid; t public.tenants; s timestamptz; e timestamptz; n int;
begin
  perform app.require_member(tid);
  select * into t from public.tenants where id = tid;
  s := ((p->>'start')::timestamp) at time zone t.timezone;
  e := ((p->>'end')::timestamp) at time zone t.timezone;
  if e <= s then perform app.err('INVALID', 'O fim precisa ser depois do início.'); end if;
  insert into public.time_off(tenant_id, starts_at, ends_at, kind, reason)
  values (tid, s, e, coalesce(p->>'kind','bloqueio'), coalesce(p->>'reason',''));
  select count(*) into n from public.appointments a where a.tenant_id = tid and a.status in ('pending','confirmed')
     and tstzrange(a.starts_at, a.ends_at) && tstzrange(s, e);
  return jsonb_build_object('ok', true, 'conflicting_appointments', n);
end $$;

create or replace function public.admin_delete_time_off(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid;
begin
  perform app.require_member(tid);
  delete from public.time_off where id = (p->>'id')::uuid and tenant_id = tid;
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.admin_save_gallery(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid; r jsonb; i int := 0;
begin
  perform app.require_member(tid);
  delete from public.gallery_items where tenant_id = tid;
  for r in select * from jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) loop
    i := i + 1;
    insert into public.gallery_items(tenant_id, title, before_url, after_url, credit, is_illustrative, sort)
    values (tid, coalesce(r->>'title',''), nullif(r->>'before_url',''), r->>'after_url', coalesce(r->>'credit',''),
            coalesce((r->>'is_illustrative')::boolean, false), i);
  end loop;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_requests(p jsonb) returns jsonb
language plpgsql stable as $$
declare tid uuid := (p->>'tenant_id')::uuid; t public.tenants;
begin
  perform app.require_member(tid);
  select * into t from public.tenants where id = tid;
  return jsonb_build_object(
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'type', r.type, 'reason', r.reason, 'preferred', r.preferred,
        'status', r.status, 'response', r.response, 'created_at', r.created_at, 'appointment', app.appt_json(a, t.timezone)) order by r.status = 'open' desc, r.created_at desc)
      from public.change_requests r join public.appointments a on a.id = r.appointment_id
      where r.tenant_id = tid and r.created_at >= now() - interval '90 days'), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(x.j order by x.c desc) from (
      select e.created_at c, jsonb_build_object('type', e.type, 'actor', e.actor, 'reason', e.reason, 'data', e.data,
             'created_at', e.created_at, 'code', a.code, 'client', cl.name, 'appointment_id', a.id) j
        from public.appointment_events e join public.appointments a on a.id = e.appointment_id join public.clients cl on cl.id = a.client_id
       where e.tenant_id = tid order by e.created_at desc limit 60) x), '[]'::jsonb));
end $$;

create or replace function public.admin_resolve_request(p jsonb) returns jsonb
language plpgsql volatile as $$
declare tid uuid := (p->>'tenant_id')::uuid; r public.change_requests; a public.appointments;
begin
  perform app.require_member(tid);
  if p->>'status' not in ('accepted','declined') then perform app.err('INVALID', 'Resposta inválida.'); end if;
  update public.change_requests set status = p->>'status', response = coalesce(p->>'response',''), resolved_at = now()
   where id = (p->>'id')::uuid and tenant_id = tid and status = 'open' returning * into r;
  if not found then perform app.err('NOT_FOUND', 'Solicitação não encontrada.'); end if;
  select * into a from public.appointments where id = r.appointment_id;
  perform app.log(a, 'request_' || r.status, 'professional', coalesce(p->>'response',''), jsonb_build_object('type', r.type));
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.plans             enable row level security;
alter table public.tenants           enable row level security;
alter table public.tenant_members    enable row level security;
alter table public.platform_admins   enable row level security;
alter table public.signup_requests   enable row level security;
alter table public.services          enable row level security;
alter table public.business_hours    enable row level security;
alter table public.special_days      enable row level security;
alter table public.time_off          enable row level security;
alter table public.clients           enable row level security;
alter table public.appointments      enable row level security;
alter table public.payments          enable row level security;
alter table public.appointment_events enable row level security;
alter table public.change_requests   enable row level security;
alter table public.gallery_items     enable row level security;

do $$
declare tbl text;
begin
  -- tabelas da profissional: acesso total apenas para membros da conta
  foreach tbl in array array['services','business_hours','special_days','time_off','clients','appointments',
                             'payments','appointment_events','change_requests','gallery_items'] loop
    execute format('drop policy if exists tenant_rw on public.%I', tbl);
    execute format('create policy tenant_rw on public.%I for all to authenticated
                    using (app.is_member(tenant_id)) with check (app.is_member(tenant_id))', tbl);
  end loop;
end $$;

drop policy if exists tenants_member_read on public.tenants;
create policy tenants_member_read on public.tenants for select to authenticated
  using (app.is_member(id) or app.is_platform_admin());
drop policy if exists tenants_member_update on public.tenants;
create policy tenants_member_update on public.tenants for update to authenticated
  using (app.is_member(id)) with check (app.is_member(id));

drop policy if exists members_self on public.tenant_members;
create policy members_self on public.tenant_members for select to authenticated
  using (user_id = auth.uid() or app.is_platform_admin());

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select to authenticated using (true);

drop policy if exists signup_admin on public.signup_requests;
create policy signup_admin on public.signup_requests for select to authenticated using (app.is_platform_admin());

-- =====================================================================
-- PERMISSÕES (o que cada papel pode chamar)
-- =====================================================================
revoke all on all tables in schema public from anon;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and (p.proname like 'public\_%' or p.proname like 'admin\_%'))
               or n.nspname = 'app' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
grant usage on schema app to anon, authenticated;

grant select, insert, update, delete on
  public.services, public.business_hours, public.special_days, public.time_off, public.clients,
  public.appointments, public.payments, public.appointment_events, public.change_requests, public.gallery_items
  to authenticated;
grant select on public.tenants, public.tenant_members, public.plans, public.signup_requests to authenticated;
-- a profissional não altera o próprio status/plano/slug
revoke update on public.tenants from authenticated;
grant update (name, tagline, logo_url, hero_url, theme, whatsapp, instagram_url, address_line1, address_line2,
              address_is_demo, maps_url, pix_key, slot_step_min, buffer_min, min_notice_min, window_days,
              deposit_percent, cancel_policy_text, cancel_deadline_hours, deposit_retention)
  on public.tenants to authenticated;

-- funções auxiliares usadas pelas funções do painel (rodam com o papel da usuária)
grant execute on function app.uid(), app.is_member(uuid), app.is_platform_admin(), app.digits(text), app.hm(time),
  app.err(text, text), app.require_member(uuid), app.periods_for(uuid, date), app.new_code(uuid),
  app.paid_amount(uuid), app.appt_json(public.appointments, text),
  app.log(public.appointments, text, text, text, jsonb) to authenticated;
grant execute on function public.public_site(jsonb), public.public_busy(jsonb), public.public_book(jsonb),
  public.public_request_change(jsonb), public.public_login_email(jsonb), public.public_signup_request(jsonb)
  to anon, authenticated;
grant execute on function public.admin_me(jsonb), public.admin_overview(jsonb), public.admin_appointments(jsonb),
  public.admin_appointment(jsonb), public.admin_set_status(jsonb), public.admin_reschedule(jsonb),
  public.admin_record_payment(jsonb), public.admin_void_payment(jsonb), public.admin_payments(jsonb),
  public.admin_clients(jsonb), public.admin_client(jsonb), public.admin_save_client_notes(jsonb),
  public.admin_settings(jsonb), public.admin_save_profile(jsonb), public.admin_save_service(jsonb),
  public.admin_delete_service(jsonb), public.admin_save_hours(jsonb), public.admin_save_special_day(jsonb),
  public.admin_delete_special_day(jsonb), public.admin_add_time_off(jsonb), public.admin_delete_time_off(jsonb),
  public.admin_save_gallery(jsonb), public.admin_requests(jsonb), public.admin_resolve_request(jsonb)
  to authenticated;

-- =====================================================================
-- ARMAZENAMENTO DE IMAGENS (Supabase Storage)
-- Pasta por profissional: tenant-assets/<tenant_id>/arquivo.jpg
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('tenant-assets', 'tenant-assets', true, 3145728, array['image/jpeg','image/png','image/webp','image/svg+xml'])
    on conflict (id) do nothing;

    execute 'drop policy if exists tenant_assets_insert on storage.objects';
    execute 'create policy tenant_assets_insert on storage.objects for insert to authenticated
             with check (bucket_id = ''tenant-assets'' and app.is_member(((storage.foldername(name))[1])::uuid))';
    execute 'drop policy if exists tenant_assets_update on storage.objects';
    execute 'create policy tenant_assets_update on storage.objects for update to authenticated
             using (bucket_id = ''tenant-assets'' and app.is_member(((storage.foldername(name))[1])::uuid))';
    execute 'drop policy if exists tenant_assets_delete on storage.objects';
    execute 'create policy tenant_assets_delete on storage.objects for delete to authenticated
             using (bucket_id = ''tenant-assets'' and app.is_member(((storage.foldername(name))[1])::uuid))';
  end if;
end $$;

-- =====================================================================
-- OPERAÇÃO (rodar no SQL Editor; não exposto ao site)
-- Vincula um usuário criado em Authentication → Users a uma conta de profissional
-- =====================================================================
create or replace function app.link_owner(p_email text, p_slug text, p_phone text default null) returns text
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid; tid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'Usuário % não existe em Authentication → Users', p_email; end if;
  select id into tid from public.tenants where slug = p_slug;
  if tid is null then raise exception 'Conta % não existe', p_slug; end if;
  insert into public.tenant_members(tenant_id, user_id, role, login_phone) values (tid, uid, 'owner', p_phone)
  on conflict (tenant_id, user_id) do update set login_phone = excluded.login_phone;
  return 'OK: ' || p_email || ' agora administra ' || p_slug;
end $$;
revoke execute on function app.link_owner(text, text, text) from anon, authenticated, public;
