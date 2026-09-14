-- ============================================================
-- CRM EFAMEINSA · Migración 0231 · WhatsApp de campaña (fase 1, sin API)
-- ============================================================
-- Plan de gerencia del 14-09: las campañas de Meta Ads van a un WhatsApp con
-- mensaje prellenado con código por anuncio («Hola, vi su anuncio… [M1-A]»).
-- Hasta que la Cloud API esté aprobada (fase 2), lo que hoy es un Excel por
-- vendedor pasa a ser un botón "WhatsApp entrante" en el mismo formulario de
-- captura que ya usan Central y los comerciales — sin flujo nuevo, sin tocar
-- el circuito de asignación (asignar_lead, dedupe, traspaso de cartera).
--
-- Detalle completo: Downloads/plan-whatsapp-api-crm.md. El ESQUEMA se aplica
-- ahora en producción por autorización expresa de Santos (14-09: «Aplícala
-- ahora»), justamente para poder mostrarle a gerencia las pantallas reales
-- antes de decidir. Es aditiva y no toca nada que ya funcione. El USO del
-- flujo en campañas reales sigue PENDIENTE DE APROBACIÓN DE GERENCIA.
--
-- Nota de numeración: esta migración se aplicó primero como
-- "0230_whatsapp_de_campana.sql" (14-09, 15:23:12 UTC); se renombró a 0231
-- al chocar con "0230_un_telefono_vacio_no_empata_con_nadie.sql" de otra
-- sesión concurrente. El contenido es idéntico; solo cambió el número.
--
-- Tres piezas:
--   1. `campanias_whatsapp` — el catálogo de códigos (M1-A, M1-B…), con su
--      plataforma. Lo carga quien administra marketing; todo el que registra
--      un contacto solo lo LEE, para elegirlo de una lista.
--   2. Dos columnas en `leads`, escritas SOLO al insertar (igual que gclid,
--      utm_campaign, fuente…): de qué código vino y de qué plataforma es ese
--      código. Denormalizado a propósito: si el código cambia de nombre o se
--      da de baja después, el contacto conserva de dónde vino de verdad.
--   3. `tipificaciones_whatsapp` — el resultado de la conversación
--      (interesado, cotizado, no interesado, equivocado, sin respuesta,
--      continuado por mi línea). VA EN TABLA APARTE, no como columna de
--      `leads`, y es la única desviación del plan original: `leads` no tiene
--      ninguna política que deje a un comercial actualizar su propia fila (la
--      regla de la casa es "el comercial no corrige lo suyo", 0060), y abrir
--      una para esto habría que blindarla campo por campo. Una tabla propia,
--      con INSERT (no UPDATE: cada tipificación es una fila nueva, con quién y
--      cuándo — mismo criterio que `actividades`), es más simple, más segura y
--      de paso deja historial completo si el vendedor cambia de opinión.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Catálogo de campañas de WhatsApp
create table if not exists campanias_whatsapp (
  id uuid primary key default gen_random_uuid(),
  -- El código que va en el mensaje prellenado del anuncio: "M1-A". Corto,
  -- porque el vendedor lo lee de un vistazo en el primer mensaje del cliente.
  codigo text not null,
  nombre text not null,
  plataforma text not null check (plataforma in ('meta', 'google', 'otro')),
  -- El ID de campaña de la plataforma, cuando se conoce (cruza con
  -- `campanias.campaign_id`, que ya sincroniza el gasto). Opcional: el código
  -- corto es lo que de verdad identifica al anuncio en el día a día.
  campaign_id text,
  mensaje_prellenado text,
  activa boolean not null default true,
  creado_por uuid references perfiles (id),
  created_at timestamptz not null default now()
);

comment on table campanias_whatsapp is 'Códigos de campaña para el mensaje prellenado de WhatsApp (M1-A, M1-B…). Fase 1 del WhatsApp de campañas, 14-09-2026.';

create unique index if not exists ux_campanias_whatsapp_codigo on campanias_whatsapp (upper(codigo));

alter table campanias_whatsapp enable row level security;

