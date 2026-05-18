-- ============================================================
-- ESQUEMA MODULARESV BOOKING — ejecutar en Supabase SQL Editor
-- ============================================================

create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  contact     text,
  package     text not null check (package in ('premium','basic','lite')),
  start_date  date not null,
  night_price numeric(6,2) not null default 25,
  created_at  timestamptz default now()
);

create table if not exists reservations (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  date        date not null,
  slot        text not null check (slot in ('morning','afternoon','night')),
  created_at  timestamptz default now(),
  -- Un solo espacio: no puede haber dos reservas el mismo día y turno
  unique(date, slot)
);

-- Índices para consultas rápidas
create index if not exists idx_reservations_client on reservations(client_id);
create index if not exists idx_reservations_date   on reservations(date);

-- Row Level Security: acceso público (la app controla la seguridad por clave admin)
alter table clients      enable row level security;
alter table reservations enable row level security;

create policy "public read clients"      on clients      for select using (true);
create policy "public insert clients"    on clients      for insert with check (true);
create policy "public update clients"    on clients      for update using (true);
create policy "public delete clients"    on clients      for delete using (true);

create policy "public read reservations"   on reservations for select using (true);
create policy "public insert reservations" on reservations for insert with check (true);
create policy "public delete reservations" on reservations for delete using (true);
