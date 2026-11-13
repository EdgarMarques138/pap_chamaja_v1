create table if not exists public.counter_services (
  id uuid primary key default gen_random_uuid(),
  counter_id uuid not null references public.counters(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  unique (counter_id, service_id)
);

insert into public.counter_services (counter_id, service_id)
select id, service_id
from public.counters
where service_id is not null
on conflict (counter_id, service_id) do nothing;

alter table public.counter_services enable row level security;

drop policy if exists "staff read assigned counter services" on public.counter_services;
create policy "staff read assigned counter services" on public.counter_services
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and active
        and role = 'attendant'
        and counter_id = counter_services.counter_id
    )
  );

drop policy if exists "admins manage counter services" on public.counter_services;
create policy "admins manage counter services" on public.counter_services
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.counter_services to authenticated;

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
          public.tickets.counter_id = c.id
          or (
            c.active
            and public.tickets.state = 'waiting'
            and (
              public.tickets.service_id = c.service_id
              or exists (
                select 1 from public.counter_services cs
                where cs.counter_id = c.id and cs.service_id = public.tickets.service_id
              )
            )
          )
        )
    )
  );

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
    and service_id in (
      select service_id from public.counter_services where counter_id = v_profile.counter_id
      union
      select v_counter.service_id where v_counter.service_id is not null
    )
  order by priority desc, created_at, id
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

create or replace function public.call_ticket(p_ticket_id uuid)
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
  where id = p_ticket_id
    and state in ('waiting', 'absent')
    and service_id in (
      select service_id from public.counter_services where counter_id = v_profile.counter_id
      union
      select v_counter.service_id where v_counter.service_id is not null
    )
  for update;
  if not found then
    raise exception 'Senha não encontrada na fila deste balcão.' using errcode = '42501';
  end if;

  if not v_ticket.priority and exists (
    select 1 from public.tickets
    where state = 'waiting'
      and priority
      and service_id in (
        select service_id from public.counter_services where counter_id = v_profile.counter_id
        union
        select v_counter.service_id where v_counter.service_id is not null
      )
  ) then
    raise exception 'Chame primeiro as senhas prioritárias.' using errcode = 'P0001';
  end if;

  update public.tickets set
    state = 'called',
    called_at = now(),
    started_at = null,
    finished_at = null,
    updated_at = now(),
    attendant_id = v_profile.id,
    counter_id = v_profile.counter_id
  where id = v_ticket.id
  returning * into v_ticket;
  return v_ticket;
end;
$$;

revoke all on function public.call_next_ticket() from public, anon;
revoke all on function public.call_ticket(uuid) from public, anon;
grant execute on function public.call_next_ticket() to authenticated;
grant execute on function public.call_ticket(uuid) to authenticated;

notify pgrst, 'reload schema';