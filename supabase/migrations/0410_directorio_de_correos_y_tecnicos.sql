-- 0410 · El directorio de correos y la relación de técnicos (Lesly, 06-10).
--
-- Reunión de gerencia 06-10 11:01: «¿Quién tiene qué correo? Para que Santos lo
-- mapee en el CRM, en el directorio de correos, cada uno qué es lo que tiene».
-- Cada persona tiene dos correos, uno de EFAMEINSA y otro de OPEN: los correos
-- automáticos salen al de la empresa del pedido («nació en OPEN → correos
-- OPEN»). Y que el aviso también llegue al correo, «para que no solamente haya
-- la excusa de: mi campana no sonó».
--
-- `avisos` dice qué correos automáticos le llegan a cada persona, por área del
-- circuito ('finanzas', 'almacen', 'postventa', 'central'). Lo ajustan gerencia
-- y operaciones desde /directorio, sin tocar código.
--
-- La relación de técnicos es la lista con DNI: el técnico se elige de ahí en la
-- apertura y su DNI sale impreso junto a su nombre (el cliente lo pide para
-- dejarlo entrar a planta).

create table if not exists public.directorio (
  id uuid primary key default gen_random_uuid(),
  orden int not null default 0,
  nombre text not null,
  area text not null,
  correo_efameinsa text,
  correo_open text,
  telefono text,
  avisos text[] not null default '{}',
  activo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.perfiles(id)
);

create table if not exists public.tecnicos (
  id uuid primary key default gen_random_uuid(),
  orden int not null default 0,
  nombre text not null,
  dni text,
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.directorio enable row level security;
alter table public.tecnicos enable row level security;

drop policy if exists directorio_leer on public.directorio;
create policy directorio_leer on public.directorio for select to authenticated using (true);
drop policy if exists directorio_editar on public.directorio;
create policy directorio_editar on public.directorio for all to authenticated
  using (coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false))
  with check (coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false));

drop policy if exists tecnicos_leer on public.tecnicos;
create policy tecnicos_leer on public.tecnicos for select to authenticated using (true);
drop policy if exists tecnicos_editar on public.tecnicos;
create policy tecnicos_editar on public.tecnicos for all to authenticated
  using (coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false))
  with check (coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false));

grant select, insert, update, delete on public.directorio, public.tecnicos to authenticated;
grant all on public.directorio, public.tecnicos to service_role;

-- Tal cual el Excel DIRECTORIO.xlsx de Lesly (06-10 17:00), con tres dominios
-- mal tipeados corregidos: «openinvestmenst», «openinvestmensts» y el OPEN de
-- Ariana, que venía como comercial4@efameinsa.com.pe.
insert into public.directorio (orden, nombre, area, correo_efameinsa, correo_open, telefono, avisos)
select * from (values
  (0,  'Ing. Carlos Cabrejos',    'Gerencia',          'crcabrejos@efameinsa.com',     'gerencia1@openinvestments.com.pe',        '985129936',    '{}'::text[]),
  (0,  'Karen Cabrejos',          'Gerencia',          'kycabrejos@efameinsa.com',     'kycabrejos@openinvestments.com.pe',       '447446990138', '{}'),
  (1,  'Lesly Meneses',           'Logística',         'logistica2@efameinsa.com',     'logistica2@openinvestments.com.pe',       '977352684',    '{almacen}'),
  (2,  'Jeysson Alania',          'Almacén',           'almacen@efameinsa.com',        'almacen@openinvestments.com.pe',          '938891824',    '{almacen}'),
  (3,  'Alondra Palma',           'Central',           'central@efameinsa.com',        'central@openinvestments.com.pe',          '923421229',    '{central}'),
  (4,  'Jhon Calsin',             'Finanzas',          'contabilidad1@efameinsa.com',  'gestion1@openinvestments.com.pe',         '981490197',    '{finanzas}'),
  (5,  'Jhon Calsin',             'Contabilidad',      'sistemas@efameinsa.com',       null,                                      '946171860',    '{}'),
  (6,  'Orlando Ccapa',           'Contabilidad',      'contabilidad6@efameinsa.com',  'contabilidad1@openinvestments.com.pe',    '938856404',    '{}'),
  (7,  'Yasmin Yuriko',           'Recursos Humanos',  'recursoshumanos@efameinsa.com','recursoshumanos@openinvestments.com.pe',  '922997309',    '{}'),
  (8,  'Marco Antonio Velásquez', 'Importaciones',     'importaciones1@efameinsa.com', 'importaciones@openinvestments.com.pe',    '922997302',    '{}'),
  (9,  'Rony Huamani',            'Contabilidad',      'contabilidad2@efameinsa.com',  'gestion3@openinvestments.com.pe',         '967088951',    '{}'),
  (10, 'Katherine Tello',         'Comercial',         'comercial5@efameinsa.com',     'comercial5@openinvestments.com.pe',       '981488958',    '{}'),
  (11, 'Ariana Flores',           'Comercial',         'comercial4@efameinsa.com',     'comercial4@openinvestments.com.pe',       '946372890',    '{}'),
  (12, 'Brenda Taboada',          'Comercial',         'comercial8@efameinsa.com',     'comercial8@openinvestments.com.pe',       '922387534',    '{}'),
  (13, 'Moisés Baldeón',          'Comercial',         'comercial2@efameinsa.com',     'comercial2@openinvestments.com.pe',       '938891796',    '{}'),
  (14, 'Abel Abad',               'Comercial',         'comercial6@efameinsa.com',     'comercial6@openinvestments.com.pe',       '981491434',    '{}'),
  (15, 'Juan Carlos Barrientos',  'Sistemas',          'sistemas2@efameinsa.com',      null,                                      '955091922',    '{}'),
  (16, 'Gabriela Palacios',       'Postventa · Comercial', 'postventa2@efameinsa.com', 'postventa2@openinvestments.com.pe',       '992570935',    '{postventa}'),
  (17, 'Rubí Simeón',             'Postventa',         'postventa1@efameinsa.com',     'postventa1@openinvestments.com.pe',       '981345538',    '{postventa}')
) as v(orden, nombre, area, correo_efameinsa, correo_open, telefono, avisos)
where not exists (select 1 from public.directorio);

-- RELACION DE TECNICOS.xlsx (06-10 17:00).
insert into public.tecnicos (orden, nombre, dni)
select * from (values
  (1, 'Danny Solis',        '40115086'),
  (2, 'Cristhian Dolorier', '72755590'),
  (3, 'Edison Capulian',    '10603270'),
  (4, 'Jeysson Alania',     '74911520'),
  (5, 'Nilton Monago',      '10259066')
) as v(orden, nombre, dni)
where not exists (select 1 from public.tecnicos);
