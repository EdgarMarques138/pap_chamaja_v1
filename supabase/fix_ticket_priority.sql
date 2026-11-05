alter table public.counters
  add column if not exists priority_enabled boolean not null default false;

alter table public.tickets
  add column if not exists priority boolean not null default false;

notify pgrst, 'reload schema';