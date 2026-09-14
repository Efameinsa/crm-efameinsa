-- ============================================================
-- CRM EFAMEINSA · Migración 0233 · WhatsApp: bandeja de chat (fase 2)
-- ============================================================
-- Plan de gerencia, Downloads/plan-whatsapp-api-crm.md, sección 2.3.
-- PENDIENTE DE APROBACIÓN DE GERENCIA PARA USAR EN PRODUCCIÓN — Santos pidió
-- (15-09) arrancar el trámite de verificación de Meta y dejar la parte
-- técnica lista en paralelo, para no perder los días de espera de Meta.
--
-- Esta migración NO depende de tener credenciales reales: las tres tablas y
-- sus RLS se pueden probar enteras con payloads simulados (firmados con
-- cualquier WHATSAPP_APP_SECRET de prueba) antes de que exista un número real.
--
-- Tres piezas:
--   1. `wa_conversaciones` — un hilo por número de teléfono con estado
--      abierto. Vive independiente de `leads`/`oportunidades`: la primera vez
--      que escribe alguien se crea también el lead (mismo circuito de
--      siempre: bandeja de Central, asignar_lead, PIN), pero la conversación
--      en sí (mensajes, ventana de 24 h) es un concepto de WhatsApp, no de
--      ventas — por eso tabla aparte, igual que `tipificaciones_whatsapp` no
--      es una columna de `leads`.
--   2. `wa_mensajes` — cada mensaje entrante o saliente, con el `wamid` de
--      Meta como clave de deduplicación (Meta reintenta webhooks; sin esto
--      un mensaje se duplicaría en pantalla cada vez que reintenta).
--   3. `wa_plantillas_rapidas` — respuestas armadas del equipo, catálogo
--      simple tipo `campanias_whatsapp`.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Conversaciones
create table if not exists wa_conversaciones (
  id uuid primary key default gen_random_uuid(),
  -- E.164 sin el "+": "51999888777". Único mientras esté con estado
  -- distinto de 'cerrada' — si el cliente vuelve a escribir después de
  -- cerrada, se reabre la misma fila (no se crea una segunda), así el
  -- historial de mensajes queda completo en un solo hilo.
  telefono text not null,
  nombre_wa text,
  lead_id uuid references leads (id),
  contacto_id uuid references contactos (id),
  asignado_a uuid references perfiles (id),
  estado text not null default 'sin_atender' check (estado in ('sin_atender', 'en_gestion', 'cerrada')),
  -- Ventana de 24 h de Meta: pasado este momento + 24 h, ya no se puede
  -- mandar texto libre (solo plantillas aprobadas, fase 3).
  ultimo_mensaje_cliente_at timestamptz,
  ultimo_mensaje_at timestamptz,
  -- Clic al anuncio (click-to-WhatsApp): la clave para retroalimentar a Meta
  -- con el resultado de la conversación (fase 2.8, aún no construida).
  ctwa_clid text,
  referral jsonb,
  codigo_campania_wa text,
  created_at timestamptz not null default now()
);

comment on table wa_conversaciones is 'Un hilo de WhatsApp por número (fase 2, con la Cloud API). Independiente de leads/oportunidades: la conversación es de WhatsApp, la venta es del CRM.';
comment on column wa_conversaciones.telefono is 'E.164 sin el signo +, ej. 51999888777.';
comment on column wa_conversaciones.ultimo_mensaje_cliente_at is 'Momento del último mensaje QUE ESCRIBIÓ EL CLIENTE — de acá se cuenta la ventana de 24 h para poder responder con texto libre.';

-- Solo puede haber UNA conversación abierta por teléfono a la vez (para que
-- el mensaje nuevo de un cliente no abra un hilo duplicado mientras el
-- anterior sigue "en_gestion"). Cerrar una conversación no la borra ni la
-- vuelve a abrir sola: si el mismo cliente escribe después de cerrada, el
-- webhook abre un caso NUEVO (lead y conversación aparte) — la cerrada queda
-- de historial en la pestaña «Cerradas», igual que un expediente antiguo no
-- se reabre solo cuando el cliente vuelve por otro motivo.
create unique index if not exists ux_wa_conversaciones_telefono_abierta
  on wa_conversaciones (telefono)
  where estado <> 'cerrada';

