-- ============================================================
-- CRM EFAMEINSA · Migración 0001 · Esquema inicial
-- Fuente de verdad del modelo de datos. Ver docs/02-modelo-datos.md
-- ============================================================

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
create type rol_usuario as enum ('admin', 'gerencia', 'central', 'comercial');

-- Central recibe TODO contacto entrante; ~50% no es comercial.
create type area_destino as enum
  ('comercial', 'servicio_tecnico', 'postventa', 'rrhh', 'proveedores', 'administracion', 'otros');

-- VIA: por dónde llegó el contacto (≠ fuente de marketing).
create type canal_contacto as enum
  ('whatsapp', 'llamada', 'formulario_web', 'facebook', 'instagram', 'email', 'presencial', 'referido', 'otro');

create type estado_lead as enum
  ('pendiente_triaje',  -- recién registrado por Central o ingesta automática
   'derivado_area',     -- no comercial: derivado a su área (fin del flujo CRM)
   'asignado',          -- comercial asignado; se creó/vinculó cuenta y oportunidad
   'duplicado',         -- ya existía (se vincula a duplicado_de)
   'descartado');       -- spam / no procede

-- Etapa separada de resultado y de próxima acción (reingeniería de P1/P2/P3-C1..C4).
create type etapa_oportunidad as enum
  ('asignada',      -- recibida por el comercial, aún sin filtrar
   'filtrada',      -- filtro SUNAT/redes hecho, procede
   'cotizada',      -- cotización enviada
   'seguimiento',   -- en seguimiento post-cotización
   'potencial',     -- alta intención, negociación avanzada
   'venta',         -- cerrada ganada
   'rechazada',     -- cerrada perdida (ver motivo_rechazo_id)
   'derivada');     -- pasada a otro comercial u otra área

create type tipo_actividad as enum
  ('llamada', 'whatsapp', 'email', 'visita', 'showroom', 'filtro', 'nota', 'otro');

create type serie_cotizacion as enum ('EFAMEINSA', 'OPEN');

create type estado_cotizacion as enum ('borrador', 'enviada', 'aceptada', 'perdida', 'vencida');

-- Regla gerencia 2026-08-14: dentro de lista el vendedor se auto-aprueba;
-- por debajo de lista aprueba gerencia.
create type estado_aprobacion as enum
  ('auto_aprobada', 'pendiente_gerencia', 'aprobada_gerencia', 'rechazada_gerencia');

create type segmento_producto as enum ('industrial', 'semi_industrial');

-- Semi-industrial: óptimo/medio/deseado. Industrial: base.
create type tier_precio as enum ('optimo', 'medio', 'deseado', 'base');

create type tipo_documento as enum ('RUC', 'DNI', 'CE', 'SIN_DOC');

create type motivo_asignacion as enum
  ('nuevo_lead',          -- lead nuevo, cuenta sin cartera previa
   'cartera_existente',   -- ya lo atendió ese comercial: le corresponde
   'liberacion_6_meses',  -- 6 meses sin venta → gerencia deriva a otro
   'decision_gerencia',   -- reasignación puntual decidida por gerencia
   'reemplazo');          -- salida/vacaciones de personal

create type plataforma_ads as enum ('google', 'meta');

create type intencion_compra as enum ('alta', 'media', 'baja', 'sin_definir');

create type moneda as enum ('PEN', 'USD');

-- ------------------------------------------------------------
-- FUNCIONES UTILITARIAS
-- ------------------------------------------------------------

-- Teléfonos peruanos: quita todo lo no numérico y el prefijo 51 si sobra.
create or replace function normalizar_telefono(t text)
returns text language sql immutable as $$
  select case
    when t is null then null
    else case
      when length(regexp_replace(t, '\D', '', 'g')) > 9
           and regexp_replace(t, '\D', '', 'g') like '51%'
        then substring(regexp_replace(t, '\D', '', 'g') from 3)
      else regexp_replace(t, '\D', '', 'g')
    end
  end
