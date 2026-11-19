create or replace function public.transfer_ticket(p_ticket_id uuid, p_target_counter_id uuid)
returns public.tickets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_source_counter public.counters%rowtype;
  v_target_counter public.counters%rowtype;
  v_ticket public.tickets%rowtype;
begin
  select * into v_profile from public.profiles
  where id = (select auth.uid()) and active and role = 'attendant';
  if not found then
    raise exception 'Acesso reservado a funcionários ativos.' using errcode = '42501';
  end if;

  select * into v_source_counter from public.counters
  where id = v_profile.counter_id and active;
  if not found then
    raise exception 'O balcão atual está inativo.' using errcode = 'P0001';
  end if;

  select * into v_target_counter from public.counters
  where id = p_target_counter_id and active;
  if not found then
    raise exception 'O balcão de destino está inativo.' using errcode = 'P0001';
  end if;
  if p_target_counter_id = v_profile.counter_id then
    raise exception 'Escolha um balcão diferente do balcão atual.' using errcode = 'P0001';
  end if;

  select * into v_ticket from public.tickets
  where id = p_ticket_id
    and counter_id = v_profile.counter_id
    and state in ('called', 'serving')
  for update;
  if not found then
    raise exception 'A senha ativa não pertence a este balcão.' using errcode = '42501';
  end if;

  if v_ticket.service_id is distinct from v_target_counter.service_id
    and not exists (
      select 1 from public.counter_services
      where counter_id = v_target_counter.id
        and service_id = v_ticket.service_id
    )
  then
    raise exception 'O balcão de destino não atende esta área.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.tickets
    where counter_id = v_target_counter.id
      and state in ('called', 'serving')
  ) then
    raise exception 'O balcão de destino já tem uma senha em atendimento.' using errcode = 'P0001';
  end if;

  update public.tickets set
    state = 'waiting',
    called_at = null,
    started_at = null,
    finished_at = null,
    attendant_id = null,
    counter_id = v_target_counter.id,
    updated_at = now()
  where id = v_ticket.id
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
  where id = v_profile.counter_id and active;
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
  order by
    (counter_id is not distinct from v_profile.counter_id) desc,
    priority desc,
    created_at asc,
    id asc
  limit 1
  for update skip locked;

  if not found then
    return null;
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

revoke all on function public.transfer_ticket(uuid, uuid) from public, anon;
revoke all on function public.call_next_ticket() from public, anon;
grant execute on function public.transfer_ticket(uuid, uuid) to authenticated;
grant execute on function public.call_next_ticket() to authenticated;