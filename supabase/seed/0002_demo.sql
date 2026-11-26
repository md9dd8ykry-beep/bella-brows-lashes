-- =====================================================================
-- DADOS DE DEMONSTRAÇÃO (fictícios)
-- Cria/renova duas profissionais de exemplo para testar a plataforma:
--   * bella      → Bella Brows & Lashes (sobrancelhas e cílios)
--   * lumi-nails → Lumi Nail Studio (manicure / nail designer)
-- Uso: SQL Editor → colar → Run. Depois, a qualquer momento: select app.seed_demo();
-- Os vínculos de login (tenant_members) são preservados.
-- =====================================================================

create or replace function app.seed_demo(p_site_url text default '') returns text
language plpgsql security definer set search_path = public as $$
declare
  b uuid; l uuid; tz text := 'America/Cuiaba'; today date; d date[]; i int; k int;
  cl uuid[]; a uuid; svc jsonb; img text := coalesce(p_site_url, '');
begin
  -- ----------------------------------------------------------- contas
  insert into public.tenants(slug, status, plan_id, name, tagline, logo_url, hero_url, theme, whatsapp, instagram_url,
        address_line1, address_line2, address_is_demo, maps_url, pix_key, is_demo, timezone,
        slot_step_min, buffer_min, min_notice_min, window_days, deposit_percent,
        cancel_policy_text, cancel_deadline_hours, deposit_retention)
  values ('bella', 'active', 'demo', 'Bella Brows & Lashes',
        'Olhar realçado com técnica, delicadeza e um cuidado que respeita a sua beleza natural.',
        img || 'assets/img/logo-marca.svg', 'https://images.unsplash.com/photo-1519415387722-a1c3bbef716c?auto=format&fit=crop&w=900&q=70',
        '{"primary":"#b5786a","primaryDeep":"#9a5f52","soft":"#ecd6cf","accent":"#a8845a","bg":"#f7f0ea","ink":"#4a352c","wordmark":"Bella","subtitle":"Brows & Lashes"}',
        '5500000000000', 'https://www.instagram.com/', 'Avenida Exemplo, 1000 — Sala 00',
        'Bairro Demonstração · Cidade/UF · CEP 00000-000', true, 'https://www.google.com/maps', 'chave-pix-demonstrativa',
        true, tz, 15, 10, 60, 60, 50,
        'Cancelamentos e remarcações com pelo menos 24 horas de antecedência têm o sinal devolvido ou transferido para a nova data. Com menos de 24 horas, o sinal pode ficar retido.',
        24, true)
  on conflict (slug) do update set status = 'active', name = excluded.name, tagline = excluded.tagline,
        logo_url = excluded.logo_url, hero_url = excluded.hero_url, theme = excluded.theme, timezone = excluded.timezone,
        whatsapp = excluded.whatsapp, instagram_url = excluded.instagram_url, address_line1 = excluded.address_line1,
        address_line2 = excluded.address_line2, address_is_demo = true, maps_url = excluded.maps_url, pix_key = excluded.pix_key,
        slot_step_min = 15, buffer_min = 10, min_notice_min = 60, window_days = 60, deposit_percent = 50,
        cancel_policy_text = excluded.cancel_policy_text, cancel_deadline_hours = 24, deposit_retention = true, is_demo = true
  returning id into b;

  insert into public.tenants(slug, status, plan_id, name, tagline, logo_url, hero_url, theme, whatsapp, instagram_url,
        address_line1, address_line2, address_is_demo, maps_url, pix_key, is_demo, timezone,
        slot_step_min, buffer_min, min_notice_min, window_days, deposit_percent, cancel_policy_text, cancel_deadline_hours, deposit_retention)
  values ('lumi-nails', 'active', 'demo', 'Lumi Nail Studio', 'Unhas impecáveis, com atendimento sem pressa e materiais de qualidade.',
        img || 'assets/img/logo-lumi.svg', null,
        '{"primary":"#7d6aa8","primaryDeep":"#5f4e8a","soft":"#e6def3","accent":"#b38f5c","bg":"#f6f3f8","ink":"#3b3346","wordmark":"Lumi","subtitle":"Nail Studio"}',
        '5500000000000', 'https://www.instagram.com/', 'Rua Fictícia, 250 — Loja 0',
        'Bairro Exemplo · Cidade/UF · CEP 00000-000', true, 'https://www.google.com/maps', 'chave-pix-demonstrativa',
        true, tz, 15, 5, 120, 45, 30, '', 12, false)
  on conflict (slug) do update set status = 'active', name = excluded.name, tagline = excluded.tagline,
        logo_url = excluded.logo_url, hero_url = excluded.hero_url, theme = excluded.theme, timezone = excluded.timezone, is_demo = true
  returning id into l;

  -- limpa dados anteriores das duas contas demo (mantém logins)
  delete from public.appointments where tenant_id in (b, l);
  delete from public.clients where tenant_id in (b, l);
  delete from public.services where tenant_id in (b, l);
  delete from public.business_hours where tenant_id in (b, l);
  delete from public.special_days where tenant_id in (b, l);
  delete from public.time_off where tenant_id in (b, l);
  delete from public.gallery_items where tenant_id in (b, l);

  -- ----------------------------------------------------------- serviços
  insert into public.services(tenant_id, name, description, image_url, price, duration_min, sort) values
   (b, 'Design simples de sobrancelha', 'Mapeamento do rosto e remoção dos fios com pinça para um desenho limpo e harmônico.', 'https://images.unsplash.com/photo-1674049406179-d7bf2c263e71?auto=format&fit=crop&w=900&q=70', 45, 40, 1),
   (b, 'Design de sobrancelha com henna', 'Design personalizado com aplicação de henna para preencher falhas e definir o formato.', 'https://images.unsplash.com/photo-1777521778743-d152c0404e32?auto=format&fit=crop&w=900&q=70', 65, 60, 2),
   (b, 'Brow Lamination', 'Alinhamento dos fios para cima, com efeito de sobrancelhas mais volumosas e penteadas.', 'https://images.unsplash.com/photo-1666858619985-701e36b3bc57?auto=format&fit=crop&w=900&q=70', 120, 60, 3),
   (b, 'Extensão de cílios', 'Aplicação fio a fio para alongar e dar curvatura aos cílios, com acabamento natural.', 'https://images.unsplash.com/photo-1772236617396-2f8460293c07?auto=format&fit=crop&w=900&q=70', 180, 120, 4),
   (l, 'Manicure tradicional', 'Cutilagem, lixamento e esmaltação com esmalte comum.', null, 35, 45, 1),
   (l, 'Pedicure', 'Cuidado completo dos pés com esfoliação e esmaltação.', null, 40, 50, 2),
   (l, 'Esmaltação em gel', 'Brilho e durabilidade de até três semanas.', null, 70, 60, 3),
   (l, 'Alongamento em gel', 'Unhas alongadas com formato personalizado.', null, 160, 150, 4);

  -- ----------------------------------------------------------- horários
  for i in 1..6 loop
    insert into public.business_hours(tenant_id, weekday, start_time, end_time) values (b, i, '07:00', '11:30'), (b, i, '13:30', '17:30');
  end loop;
  for i in 2..6 loop
    insert into public.business_hours(tenant_id, weekday, start_time, end_time) values (l, i, '09:00', '12:00'), (l, i, '13:00', '19:00');
  end loop;

  -- próximos dias úteis da Bella
  today := (now() at time zone tz)::date;
  select array_agg(x order by x) into d from (
    select g::date x from generate_series(today + 1, today + 30, interval '1 day') g
     where extract(dow from g) between 1 and 6 limit 8) s;

  insert into public.time_off(tenant_id, starts_at, ends_at, kind, reason) values
    (b, (d[4]::timestamp) at time zone tz, ((d[4] + 1)::timestamp) at time zone tz, 'folga', 'Curso de atualização (demonstração)'),
    (b, (d[5] + time '13:30') at time zone tz, (d[5] + time '17:30') at time zone tz, 'bloqueio', 'Compromisso pessoal (demonstração)');
  insert into public.special_days(tenant_id, day, periods, note) values
    (b, d[8], '[{"start":"08:00","end":"12:00"}]', 'Horário reduzido (demonstração)');

  -- ----------------------------------------------------------- clientes e agendamentos (Bella)
  with ins as (
    insert into public.clients(tenant_id, name, phone, phone_digits) values
      (b, 'Ana Demonstração', '(00) 90000-0001', '00900000001'),
      (b, 'Bruna Exemplo', '(00) 90000-0002', '00900000002'),
      (b, 'Carla Fictícia', '(00) 90000-0003', '00900000003'),
      (b, 'Daniela Teste', '(00) 90000-0004', '00900000004'),
      (b, 'Elisa Modelo', '(00) 90000-0005', '00900000005'),
      (b, 'Fernanda Amostra', '(00) 90000-0006', '00900000006')
    returning id, phone_digits)
  select array_agg(id order by phone_digits) into cl from ins;

  -- helper inline: (cliente, dia, hora, serviços, status, pago)
  perform app._demo_appt(b, cl[1], d[1], '07:00', array['Extensão de cílios'], 'confirmed', 'deposit');
  perform app._demo_appt(b, cl[2], d[1], '09:30', array['Design simples de sobrancelha'], 'pending', null);
  perform app._demo_appt(b, cl[3], d[1], '14:00', array['Design de sobrancelha com henna'], 'confirmed', 'deposit');
  perform app._demo_appt(b, cl[4], d[2], '07:00', array['Extensão de cílios'], 'confirmed', 'deposit');
  perform app._demo_appt(b, cl[5], d[2], '09:15', array['Extensão de cílios'], 'pending', null);
  perform app._demo_appt(b, cl[6], d[2], '13:30', array['Extensão de cílios'], 'confirmed', 'deposit');
  perform app._demo_appt(b, cl[1], d[2], '15:45', array['Brow Lamination'], 'confirmed', 'deposit');
  perform app._demo_appt(b, cl[2], d[3], '08:00', array['Design de sobrancelha com henna'], 'confirmed', 'deposit');
  perform app._demo_appt(b, cl[3], d[3], '13:30', array['Brow Lamination', 'Design simples de sobrancelha'], 'pending', null);
  perform app._demo_appt(b, cl[4], d[6], '10:00', array['Design simples de sobrancelha'], 'cancelled', null);
  -- histórico (passado)
  perform app._demo_appt(b, cl[5], today - 7, '08:00', array['Design de sobrancelha com henna'], 'completed', 'full');
  perform app._demo_appt(b, cl[6], today - 5, '14:00', array['Extensão de cílios'], 'completed', 'full');
  perform app._demo_appt(b, cl[1], today - 12, '09:00', array['Design simples de sobrancelha'], 'completed', 'full');
  perform app._demo_appt(b, cl[3], today - 3, '15:00', array['Brow Lamination'], 'no_show', 'deposit');

  -- uma solicitação de remarcação em aberto
  select id into a from public.appointments where tenant_id = b and status = 'confirmed' and starts_at > now() order by starts_at desc limit 1;
  insert into public.change_requests(tenant_id, appointment_id, type, reason, preferred)
    values (b, a, 'reschedule', 'Surgiu um compromisso de trabalho (demonstração).', 'Qualquer dia à tarde na semana seguinte');
  insert into public.appointment_events(tenant_id, appointment_id, type, actor, reason, data)
    values (b, a, 'reschedule_requested', 'client', 'Surgiu um compromisso de trabalho (demonstração).', '{"preferred":"Qualquer dia à tarde na semana seguinte"}');

  -- ----------------------------------------------------------- Lumi (outra profissional)
  with ins as (
    insert into public.clients(tenant_id, name, phone, phone_digits) values
      (l, 'Gabriela Exemplo', '(00) 90000-1001', '00900001001'),
      (l, 'Helena Demonstração', '(00) 90000-1002', '00900001002')
    returning id, phone_digits)
  select array_agg(id order by phone_digits) into cl from ins;
  select array_agg(x order by x) into d from (
    select g::date x from generate_series(today + 1, today + 30, interval '1 day') g
     where extract(dow from g) between 2 and 6 limit 3) s;
  perform app._demo_appt(l, cl[1], d[1], '09:00', array['Esmaltação em gel'], 'confirmed', 'deposit');
  perform app._demo_appt(l, cl[2], d[1], '14:00', array['Alongamento em gel'], 'pending', null);
  perform app._demo_appt(l, cl[1], d[2], '10:00', array['Manicure tradicional', 'Pedicure'], 'confirmed', 'deposit');

  -- ----------------------------------------------------------- galeria (fotos ilustrativas)
  insert into public.gallery_items(tenant_id, title, before_url, after_url, credit, is_illustrative, sort) values
    (b, 'Extensão de cílios', null, 'https://images.unsplash.com/photo-1639629509821-c54cdd984227?auto=format&fit=crop&w=900&q=70', 'Unsplash', true, 1),
    (b, 'Design de sobrancelha', null, 'https://images.unsplash.com/photo-1674049406467-824ea37c7184?auto=format&fit=crop&w=900&q=70', 'Unsplash', true, 2),
    (b, 'Cílios alongados', null, 'https://images.unsplash.com/photo-1683719312734-e31de63957ab?auto=format&fit=crop&w=900&q=70', 'Unsplash', true, 3),
    (b, 'Olhar valorizado', null, 'https://images.unsplash.com/photo-1542833807-ad5af0977050?auto=format&fit=crop&w=900&q=70', 'Unsplash', true, 4),
    (b, 'Ambiente de atendimento', null, 'https://images.unsplash.com/photo-1589710751893-f9a6770ad71b?auto=format&fit=crop&w=900&q=70', 'Unsplash', true, 5);

  return 'Demonstração criada: bella e lumi-nails';