$$;

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ------------------------------------------------------------
-- CORRELATIVOS (PRO-#### de leads, Presu_### por serie de cotización)
-- Nunca generar correlativos en el cliente.
-- ------------------------------------------------------------
create table correlativos (
  clave  text primary key,   -- 'PRO' | 'EFAMEINSA' | 'OPEN'
  ultimo integer not null default 0
);

insert into correlativos (clave, ultimo) values
  ('PRO', 0),        -- ⚠️ antes del piloto: fijar al último PRO real de Central
  ('EFAMEINSA', 0),  -- ⚠️ fijar al último Presu_ de L. PRESUPUESTO EFAMEINSA
  ('OPEN', 0);       -- ⚠️ fijar al último Presu_ de L. PRESUPUESTO OPEN

create or replace function siguiente_correlativo(p_clave text)
returns integer language plpgsql security definer as $$
declare v integer;
begin
  update correlativos set ultimo = ultimo + 1 where clave = p_clave
    returning ultimo into v;
  if v is null then
    raise exception 'Correlativo desconocido: %', p_clave;
  end if;
  return v;
end $$;

-- ------------------------------------------------------------
-- PERFILES (extiende auth.users)
-- ------------------------------------------------------------
create table perfiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  nombre            text not null,
  rol               rol_usuario not null,
  codigo_comercial  text unique,             -- 'C1'..'C10' solo para rol comercial
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint comercial_con_codigo check (rol <> 'comercial' or codigo_comercial is not null)
);
create trigger trg_perfiles_updated before update on perfiles
  for each row execute function set_updated_at();

-- Helpers de RLS (security definer para no recursar sobre perfiles)
create or replace function rol_actual()
returns rol_usuario language sql stable security definer as $$
  select rol from perfiles where id = auth.uid()
$$;

create or replace function es_backoffice()   -- gerencia o admin: ven todo
returns boolean language sql stable security definer as $$
  select rol_actual() in ('gerencia', 'admin')
$$;

-- ------------------------------------------------------------
-- CATÁLOGOS (seeds desde hoja DATOS del Excel — scripts/extraer-catalogos.mjs)
-- ------------------------------------------------------------
create table catalogo_rubros (
  id     serial primary key,
  nombre text not null unique,
  activo boolean not null default true
);

create table catalogo_motivos_rechazo (
  id     serial primary key,
  nombre text not null unique,   -- ej. 'Compró a competencia', 'Precio', 'No responde'
  activo boolean not null default true
);

