alter table public.tickets
  add column if not exists caller_name text;

drop function if exists public.emit_ticket(uuid);
drop function if exists public.emit_ticket(uuid, boolean);

create or replace function public.emit_ticket(
  p_service_id uuid,
  p_priority boolean default false,
  p_caller_name text default null
)
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

  perform pg_advisory_xact_lock(194698);

  insert into public.ticket_sequences (service_id, ticket_day, last_number)
  values (v_service.id, v_day, 1)
  on conflict (service_id, ticket_day) do update
    set last_number = public.ticket_sequences.last_number + 1
  returning last_number into v_number;

  insert into public.tickets (ticket_day, number, service_id, priority, caller_name)
  values (
    v_day,
    v_service.prefix || lpad(v_number::text, 3, '0'),
    v_service.id,
    p_priority,
    nullif(btrim(p_caller_name), '')
  )
  returning * into v_ticket;
  return v_ticket;
end;
$$;

revoke all on function public.emit_ticket(uuid, boolean, text) from public;
grant execute on function public.emit_ticket(uuid, boolean, text) to anon, authenticated;

notify pgrst, 'reload schema';