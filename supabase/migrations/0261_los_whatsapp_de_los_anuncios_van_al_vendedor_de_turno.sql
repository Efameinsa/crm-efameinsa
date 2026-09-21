-- ============================================================
-- CRM EFAMEINSA · Migración 0261 · Los WhatsApp de los anuncios van al
-- vendedor de turno, sin pasar por Central
-- ============================================================
-- Santos, 21-09-2026 (dictado): «recibiremos todos los chats [en el CRM] y
-- no usaremos a la Central para derivar, enviaremos directamente a cada
-- vendedor… un día específico de la semana solamente le va a llegar a C5…
-- vamos a empezar con esa señorita, otro a otro comercial… una validación
-- previa antes de la asignación… si hay coincidencias que le pertenece a
-- otro vendedor lo vamos guardando en un registro… y que solamente le
-- llegue a la señorita C5 todo lo que es libre».
--
-- Tres piezas:
--   1. `wa_turnos` — qué comercial recibe los WhatsApp de campaña cada día
--      de la semana. Lo edita gerencia en Marketing → WhatsApp. Arranca con
--      C5 (Katerine Tello) los siete días, que es lo que pidió Santos.
--   2. `wa_asignaciones_automaticas` — el registro que pidió: cada WhatsApp
--      nuevo deja una fila que dice si se asignó al turno o se RETUVO, y por
--      qué (coincide con la cartera de otro comercial, no había turno, o la
--      derivación falló). Lo retenido se queda en la bandeja de Central,
--      que lo resuelve con su procedimiento de siempre (PIN si mueve
--      cartera). Nada se pierde y nada se asigna «por encima» de un dueño.
--   3. `asignar_lead_desde_whatsapp()` — la puerta que usa el webhook (rol
--      service_role, sin usuario). NO copia `asignar_lead`: la llama, para
--      que rijan las mismas reglas de siempre (un expediente por cliente,
--      la ficha con RUC manda, sedes, cascarones). Como `asignar_lead`
--      escribe `auth.uid()` en `asignaciones.decidida_por` (NOT NULL) y
--      exige un rol, la función fija por la duración de la transacción los
--      claims de la cuenta de Central: la derivación queda firmada por
--      Central, con la nota «asignación automática» para que en la
--      auditoría no se confunda con una derivación hecha a mano.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Turnos por día de la semana
create table if not exists wa_turnos (
  -- 0 = domingo … 6 = sábado (igual que extract(dow) y que Date.getDay()).
  dia_semana   smallint primary key check (dia_semana between 0 and 6),
  comercial_id uuid references perfiles (id),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references perfiles (id)
);
comment on table wa_turnos is 'Qué comercial recibe los WhatsApp de campaña cada día de la semana (0261). Sin fila o con comercial nulo, ese día el contacto se queda en la bandeja de Central.';

alter table wa_turnos enable row level security;
drop policy if exists wa_turnos_select on wa_turnos;
create policy wa_turnos_select on wa_turnos for select to authenticated
  using ((select activo from perfiles where id = auth.uid()) is true);
drop policy if exists wa_turnos_write on wa_turnos;
create policy wa_turnos_write on wa_turnos for all to authenticated
  using (coalesce(es_backoffice(), false)) with check (coalesce(es_backoffice(), false));

-- Arranque: C5 los siete días («vamos a empezar con esa señorita»).
insert into wa_turnos (dia_semana, comercial_id)
select d, (select id from perfiles where codigo_comercial = 'C5' and rol = 'comercial' and activo and not es_prueba limit 1)
  from generate_series(0, 6) as d
on conflict (dia_semana) do nothing;

-- ------------------------------------------------------------
-- 2. El registro de lo que llegó y qué se hizo con cada uno
create table if not exists wa_asignaciones_automaticas (
  id               bigint generated always as identity primary key,
  lead_id          uuid references leads (id) on delete set null,
  conversacion_id  uuid references wa_conversaciones (id) on delete set null,
  telefono         text,
  resultado        text not null check (resultado in ('asignado', 'retenido_cartera_ajena', 'retenido_sin_turno', 'retenido_error')),
  comercial_turno  uuid references perfiles (id),
  cuenta_id        uuid references cuentas (id) on delete set null,
  dueno_cartera    uuid references perfiles (id),
  detalle          text,
  created_at       timestamptz not null default now()
);
comment on table wa_asignaciones_automaticas is 'Cada WhatsApp nuevo de campaña: a quién se asignó por turno, o por qué se retuvo para Central (0261).';
create index if not exists wa_asignaciones_automaticas_created_idx on wa_asignaciones_automaticas (created_at desc);