end $$;

-- cria um agendamento de demonstração já com pagamentos coerentes
create or replace function app._demo_appt(t uuid, c uuid, d date, st time, names text[], status text, paid text)
returns uuid language plpgsql security definer set search_path = public as $$
declare tn public.tenants; svc jsonb; dur int; tot numeric; dep numeric; s_at timestamptz; a uuid;
begin
  select * into tn from public.tenants where id = t;
  select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'price', s.price, 'duration_min', s.duration_min) order by s.sort),
         sum(s.duration_min), sum(s.price)
    into svc, dur, tot from public.services s where s.tenant_id = t and s.name = any(names);
  dep := round(tot * tn.deposit_percent / 100.0, 2);
  s_at := (d + st) at time zone tn.timezone;
  insert into public.appointments(tenant_id, client_id, code, starts_at, ends_at, block_until, status, services, total, deposit_due, source, policy_accepted, created_at)
  values (t, c, app.new_code(t), s_at, s_at + make_interval(mins => dur), s_at + make_interval(mins => dur + tn.buffer_min),
          status, svc, tot, dep, 'site', true, least(now(), s_at - interval '3 days'))
  returning id into a;
  insert into public.appointment_events(tenant_id, appointment_id, type, actor, created_at)
    values (t, a, 'created', 'client', least(now(), s_at - interval '3 days'));
  if paid in ('deposit', 'full') and dep > 0 then
    insert into public.payments(tenant_id, appointment_id, kind, method, amount, note, created_at)
    values (t, a, 'deposit', 'pix', dep, 'Sinal (demonstração)', least(now(), s_at - interval '2 days'));
  end if;
  if paid = 'full' then
    insert into public.payments(tenant_id, appointment_id, kind, method, amount, note, created_at)
    values (t, a, 'balance', case when tot > 100 then 'card' else 'cash' end, tot - dep, 'Restante no dia (demonstração)', s_at + make_interval(mins => dur));
  end if;
  if status = 'cancelled' then
    insert into public.appointment_events(tenant_id, appointment_id, type, actor, reason, data)
    values (t, a, 'status_changed', 'professional', 'Cliente avisou que viajaria (demonstração).', '{"from":"pending","to":"cancelled"}');
  end if;
  return a;
end $$;

revoke all on function app.seed_demo(text) from public, anon, authenticated;
revoke all on function app._demo_appt(uuid, uuid, date, time, text[], text, text) from public, anon, authenticated;

select app.seed_demo('https://md9dd8ykry-beep.github.io/bella-brows-lashes/');
