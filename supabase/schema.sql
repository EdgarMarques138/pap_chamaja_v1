create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  prefix text not null unique,
  description text not null default '',
  active boolean not null default true,
  position integer not null default 0
);

create table if not exists public.counters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  service_id uuid references public.services(id) on delete restrict,
  active boolean not null default true
);

alter table public.counters
  add column if not exists service_id uuid references public.services(id) on delete restrict;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'attendant')),
  service_id uuid references public.services(id) on delete set null,
  counter_id uuid references public.counters(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.sync_counter_service_to_profiles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.service_id is distinct from old.service_id then
    update public.profiles set service_id = new.service_id
    where counter_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_counter_service on public.counters;
create trigger sync_counter_service
after update of service_id on public.counters
for each row execute function public.sync_counter_service_to_profiles();

create table if not exists public.ticket_sequences (
  service_id uuid not null references public.services(id) on delete restrict,
  ticket_day date not null,
  last_number integer not null default 0 check (last_number >= 0),
  primary key (service_id, ticket_day)
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_day date not null default (now() at time zone 'UTC')::date,
  number text not null,
  service_id uuid not null references public.services(id) on delete restrict,
  state text not null default 'waiting' check (state in ('waiting', 'called', 'serving', 'done', 'absent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  called_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  attendant_id uuid references public.profiles(id) on delete set null,
  counter_id uuid references public.counters(id) on delete set null,
  unique (ticket_day, number)
);

create index if not exists tickets_queue_order on public.tickets (state, created_at);
create index if not exists tickets_service_queue on public.tickets (service_id, state, created_at);
create index if not exists tickets_counter_active on public.tickets (counter_id, state);

insert into public.services (id, name, prefix, description, position) values
  ('00000000-0000-4000-8000-000000000001', 'Tesouraria', 'T', 'Pagamentos, faturas e assuntos financeiros.', 1),
  ('00000000-0000-4000-8000-000000000002', 'Suporte Técnico', 'S', 'Equipamentos, acessos e apoio técnico.', 2),
  ('00000000-0000-4000-8000-000000000003', 'Secretaria', 'SE', 'Documentos e assuntos administrativos.', 3),
  ('00000000-0000-4000-8000-000000000004', 'Atendimento Geral', 'A', 'Informações e encaminhamento.', 4)
on conflict (id) do update set
  name = excluded.name,
  prefix = excluded.prefix,
  description = excluded.description,
  position = excluded.position;

insert into public.counters (id, name, service_id) values
  ('00000000-0000-4000-8000-000000000011', 'Balcão 1', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000012', 'Balcão 2', '00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000013', 'Balcão 3', '00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000014', 'Balcão 4', '00000000-0000-4000-8000-000000000004')
on conflict (id) do update set
  name = excluded.name,
  service_id = excluded.service_id;

update public.counters
set service_id = '00000000-0000-4000-8000-000000000004'
where service_id is null;

alter table public.counters alter column service_id set not null;

update public.profiles p set service_id = c.service_id
from public.counters c
where p.counter_id = c.id and p.service_id is distinct from c.service_id;

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active and role = 'admin'
  );
$$;

alter table public.services enable row level security;
alter table public.counters enable row level security;
alter table public.profiles enable row level security;
alter table public.ticket_sequences enable row level security;
alter table public.tickets enable row level security;

drop policy if exists "active services are public" on public.services;
create policy "active services are public" on public.services
  for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "admins manage services" on public.services;
create policy "admins manage services" on public.services
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "active counters are public" on public.counters;
create policy "active counters are public" on public.counters
  for select to anon, authenticated using (
    active
    or public.is_admin()
    or exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and active
        and role = 'attendant'
        and counter_id = counters.id
    )
  );
drop policy if exists "admins manage counters" on public.counters;
create policy "admins manage counters" on public.counters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff read own profile" on public.profiles;
create policy "staff read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.is_admin());
drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public can read queue tickets" on public.tickets;
create policy "public can read queue tickets" on public.tickets
  for select to anon using (state in ('waiting', 'called', 'serving', 'done'));
drop policy if exists "active attendants can read all tickets" on public.tickets;
drop policy if exists "attendants read assigned area tickets" on public.tickets;
create policy "attendants read assigned area tickets" on public.tickets
  for select to authenticated using (
    exists (
      select 1
      from public.profiles p
      join public.counters c on c.id = p.counter_id
      where p.id = (select auth.uid())
        and p.active
        and p.role = 'attendant'
        and (
          tickets.counter_id = c.id
          or (c.active and tickets.state = 'waiting' and tickets.service_id = c.service_id)
        )
    )
  );
drop policy if exists "admins read all tickets" on public.tickets;
create policy "admins read all tickets" on public.tickets
  for select to authenticated using (public.is_admin());

grant select on public.services, public.counters, public.tickets to anon, authenticated;
grant select on public.profiles to authenticated;
grant insert, update, delete on public.services, public.counters, public.profiles to authenticated;
revoke all on public.ticket_sequences from anon, authenticated;
revoke insert, update, delete on public.tickets from anon, authenticated;

create or replace function public.emit_ticket(p_service_id uuid)
returns public.tickets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service public.services%rowtype;
  v_ticket public.tickets%rowtype;
  v_day date := (now() at time zone 'UTC')::date;
  v_number integer;
begin
  select * into v_service from public.services
  where id = p_service_id and active;
  if not found then
    raise exception 'Serviço indisponível.' using errcode = 'P0001';
  end if;

  insert into public.ticket_sequences (service_id, ticket_day, last_number)
  values (v_service.id, v_day, 1)
  on conflict (service_id, ticket_day) do update
    set last_number = public.ticket_sequences.last_number + 1
  returning last_number into v_number;

  insert into public.tickets (ticket_day, number, service_id)
  values (v_day, v_service.prefix || lpad(v_number::text, 3, '0'), v_service.id)
  returning * into v_ticket;
  return v_ticket;
end;
$$;

create or replace function public.call_next_ticket()
returns public.tickets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_counter public.counters%rowtype;
  v_ticket public.tickets%rowtype;
begin
  select * into v_profile from public.profiles
  where id = (select auth.uid()) and active and role = 'attendant';
  if not found then
    raise exception 'Acesso reservado a funcionários ativos.' using errcode = '42501';
  end if;
  if v_profile.counter_id is null then
    raise exception 'Atribua um balcão ao funcionário antes de chamar senhas.' using errcode = 'P0001';
  end if;
  select * into v_counter from public.counters
  where id = v_profile.counter_id and active for update;
  if not found then
    raise exception 'O balcão atribuído está inativo.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.tickets
    where counter_id = v_profile.counter_id and state in ('called', 'serving')
  ) then
    raise exception 'Conclua o atendimento atual antes de chamar outra senha.' using errcode = 'P0001';
  end if;

  select * into v_ticket from public.tickets
  where state = 'waiting'
    and service_id = v_counter.service_id
  order by created_at, id
  limit 1
  for update skip locked;
  if not found then
    return null;
  end if;

  update public.tickets set
    state = 'called',
    called_at = now(),
    updated_at = now(),
    attendant_id = v_profile.id,
    counter_id = v_profile.counter_id
  where id = v_ticket.id
  returning * into v_ticket;
  return v_ticket;
end;
$$;

create or replace function public.advance_ticket(p_ticket_id uuid, p_action text)
returns public.tickets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_counter public.counters%rowtype;
  v_ticket public.tickets%rowtype;
  v_state text;
begin
  select * into v_profile from public.profiles
  where id = (select auth.uid()) and active and role = 'attendant';
  if not found then
    raise exception 'Acesso reservado a funcionários ativos.' using errcode = '42501';
  end if;
  select * into v_counter from public.counters
  where id = v_profile.counter_id;
  if not found then
    raise exception 'O balcão atribuído está inativo.' using errcode = 'P0001';
  end if;

  if p_action = 'start' then
    v_state := 'serving';
  elsif p_action = 'done' then
    v_state := 'done';
  elsif p_action = 'absent' then
    v_state := 'absent';
  else
    raise exception 'Ação inválida.' using errcode = '22023';
  end if;

  select * into v_ticket from public.tickets
  where id = p_ticket_id for update;
  if not found
    or v_ticket.counter_id is distinct from v_profile.counter_id
    or v_ticket.service_id <> v_counter.service_id
  then
    raise exception 'Senha não encontrada no balcão atribuído.' using errcode = '42501';
  end if;
  if (p_action = 'start' and v_ticket.state <> 'called')
    or (p_action in ('done', 'absent') and v_ticket.state not in ('called', 'serving'))
  then
    raise exception 'A senha já não está nesse estado.' using errcode = 'P0001';
  end if;

  update public.tickets set
    state = v_state,
    started_at = case when p_action = 'start' then now() else started_at end,
    finished_at = case when p_action in ('done', 'absent') then now() else finished_at end,
    updated_at = now()
  where id = v_ticket.id
  returning * into v_ticket;
  return v_ticket;
end;
$$;

revoke all on function public.is_active_staff() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.sync_counter_service_to_profiles() from public, anon, authenticated;
revoke all on function public.emit_ticket(uuid) from public;
revoke all on function public.call_next_ticket() from public, anon;
revoke all on function public.advance_ticket(uuid, text) from public, anon;
grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.emit_ticket(uuid) to anon, authenticated;
grant execute on function public.call_next_ticket(), public.advance_ticket(uuid, text) to authenticated;