alter table wa_asignaciones_automaticas enable row level security;
-- Lo escribe solo el servidor (service role). Lo leen Central (le toca
-- resolver lo retenido) y gerencia.
drop policy if exists wa_asignaciones_automaticas_select on wa_asignaciones_automaticas;
create policy wa_asignaciones_automaticas_select on wa_asignaciones_automaticas for select to authenticated
  using (coalesce(rol_actual() = 'central', false) or coalesce(es_backoffice(), false));

-- ------------------------------------------------------------
-- 3. La puerta del webhook
create or replace function asignar_lead_desde_whatsapp(p_lead_id uuid, p_conversacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead         leads%rowtype;
  v_dia          smallint;
  v_turno        uuid;
  v_turno_nombre text;
  v_turno_codigo text;
  v_central      uuid;
  v_juego        record;
  v_oportunidad  uuid;
  v_error        text;
begin
  -- Solo el servidor (webhook) entra por acá. Se comprueba ANTES de tocar
  -- los claims, que es lo que esta función cambia más abajo.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'No autorizado';
  end if;

  select * into v_lead from leads where id = p_lead_id for update;
  if v_lead is null then
    return jsonb_build_object('resultado', 'retenido_error', 'detalle', 'No existe el contacto');
  end if;
  if v_lead.estado <> 'pendiente_triaje' or v_lead.area_destino <> 'comercial' then
    return jsonb_build_object('resultado', 'retenido_error', 'detalle', 'El contacto ya no está en triaje comercial');
  end if;

  -- El turno de HOY en Lima.
  v_dia := extract(dow from (now() at time zone 'America/Lima'))::smallint;
  select t.comercial_id, p.nombre, p.codigo_comercial
    into v_turno, v_turno_nombre, v_turno_codigo
    from wa_turnos t
    join perfiles p on p.id = t.comercial_id
   where t.dia_semana = v_dia
     and p.rol = 'comercial' and p.activo;

  if v_turno is null then
    insert into wa_asignaciones_automaticas (lead_id, conversacion_id, telefono, resultado, detalle)
    values (p_lead_id, p_conversacion_id, v_lead.telefono, 'retenido_sin_turno', 'Hoy no hay comercial de turno; queda en la bandeja de Central');
    return jsonb_build_object('resultado', 'retenido_sin_turno');
  end if;

  -- LA VALIDACIÓN PREVIA que pidió Santos: si el número (o el RUC) ya es de
  -- un cliente con dueño distinto, no se asigna: se retiene para Central y
  -- queda escrito de quién era. `cartera_en_juego` es la misma comprobación
  -- que usa el diálogo de derivar (0107): solo devuelve fila cuando el
  -- cliente ya tiene dueño Y es otro.
  select * into v_juego from cartera_en_juego(p_lead_id, v_turno);
  if v_juego.cuenta_id is not null then
    insert into wa_asignaciones_automaticas (lead_id, conversacion_id, telefono, resultado, comercial_turno, cuenta_id, dueno_cartera, detalle)
    values (p_lead_id, p_conversacion_id, v_lead.telefono, 'retenido_cartera_ajena', v_turno, v_juego.cuenta_id, v_juego.dueno_id,
            format('%s ya es cliente de %s (%s)', v_juego.razon_social, v_juego.dueno_nombre, coalesce(v_juego.dueno_codigo, 's/c')));
    return jsonb_build_object(
      'resultado', 'retenido_cartera_ajena',
      'cuenta_id', v_juego.cuenta_id, 'razon_social', v_juego.razon_social,
      'dueno_id', v_juego.dueno_id, 'dueno_nombre', v_juego.dueno_nombre, 'dueno_codigo', v_juego.dueno_codigo,
      'comercial_turno', v_turno, 'comercial_nombre', v_turno_nombre, 'comercial_codigo', v_turno_codigo);
  end if;

  -- La derivación la firma la cuenta de Central (ver cabecera). Claims por
  -- la transacción (is_local = true): al terminar, vuelven solos.
  select id into v_central from perfiles where rol = 'central' and activo and not es_prueba order by created_at limit 1;
  if v_central is null then
    insert into wa_asignaciones_automaticas (lead_id, conversacion_id, telefono, resultado, comercial_turno, detalle)
    values (p_lead_id, p_conversacion_id, v_lead.telefono, 'retenido_error', v_turno, 'No hay cuenta de Central activa para firmar la derivación');
    return jsonb_build_object('resultado', 'retenido_error', 'detalle', 'Sin cuenta de Central');
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_central, 'role', 'authenticated')::text, true);

  begin
    v_oportunidad := asignar_lead(p_lead_id, v_turno, 'nuevo_lead', null);
  exception when others then
    v_error := sqlerrm;
    insert into wa_asignaciones_automaticas (lead_id, conversacion_id, telefono, resultado, comercial_turno, detalle)
    values (p_lead_id, p_conversacion_id, v_lead.telefono, 'retenido_error', v_turno, left(v_error, 500));
    return jsonb_build_object('resultado', 'retenido_error', 'detalle', v_error);
  end;

  update asignaciones
     set notas = coalesce(notas || ' · ', '') || 'Asignación automática: WhatsApp de campaña, turno del día (0261)'
   where lead_id = p_lead_id and created_at > now() - interval '1 minute';

  update wa_conversaciones set asignado_a = v_turno where id = p_conversacion_id;

  insert into wa_asignaciones_automaticas (lead_id, conversacion_id, telefono, resultado, comercial_turno, cuenta_id, detalle)
  select p_lead_id, p_conversacion_id, v_lead.telefono, 'asignado', v_turno, l.cuenta_id, format('Asignado a %s (%s)', v_turno_nombre, coalesce(v_turno_codigo, 's/c'))
    from leads l where l.id = p_lead_id;

  return jsonb_build_object(
    'resultado', 'asignado',
    'comercial_id', v_turno, 'comercial_nombre', v_turno_nombre, 'comercial_codigo', v_turno_codigo,
    'oportunidad_id', v_oportunidad);
