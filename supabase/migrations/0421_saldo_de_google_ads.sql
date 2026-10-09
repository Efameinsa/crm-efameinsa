-- 0421 · Saldo de Google Ads (reunión de gerencia 07-10, Santos 09-10). La
-- cuenta de Google Ads es prepago y ya nos castigó quedarnos sin saldo: los
-- anuncios se apagan y Google tarda en devolver la posición. El CRM no tiene
-- acceso a Google Ads, así que el saldo se ESTIMA: gerencia anota cada recarga
-- (y, cuando quiere, el saldo real que muestra Google) y el CRM descuenta el
-- tope diario que fijó Carlos (S/ 250). Cuando queda menos de un día, avisa a
-- admin por la campana y por correo a gestion1@ — una sola vez por recarga.

create table if not exists public.ads_saldo_movimientos (
  id uuid primary key default gen_random_uuid(),
  plataforma text not null default 'google' check (plataforma in ('google')),
  tipo text not null check (tipo in ('recarga', 'calibracion')),
  monto numeric(12, 2) not null check (monto >= 0 and monto <= 1000000),
  fecha timestamptz not null default now(),
  nota text check (nota is null or length(nota) <= 300),
  creado_por uuid references public.perfiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.ads_saldo_movimientos is
  'Recargas y saldos reales anotados a mano de la cuenta prepago de Google Ads; el CRM estima el saldo con el tope diario (0421).';

create index if not exists ads_saldo_movimientos_fecha_idx on public.ads_saldo_movimientos (plataforma, fecha);

create table if not exists public.ads_saldo_config (
  plataforma text primary key check (plataforma in ('google')),
  tope_diario numeric(12, 2) not null default 250 check (tope_diario > 0 and tope_diario <= 100000),
  -- El último movimiento por el que ya se avisó: una recarga o corrección nueva rearma la alerta.
  alerta_movimiento_id uuid,
  alerta_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.perfiles(id)
);

insert into public.ads_saldo_config (plataforma) values ('google') on conflict do nothing;

alter table public.ads_saldo_movimientos enable row level security;
alter table public.ads_saldo_config enable row level security;

drop policy if exists ads_saldo_movimientos_todo on public.ads_saldo_movimientos;
create policy ads_saldo_movimientos_todo on public.ads_saldo_movimientos for all to authenticated
  using (rol_actual() in ('admin', 'gerencia')) with check (rol_actual() in ('admin', 'gerencia'));

drop policy if exists ads_saldo_config_todo on public.ads_saldo_config;
create policy ads_saldo_config_todo on public.ads_saldo_config for all to authenticated
  using (rol_actual() in ('admin', 'gerencia')) with check (rol_actual() in ('admin', 'gerencia'));

grant select, insert, update, delete on public.ads_saldo_movimientos to authenticated;
grant select, insert, update on public.ads_saldo_config to authenticated;
grant all on public.ads_saldo_movimientos to service_role;
grant all on public.ads_saldo_config to service_role;
