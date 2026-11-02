alter table public.tickets
  add column if not exists priority boolean not null default false;

notify pgrst, 'reload schema';