-- ------------------------------------------------------------
-- CUENTAS (clientes/prospectos únicos — dedup por documento y teléfono)
-- ------------------------------------------------------------
create table cuentas (
  id                uuid primary key default gen_random_uuid(),
  tipo_doc          tipo_documento not null default 'SIN_DOC',
  num_doc           text,
  razon_social      text not null,
  nombre_comercial  text,
  rubro_id          integer references catalogo_rubros (id),
  departamento      text,
  provincia         text,
  distrito          text,
  direccion         text,
  -- Cartera (regla 6 meses):
  comercial_id      uuid references perfiles (id),   -- dueño actual de la cartera
  cartera_desde     timestamptz,                     -- cuándo se le asignó al comercial actual
  ultima_venta_at   timestamptz,                     -- última venta cerrada a esta cuenta
  notas             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index uq_cuentas_doc on cuentas (num_doc)
  where num_doc is not null and tipo_doc <> 'SIN_DOC';
create index ix_cuentas_comercial on cuentas (comercial_id);
create trigger trg_cuentas_updated before update on cuentas
  for each row execute function set_updated_at();

create table contactos (
  id                   uuid primary key default gen_random_uuid(),
  cuenta_id            uuid not null references cuentas (id) on delete cascade,
  nombre               text not null,
  cargo                text,
  telefono             text,
  telefono_normalizado text generated always as (normalizar_telefono(telefono)) stored,
  email                text,
  es_principal         boolean not null default false,
  created_at           timestamptz not null default now()
);
create index ix_contactos_tel on contactos (telefono_normalizado);
create index ix_contactos_cuenta on contactos (cuenta_id);

-- ------------------------------------------------------------
-- LEADS (bandeja de Central: TODO contacto entrante)
-- ------------------------------------------------------------
create table leads (
  id                   uuid primary key default gen_random_uuid(),
  codigo               text unique,                      -- 'PRO-00123' (trigger)
  estado               estado_lead not null default 'pendiente_triaje',
  area_destino         area_destino not null default 'comercial',
  canal                canal_contacto not null,          -- VIA: por dónde llegó
  -- Atribución de marketing (≠ canal):
  fuente               text,                             -- 'google_ads' | 'meta_ads' | 'organico' | 'referido' | ...
  gclid                text,
  fbclid               text,
  utm_source           text,
  utm_medium           text,
  utm_campaign         text,
  utm_content          text,
  -- Datos capturados:
  nombre_contacto      text,
  telefono             text,
  telefono_normalizado text generated always as (normalizar_telefono(telefono)) stored,
  email                text,
  num_doc              text,
  razon_social         text,
  mensaje              text,
  -- Trazabilidad (réplica de lo que Central mide hoy):
  recibido_at          timestamptz not null default now(),
  recibido_por         uuid references perfiles (id),    -- null si ingesta automática
  asignado_a           uuid references perfiles (id),
  asignado_at          timestamptz,
  asignado_por         uuid references perfiles (id),
  cuenta_id            uuid references cuentas (id),     -- vinculado tras dedup
  duplicado_de         uuid references leads (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index ix_leads_estado on leads (estado);
create index ix_leads_tel on leads (telefono_normalizado);
create index ix_leads_asignado on leads (asignado_a);
create trigger trg_leads_updated before update on leads
  for each row execute function set_updated_at();

create or replace function asignar_codigo_lead()
returns trigger language plpgsql security definer as $$
begin
  if new.codigo is null then
    -- ⚠️ Alinear formato con la serie real de Central antes del piloto.
    new.codigo := 'PRO-' || lpad(siguiente_correlativo('PRO')::text, 5, '0');
  end if;
  return new;
end $$;
create trigger trg_leads_codigo before insert on leads
  for each row execute function asignar_codigo_lead();

-- ------------------------------------------------------------
-- OPORTUNIDADES (una gestión comercial sobre una cuenta)
-- ------------------------------------------------------------
create table oportunidades (
  id                 uuid primary key default gen_random_uuid(),
  cuenta_id          uuid not null references cuentas (id),
  lead_id            uuid references leads (id),
  comercial_id       uuid not null references perfiles (id),
  etapa              etapa_oportunidad not null default 'asignada',
  motivo_rechazo_id  integer references catalogo_motivos_rechazo (id),
  intencion          intencion_compra not null default 'sin_definir',
  segmento           segmento_producto,
  monto_estimado     numeric(12,2),
  moneda             moneda not null default 'USD',
  -- Próxima acción SIEMPRE visible (tercera dimensión del estado):
  proxima_accion     text,
  proxima_accion_at  date,
  cerrada_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint rechazo_con_motivo check (etapa <> 'rechazada' or motivo_rechazo_id is not null)
);
create index ix_oportunidades_comercial on oportunidades (comercial_id, etapa);
create index ix_oportunidades_cuenta on oportunidades (cuenta_id);
create trigger trg_oportunidades_updated before update on oportunidades
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- ACTIVIDADES (historial append-only; registrar una debe tomar ≤15 s)
-- ------------------------------------------------------------
create table actividades (
  id              uuid primary key default gen_random_uuid(),
  oportunidad_id  uuid not null references oportunidades (id) on delete cascade,
  tipo            tipo_actividad not null,
  nota            text,
  realizada_por   uuid not null references perfiles (id),
  realizada_at    timestamptz not null default now()
);
create index ix_actividades_oportunidad on actividades (oportunidad_id, realizada_at desc);

-- ------------------------------------------------------------
-- PRODUCTOS Y PRECIOS
-- ------------------------------------------------------------
create table productos (
  id         uuid primary key default gen_random_uuid(),
  sku        text unique,
  marca      text not null,             -- LG, Primus, Unimac, Sailstar, ADC, Efamein, ...
  modelo     text not null,
  nombre     text not null,
  categoria  text,                      -- lavadora, secadora, planchador, ...
  segmento   segmento_producto not null,
  capacidad  text,                      -- ej. '10.5 kg', '30 lb'
  foto_path  text,                      -- Supabase Storage (fotos estandarizadas)
  ficha      jsonb not null default '{}'::jsonb,  -- atributos técnicos libres
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_productos_updated before update on productos
  for each row execute function set_updated_at();

-- Semi-industrial: 3 filas (optimo/medio/deseado). Industrial: 1 fila (base).
create table precios_producto (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references productos (id) on delete cascade,
  tier          tier_precio not null,
  precio        numeric(12,2) not null check (precio > 0),
  moneda        moneda not null default 'USD',
  vigente_desde date not null default current_date,
  vigente_hasta date,                   -- null = vigente
  constraint uq_precio_vigente unique (producto_id, tier, vigente_desde)
);
create index ix_precios_producto on precios_producto (producto_id) where vigente_hasta is null;

-- ------------------------------------------------------------
-- COTIZACIONES (dos series correlativas: EFAMEINSA / OPEN)
-- ------------------------------------------------------------
create table cotizaciones (
  id                 uuid primary key default gen_random_uuid(),
  oportunidad_id     uuid not null references oportunidades (id),
  serie              serie_cotizacion not null,
  correlativo        integer,                      -- trigger; 'Presu_###'
  codigo             text,                         -- 'Presu_123' formateado (trigger)
  estado             estado_cotizacion not null default 'borrador',
  estado_aprobacion  estado_aprobacion not null default 'auto_aprobada',
  aprobada_por       uuid references perfiles (id),
  aprobada_at        timestamptz,
  -- Snapshot del cliente al cotizar (el PDF no debe cambiar si la cuenta cambia):
  cliente_snapshot   jsonb not null default '{}'::jsonb,
  subtotal           numeric(12,2) not null default 0,
  total              numeric(12,2) not null default 0,
  moneda             moneda not null default 'USD',
  condiciones        text,                         -- entrega, garantía, validez...
  vigencia_dias      integer not null default 15,
  pdf_path           text,                         -- Supabase Storage
  enviada_at         timestamptz,
  creada_por         uuid not null references perfiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint uq_cotizacion_serie unique (serie, correlativo),
  -- Regla dura: no sale una cotización sin aprobación resuelta.
  constraint enviada_requiere_aprobacion check (
    estado not in ('enviada', 'aceptada')
    or estado_aprobacion in ('auto_aprobada', 'aprobada_gerencia')
  )
);
create index ix_cotizaciones_oportunidad on cotizaciones (oportunidad_id);
create index ix_cotizaciones_aprobacion on cotizaciones (estado_aprobacion)
  where estado_aprobacion = 'pendiente_gerencia';
create trigger trg_cotizaciones_updated before update on cotizaciones
  for each row execute function set_updated_at();

create or replace function asignar_correlativo_cotizacion()
returns trigger language plpgsql security definer as $$
begin
  if new.correlativo is null then
    new.correlativo := siguiente_correlativo(new.serie::text);
    new.codigo := 'Presu_' || new.correlativo::text;
  end if;
  return new;
end $$;
create trigger trg_cotizaciones_correlativo before insert on cotizaciones
  for each row execute function asignar_correlativo_cotizacion();

create table cotizacion_items (
  id             uuid primary key default gen_random_uuid(),
  cotizacion_id  uuid not null references cotizaciones (id) on delete cascade,
  producto_id    uuid not null references productos (id),
  cantidad       integer not null check (cantidad > 0),
  -- Snapshot de lista al cotizar + precio realmente ofrecido:
  tier_aplicado    tier_precio,
  precio_lista     numeric(12,2),        -- precio del tier más bajo permitido, al momento de cotizar
  precio_unitario  numeric(12,2) not null check (precio_unitario >= 0),
  -- true ⇒ precio_unitario < precio_lista ⇒ la cotización pasa a pendiente_gerencia (lo calcula la app)
  bajo_lista       boolean not null default false,
  subtotal         numeric(12,2) generated always as (cantidad * precio_unitario) stored
);
create index ix_items_cotizacion on cotizacion_items (cotizacion_id);

-- ------------------------------------------------------------
-- VENTAS (cierre; alimenta dashboard y regla de cartera)
-- ------------------------------------------------------------
create table ventas (
  id              uuid primary key default gen_random_uuid(),
  oportunidad_id  uuid not null references oportunidades (id),
  cotizacion_id   uuid references cotizaciones (id),
  serie           serie_cotizacion not null,     -- razón social con la que se facturó
  fecha_venta     date not null default current_date,
  monto_total     numeric(12,2) not null,
  moneda          moneda not null default 'USD',
  registrada_por  uuid not null references perfiles (id),
  notas           text,
  created_at      timestamptz not null default now()
);
create index ix_ventas_fecha on ventas (fecha_venta);

-- Al registrar venta: actualizar ultima_venta_at de la cuenta (regla 6 meses).
create or replace function actualizar_ultima_venta()
returns trigger language plpgsql security definer as $$
begin
  update cuentas c set ultima_venta_at = greatest(coalesce(c.ultima_venta_at, '-infinity'), new.fecha_venta::timestamptz)
  from oportunidades o
  where o.id = new.oportunidad_id and c.id = o.cuenta_id;
  return new;
end $$;
create trigger trg_ventas_ultima_venta after insert on ventas
  for each row execute function actualizar_ultima_venta();

-- ------------------------------------------------------------
-- ASIGNACIONES (auditoría: quién decidió qué y por qué)
-- ------------------------------------------------------------
create table asignaciones (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references leads (id),
  cuenta_id     uuid references cuentas (id),
  de_comercial  uuid references perfiles (id),
  a_comercial   uuid not null references perfiles (id),
  motivo        motivo_asignacion not null,
  decidida_por  uuid not null references perfiles (id),
  notas         text,
  created_at    timestamptz not null default now(),
  constraint asignacion_con_objeto check (lead_id is not null or cuenta_id is not null)
);

-- ------------------------------------------------------------
-- MARKETING: campañas, gasto diario, conversiones offline
-- ------------------------------------------------------------
create table campanias (
  id           uuid primary key default gen_random_uuid(),
  plataforma   plataforma_ads not null,
  campaign_id  text not null,             -- id externo en Google/Meta
  nombre       text not null,
  activa       boolean not null default true,
  constraint uq_campania unique (plataforma, campaign_id)
);

create table gasto_campania (
  id            uuid primary key default gen_random_uuid(),
  campania_id   uuid not null references campanias (id) on delete cascade,
  fecha         date not null,
  gasto         numeric(12,2) not null default 0,
  impresiones   integer not null default 0,
  clics         integer not null default 0,
  leads_reportados integer not null default 0,   -- leads que la plataforma dice haber generado
  moneda        moneda not null default 'USD',
  constraint uq_gasto_dia unique (campania_id, fecha)
);

-- Existe desde v1 aunque el envío sea v2: la atribución no se reconstruye hacia atrás.
create table conversiones_enviadas (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references leads (id),
  plataforma   plataforma_ads not null,
  tipo         text not null,              -- 'lead_calificado' | 'venta'
  enviada_at   timestamptz,
  respuesta    jsonb,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ACCESOS (pedido de gerencia: saber quién entra y desde dónde)
-- ------------------------------------------------------------
create table accesos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references perfiles (id),
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index ix_accesos_user on accesos (user_id, created_at desc);

-- ------------------------------------------------------------
-- VISTAS DE REGLAS DE NEGOCIO
-- ------------------------------------------------------------

-- Regla 6 meses: cuentas con cartera cuyo comercial no vendió en 6 meses.
-- Gerencia decide manualmente la derivación (no es automática).
create view v_cuentas_liberables with (security_invoker = on) as
select c.*,
       greatest(coalesce(c.ultima_venta_at, c.cartera_desde), c.cartera_desde) as referencia_desde
from cuentas c
where c.comercial_id is not null
  and coalesce(c.ultima_venta_at, c.cartera_desde) < now() - interval '6 months';

-- Silencio: sugerir rechazo tras 2 meses sin actividad (pre-cotización)
-- o 3 meses (post-cotización). Sugerencia, no automatismo.
create view v_oportunidades_inactivas with (security_invoker = on) as
select o.*,
       ult.ultima_actividad_at,
       case when o.etapa in ('asignada','filtrada') then interval '2 months'
            else interval '3 months' end as umbral
from oportunidades o
left join lateral (
  select max(a.realizada_at) as ultima_actividad_at
  from actividades a where a.oportunidad_id = o.id
) ult on true
where o.etapa not in ('venta','rechazada','derivada')
  and coalesce(ult.ultima_actividad_at, o.created_at)
      < now() - case when o.etapa in ('asignada','filtrada')
                     then interval '2 months' else interval '3 months' end;

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Matriz: comercial → solo lo suyo · central → bandeja + lectura de cartera
--         gerencia/admin → todo · service_role (webhooks/crons) bypassa RLS.
-- ------------------------------------------------------------
alter table perfiles              enable row level security;
alter table catalogo_rubros       enable row level security;
alter table catalogo_motivos_rechazo enable row level security;
alter table cuentas               enable row level security;
alter table contactos             enable row level security;
alter table leads                 enable row level security;
alter table oportunidades         enable row level security;
alter table actividades           enable row level security;
alter table productos             enable row level security;
alter table precios_producto      enable row level security;
alter table cotizaciones          enable row level security;
alter table cotizacion_items      enable row level security;
alter table ventas                enable row level security;
alter table asignaciones          enable row level security;
alter table campanias             enable row level security;
alter table gasto_campania        enable row level security;
alter table conversiones_enviadas enable row level security;
alter table accesos               enable row level security;
alter table correlativos          enable row level security;  -- sin policies: solo via funciones definer

-- Perfiles: todos los autenticados leen (nombres en UI); escribe admin.
create policy perfiles_select on perfiles for select to authenticated using (true);
create policy perfiles_admin  on perfiles for all to authenticated
  using (rol_actual() = 'admin') with check (rol_actual() = 'admin');

-- Catálogos y productos/precios: lectura general; escritura backoffice.
create policy rubros_select   on catalogo_rubros for select to authenticated using (true);
create policy rubros_write    on catalogo_rubros for all to authenticated
  using (es_backoffice()) with check (es_backoffice());
create policy motivos_select  on catalogo_motivos_rechazo for select to authenticated using (true);
create policy motivos_write   on catalogo_motivos_rechazo for all to authenticated
  using (es_backoffice()) with check (es_backoffice());
create policy productos_select on productos for select to authenticated using (true);
create policy productos_write  on productos for all to authenticated
  using (es_backoffice()) with check (es_backoffice());
create policy precios_select   on precios_producto for select to authenticated using (true);
create policy precios_write    on precios_producto for all to authenticated
  using (es_backoffice()) with check (es_backoffice());

-- Leads: central y backoffice todo; comercial solo los suyos.
create policy leads_central on leads for all to authenticated
  using (rol_actual() = 'central' or es_backoffice())
  with check (rol_actual() = 'central' or es_backoffice());
create policy leads_comercial on leads for select to authenticated
  using (asignado_a = auth.uid());

-- Cuentas: comercial su cartera (todo); central lee y crea (dedup y alta); backoffice todo.
create policy cuentas_comercial on cuentas for all to authenticated
  using (comercial_id = auth.uid()) with check (comercial_id = auth.uid());
create policy cuentas_central_select on cuentas for select to authenticated
  using (rol_actual() = 'central');
create policy cuentas_central_insert on cuentas for insert to authenticated
  with check (rol_actual() = 'central');
create policy cuentas_backoffice on cuentas for all to authenticated
  using (es_backoffice()) with check (es_backoffice());

-- Contactos: siguen a la cuenta.
create policy contactos_por_cuenta on contactos for all to authenticated
  using (exists (select 1 from cuentas c where c.id = cuenta_id
                 and (c.comercial_id = auth.uid() or rol_actual() = 'central' or es_backoffice())))
  with check (exists (select 1 from cuentas c where c.id = cuenta_id
                 and (c.comercial_id = auth.uid() or rol_actual() = 'central' or es_backoffice())));

-- Oportunidades: comercial las suyas; central lee (seguimiento de cotizado); backoffice todo.
create policy oportunidades_comercial on oportunidades for all to authenticated
  using (comercial_id = auth.uid()) with check (comercial_id = auth.uid());
create policy oportunidades_central on oportunidades for select to authenticated
  using (rol_actual() = 'central');
create policy oportunidades_backoffice on oportunidades for all to authenticated
  using (es_backoffice()) with check (es_backoffice());

-- Actividades: siguen a la oportunidad.
create policy actividades_por_oportunidad on actividades for all to authenticated
  using (exists (select 1 from oportunidades o where o.id = oportunidad_id
                 and (o.comercial_id = auth.uid() or es_backoffice())))
  with check (exists (select 1 from oportunidades o where o.id = oportunidad_id
                 and (o.comercial_id = auth.uid() or es_backoffice())));

-- Cotizaciones e items: comercial las de sus oportunidades; central lee; backoffice todo.
create policy cotizaciones_comercial on cotizaciones for all to authenticated
  using (exists (select 1 from oportunidades o where o.id = oportunidad_id and o.comercial_id = auth.uid()))
  with check (exists (select 1 from oportunidades o where o.id = oportunidad_id and o.comercial_id = auth.uid()));
create policy cotizaciones_central on cotizaciones for select to authenticated
  using (rol_actual() = 'central');
create policy cotizaciones_backoffice on cotizaciones for all to authenticated
  using (es_backoffice()) with check (es_backoffice());
create policy items_por_cotizacion on cotizacion_items for all to authenticated
  using (exists (select 1 from cotizaciones cz join oportunidades o on o.id = cz.oportunidad_id
                 where cz.id = cotizacion_id and (o.comercial_id = auth.uid() or es_backoffice() or rol_actual() = 'central')))
  with check (exists (select 1 from cotizaciones cz join oportunidades o on o.id = cz.oportunidad_id
                 where cz.id = cotizacion_id and (o.comercial_id = auth.uid() or es_backoffice())));

-- Ventas: comercial registra y ve las suyas; backoffice todo.
create policy ventas_comercial on ventas for all to authenticated
  using (exists (select 1 from oportunidades o where o.id = oportunidad_id and o.comercial_id = auth.uid()))
  with check (exists (select 1 from oportunidades o where o.id = oportunidad_id and o.comercial_id = auth.uid()));
create policy ventas_backoffice on ventas for all to authenticated
  using (es_backoffice()) with check (es_backoffice());

-- Asignaciones: escriben central y backoffice; el comercial ve las que lo involucran.
create policy asignaciones_write on asignaciones for insert to authenticated
  with check (rol_actual() = 'central' or es_backoffice());
create policy asignaciones_select on asignaciones for select to authenticated
  using (es_backoffice() or rol_actual() = 'central'
         or a_comercial = auth.uid() or de_comercial = auth.uid());

-- Marketing: solo backoffice (los crons escriben con service_role).
create policy campanias_backoffice on campanias for all to authenticated
  using (es_backoffice()) with check (es_backoffice());
create policy gasto_backoffice on gasto_campania for all to authenticated
  using (es_backoffice()) with check (es_backoffice());
create policy conversiones_backoffice on conversiones_enviadas for select to authenticated
  using (es_backoffice());

-- Accesos: cada uno inserta el suyo (middleware); lee backoffice.
create policy accesos_insert on accesos for insert to authenticated
  with check (user_id = auth.uid());
create policy accesos_select on accesos for select to authenticated
  using (es_backoffice());