create index if not exists ix_wa_conversaciones_asignado on wa_conversaciones (asignado_a, estado);

alter table wa_conversaciones enable row level security;

-- Central, gerencia y admin ven todas las conversaciones (mismo criterio que
-- leads_central en 0001/0060): son quienes derivan y supervisan.
drop policy if exists wa_conversaciones_central on wa_conversaciones;
create policy wa_conversaciones_central on wa_conversaciones
  for all to authenticated
  using ((select rol_actual()) = 'central' or es_backoffice())
  with check ((select rol_actual()) = 'central' or es_backoffice());

-- El comercial (y postventa, que también es rol comercial con
-- hace_postventa) solo ve y actualiza lo que tiene asignado — igual que sus
-- oportunidades.
drop policy if exists wa_conversaciones_comercial on wa_conversaciones;
create policy wa_conversaciones_comercial on wa_conversaciones
  for select to authenticated
  using (asignado_a = (select auth.uid()));

drop policy if exists wa_conversaciones_comercial_actualiza on wa_conversaciones;
create policy wa_conversaciones_comercial_actualiza on wa_conversaciones
  for update to authenticated
  using (asignado_a = (select auth.uid()))
  with check (asignado_a = (select auth.uid()));

-- ------------------------------------------------------------
-- 2. Mensajes
create table if not exists wa_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references wa_conversaciones (id) on delete cascade,
  -- El id que asigna Meta a cada mensaje. Único: Meta reintenta la entrega
  -- del webhook si no responde 200 a tiempo, y sin esta clave el mismo
  -- mensaje entraría dos veces.
  wamid text unique,
  direccion text not null check (direccion in ('entrante', 'saliente')),
  tipo text not null default 'text' check (
    tipo in ('text', 'image', 'document', 'audio', 'video', 'sticker', 'location', 'contacts', 'button', 'unknown')
  ),
  texto text,
  media_id text,
  media_url_storage text,
  estado text not null default 'recibido' check (
    estado in ('recibido', 'enviando', 'enviado', 'entregado', 'leido', 'fallido')
  ),
  enviado_por uuid references perfiles (id),
  error jsonb,
  timestamp_meta timestamptz,
  created_at timestamptz not null default now()
);

comment on table wa_mensajes is 'Cada mensaje de un hilo de WhatsApp, entrante o saliente. wamid deduplica los reintentos del webhook de Meta.';

create index if not exists ix_wa_mensajes_conversacion on wa_mensajes (conversacion_id, created_at);

alter table wa_mensajes enable row level security;

-- Los mensajes heredan el mismo criterio de acceso que su conversación: si
-- se puede ver/tocar la conversación, se pueden ver/agregar sus mensajes.
drop policy if exists wa_mensajes_por_conversacion on wa_mensajes;
create policy wa_mensajes_por_conversacion on wa_mensajes
  for all to authenticated
  using (
    exists (
      select 1 from wa_conversaciones c
      where c.id = wa_mensajes.conversacion_id
        and (c.asignado_a = (select auth.uid()) or (select rol_actual()) = 'central' or es_backoffice())
    )
  )
  with check (
    exists (
      select 1 from wa_conversaciones c
      where c.id = wa_mensajes.conversacion_id
        and (c.asignado_a = (select auth.uid()) or (select rol_actual()) = 'central' or es_backoffice())
    )
  );

-- ------------------------------------------------------------
-- 3. Respuestas rápidas del equipo
create table if not exists wa_plantillas_rapidas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  texto text not null,
  activa boolean not null default true,
  creado_por uuid references perfiles (id),
  created_at timestamptz not null default now()
);

comment on table wa_plantillas_rapidas is 'Respuestas armadas del equipo para agilizar el chat (no son plantillas aprobadas por Meta — esas son fase 3, con costo por mensaje).';

alter table wa_plantillas_rapidas enable row level security;

drop policy if exists wa_plantillas_rapidas_select on wa_plantillas_rapidas;
create policy wa_plantillas_rapidas_select on wa_plantillas_rapidas
  for select to authenticated
  using ((select activo from perfiles where id = auth.uid()) is true);

drop policy if exists wa_plantillas_rapidas_write on wa_plantillas_rapidas;
create policy wa_plantillas_rapidas_write on wa_plantillas_rapidas
  for all to authenticated
  using (es_backoffice())
  with check (es_backoffice());
