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
    and state = 'waiting'
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