end $$;

revoke all on function asignar_lead_desde_whatsapp(uuid, uuid) from public;
revoke all on function asignar_lead_desde_whatsapp(uuid, uuid) from authenticated;
grant execute on function asignar_lead_desde_whatsapp(uuid, uuid) to service_role;
comment on function asignar_lead_desde_whatsapp(uuid, uuid) is
  'El webhook de WhatsApp asigna el contacto nuevo al comercial de turno del día (wa_turnos) con las reglas de asignar_lead; si el cliente ya es de otro comercial, lo retiene para Central y lo anota en wa_asignaciones_automaticas (0261).';

-- ------------------------------------------------------------
-- 4. Los códigos de los anuncios de la reactivación (informe del 12-09 y
-- decisión del 21-09: solo LG semi-industrial + formulario). El mensaje
-- prellenado es lo que el cliente MANDA al tocar el anuncio: pide los datos
-- de una vez, con espacios para completar, y cierra con el código para que
-- el webhook lo reconozca aunque Meta no mande el referral. `campaign_id`
-- se completa con el ID del ANUNCIO cuando se creen en el Administrador
-- (el webhook lo cruza con `referral.source_id`).
insert into campanias_whatsapp (codigo, nombre, plataforma, mensaje_prellenado, activa) values
  ('M1-A', 'Meta · LG Titan Max (imagen)', 'meta',
   'Hola Efameinsa, vi su anuncio de la lavadora LG Titan Max y quiero una cotización. Mi negocio: ____ · Ciudad: ____ · Kilos de ropa por día: ____ [M1-A]', true),
  ('M1-B', 'Meta · UniMac Serie UY (video)', 'meta',
   'Hola Efameinsa, vi su anuncio de las lavadoras industriales UniMac y quiero una cotización. Mi negocio: ____ · Ciudad: ____ · Kilos de ropa por día: ____ [M1-B]', true),
  ('M1-C', 'Meta · LG Titan Torre (video)', 'meta',
   'Hola Efameinsa, vi su anuncio de la torre LG Titan y quiero una cotización. Mi negocio: ____ · Ciudad: ____ · Kilos de ropa por día: ____ [M1-C]', true),
  ('M1-D', 'Meta · Equipos LG semi-industriales (video)', 'meta',
   'Hola Efameinsa, vi su anuncio de las lavadoras semi-industriales LG y quiero una cotización. Mi negocio: ____ · Ciudad: ____ · Kilos de ropa por día: ____ [M1-D]', true)
on conflict ((upper(codigo))) do update
  set nombre = excluded.nombre,
      mensaje_prellenado = excluded.mensaje_prellenado,
      activa = true;