-- Cualquier cuenta activa necesita LEER la lista para elegir un código al
-- registrar un contacto (Central y comercial, desde sus propios formularios).
drop policy if exists campanias_whatsapp_select on campanias_whatsapp;
create policy campanias_whatsapp_select on campanias_whatsapp
  for select to authenticated
  using ((select activo from perfiles where id = auth.uid()) is true);

-- Administrar los códigos (crear, renombrar, dar de baja) es de quien
-- gestiona marketing: backoffice, mismo criterio que el catálogo de rubros.
drop policy if exists campanias_whatsapp_write on campanias_whatsapp;
create policy campanias_whatsapp_write on campanias_whatsapp
  for all to authenticated
  using (es_backoffice())
  with check (es_backoffice());

-- ------------------------------------------------------------
-- 2. De qué código de campaña vino el contacto (denormalizado en el lead)
alter table leads
  add column if not exists codigo_campania_wa text,
  add column if not exists plataforma_campania_wa text check (plataforma_campania_wa in ('meta', 'google', 'otro'));

comment on column leads.codigo_campania_wa is 'Código de campanias_whatsapp con el que se registró este contacto (fase 1, sin API). Denormalizado: no cambia si el código se renombra después.';
comment on column leads.plataforma_campania_wa is 'Plataforma del código de campaña anterior, copiada al momento de registrar.';

-- ------------------------------------------------------------
-- 3. La tipificación del resultado de la conversación
create table if not exists tipificaciones_whatsapp (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  estado text not null check (
    estado in ('interesado', 'cotizado', 'no_interesado', 'equivocado', 'sin_respuesta', 'continuado_por_mi_linea')
  ),
  -- El motivo, para la excepción: seguir la conversación por el WhatsApp
  -- personal del vendedor es la salida permitida, pero con razón escrita
  -- (plan de gerencia: "excepción tipificada", no la práctica normal).
  nota text,
  registrado_por uuid not null references perfiles (id),
  registrado_at timestamptz not null default now()
);

comment on table tipificaciones_whatsapp is 'Historial de tipificación de contactos de WhatsApp de campaña (fase 1). Una fila por cada vez que se marca un resultado; el estado vigente es el más reciente por lead_id.';

create index if not exists ix_tipificaciones_whatsapp_lead on tipificaciones_whatsapp (lead_id, registrado_at desc);

alter table tipificaciones_whatsapp enable row level security;

-- Backoffice y Central: todo (igual que en `leads`).
drop policy if exists tipificaciones_whatsapp_central on tipificaciones_whatsapp;
create policy tipificaciones_whatsapp_central on tipificaciones_whatsapp
  for all to authenticated
  using ((select rol_actual()) = 'central' or es_backoffice())
  with check ((select rol_actual()) = 'central' or es_backoffice());

-- El comercial solo tipifica lo que tiene asignado, y solo puede insertar con
-- su propio id en `registrado_por` — no puede tipificar en nombre de otro.
drop policy if exists tipificaciones_whatsapp_comercial_insert on tipificaciones_whatsapp;
create policy tipificaciones_whatsapp_comercial_insert on tipificaciones_whatsapp
  for insert to authenticated
  with check (
    (select rol_actual()) = 'comercial'
    and registrado_por = (select auth.uid())
    and lead_id in (select id from leads where asignado_a = (select auth.uid()))
  );

drop policy if exists tipificaciones_whatsapp_comercial_select on tipificaciones_whatsapp;
create policy tipificaciones_whatsapp_comercial_select on tipificaciones_whatsapp
  for select to authenticated
  using (lead_id in (select id from leads where asignado_a = (select auth.uid())));

-- El estado vigente de cada lead: el más reciente. `distinct on` en vez de un
-- max(registrado_at) + join porque es exactamente el mismo costo y se lee más
-- claro; la tabla es chica (una fila por cambio de estado, no por mensaje).
create or replace view tipificacion_whatsapp_actual as
select distinct on (lead_id)
  lead_id, estado, nota, registrado_por, registrado_at
from tipificaciones_whatsapp
order by lead_id, registrado_at desc;

comment on view tipificacion_whatsapp_actual is 'Última tipificación de cada contacto de WhatsApp de campaña. La vista hereda RLS de tipificaciones_whatsapp.';
