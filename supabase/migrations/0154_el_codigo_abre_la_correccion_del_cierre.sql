-- ============================================================
-- CRM EFAMEINSA · Migración 0154 · El código ABRE la corrección del cierre
-- ============================================================
-- Santos, 02-09, probando la 0153: «que al presionar el botón editar aparezca
-- el modal para pedir PIN a los administradores como Lesly o gerencia».
--
-- En la 0153 el código se pedía al GUARDAR. Eso obligaba a editar a ciegas y
-- recién al final enterarse de si había autorización, y además el código
-- rota cada diez minutos: quien tardaba en corregir tenía que volver a llamar.
-- Ahora es el mismo flujo que la corrección de cotizaciones (0123): el código
-- abre una VENTANA de media hora, la pantalla se vuelve formulario, y guardar
-- ya no pide nada. La ventana es a la vez el permiso y el registro: una fila
-- sin `guardada_at` es una autorización pedida y no usada, y también cuenta.
-- ============================================================

-- ── 1. La ventana ──────────────────────────────────────────────────────
create table if not exists correcciones_informe (
  id             uuid primary key default gen_random_uuid(),
  informe_id     uuid not null references informes_cierre (id) on delete cascade,
  solicitante_id uuid not null references perfiles (id),
  autorizo       uuid not null references perfiles (id),
  motivo         text not null,
  abierta_at     timestamptz not null default now(),
  expira_at      timestamptz not null,
  guardada_at    timestamptz,
  es_prueba      boolean not null default false
);
alter table correcciones_informe enable row level security;
create index if not exists ix_correcciones_informe_abiertas
  on correcciones_informe (informe_id, solicitante_id) where guardada_at is null;

drop policy if exists correcciones_informe_lectura on correcciones_informe;
create policy correcciones_informe_lectura on correcciones_informe
  for select using (
    (select auth.uid()) = solicitante_id
    or (select auth.uid()) = autorizo
    or (select es_backoffice())
  );

comment on table correcciones_informe is
  'Ventana de media hora que abre el código de operaciones/gerencia para corregir un cierre emitido (0154). Permiso y registro a la vez.';

-- ── 2. Los frenos, en un solo sitio ────────────────────────────────────
create or replace function frenos_correccion_informe(p_informe uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_quien uuid := auth.uid();
  v_rol   text;
  v_inf   informes_cierre;
begin
  if v_quien is null then return jsonb_build_object('puede', false, 'motivo', 'Sesión no válida'); end if;
  select rol::text into v_rol from perfiles where id = v_quien and activo;
  select * into v_inf from informes_cierre where id = p_informe;
  if not found then return jsonb_build_object('puede', false, 'motivo', 'Ese cierre no existe'); end if;
  if v_inf.emitido_at is null then
    return jsonb_build_object('puede', false, 'motivo', 'Ese cierre es un borrador: se edita directo, sin código');
  end if;
  if v_inf.anulado_at is not null then
    return jsonb_build_object('puede', false, 'motivo', format('El cierre %s está anulado y no se corrige: hay que emitir uno nuevo', v_inf.codigo));
  end if;
  if v_inf.es_prueba is distinct from es_cuenta_prueba() then
    return jsonb_build_object('puede', false, 'motivo', 'Ese cierre no es de esta cuenta');
  end if;
  if v_inf.creado_por <> v_quien
     and coalesce(v_rol, '') not in ('central', 'gerencia', 'admin', 'operaciones') then
    return jsonb_build_object('puede', false, 'motivo', 'Solo quien emitió el cierre (o Central) puede corregirlo');
  end if;
  return jsonb_build_object('puede', true);
end;
$fn$;
revoke all on function frenos_correccion_informe(uuid) from public;
grant execute on function frenos_correccion_informe(uuid) to authenticated;

-- ── 3. Abrir: el código se quema acá ───────────────────────────────────
create or replace function abrir_correccion_informe(
  p_informe uuid,
  p_motivo  text,
  p_pin     text
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_quien    uuid := auth.uid();
  v_frenos   jsonb;
  v_autorizo uuid;
  v_expira   timestamptz;
  v_nombre   text;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if length(coalesce(btrim(p_motivo), '')) < 15 then
    raise exception 'Escriba qué está mal en el cierre: es lo que queda en el registro y lo que lee quien autoriza';
  end if;
  v_frenos := frenos_correccion_informe(p_informe);
  if not (v_frenos->>'puede')::boolean then
    raise exception '%', v_frenos->>'motivo';
  end if;

  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');

  begin
    insert into autorizaciones_supervisor (supervisor_id, solicitante_id, ventana, accion, motivo)
    values (v_autorizo, v_quien, ventana_pin_actual(), 'corregir_cierre', btrim(p_motivo));
  exception when unique_violation then
    raise exception 'Ese código ya se usó. Cada autorización sirve para una sola corrección: pida uno nuevo.';
  end;

  -- La ventana que vale es la última que se autorizó.
  update correcciones_informe set expira_at = now()
   where informe_id = p_informe and guardada_at is null and expira_at > now();

  v_expira := now() + duracion_correccion();
  insert into correcciones_informe (informe_id, solicitante_id, autorizo, motivo, expira_at, es_prueba)
  values (p_informe, v_quien, v_autorizo, btrim(p_motivo), v_expira, es_cuenta_prueba());

  select nombre into v_nombre from perfiles where id = v_autorizo;
  return jsonb_build_object(
    'expira_at', v_expira,
    'autorizo', coalesce(v_nombre, 'un supervisor'),
    'minutos', extract(epoch from duracion_correccion()) / 60);
end;
$fn$;
revoke all on function abrir_correccion_informe(uuid, text, text) from public;
grant execute on function abrir_correccion_informe(uuid, text, text) to authenticated;

-- La pantalla necesita saber si hay una ventana viva al cargar (un F5 a mitad
-- de la corrección no debe obligar a pedir otro código).
create or replace function correccion_informe_abierta(p_informe uuid)
returns jsonb language sql security definer set search_path = public stable as $fn$
  select coalesce((
    select jsonb_build_object(
             'expira_at', c.expira_at,
             'autorizo', coalesce(p.nombre, 'un supervisor'),
             'motivo', c.motivo)
      from correcciones_informe c
      left join perfiles p on p.id = c.autorizo
     where c.informe_id = p_informe
       and c.solicitante_id = auth.uid()
       and c.guardada_at is null
       and c.expira_at > now()
     order by c.abierta_at desc
     limit 1), 'null'::jsonb);
$fn$;
revoke all on function correccion_informe_abierta(uuid) from public;
grant execute on function correccion_informe_abierta(uuid) to authenticated;

-- ── 4. Guardar: ya no pide código, usa la ventana ──────────────────────
drop function if exists corregir_informe_emitido(uuid, jsonb, text, text);

create or replace function corregir_informe_emitido(
  p_informe uuid,
  p_cambios jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quien    uuid := auth.uid();
  v_permiso  correcciones_informe;
  v_inf      informes_cierre;
  v_items    jsonb;
  v_monto    numeric;
  v_sin_igv  numeric;
  v_venta    ventas;
  v_k        text;
  v_permitidas text[] := array[
    'cliente_nombre','cliente_doc','cliente_direccion','cliente_correo',
    'referencia','asunto','presupuesto_ref','orden_compra','cliente_nuevo','urgente',
    'modalidad_pago','forma_pago','comprobante','nota_condiciones',
    'entrega_fecha','entrega_hora','entrega_lugar','entrega_direccion','nota_despacho',
    'contacto_venta','contacto_contabilidad','contacto_despacho',
    'items','incluye','gratis','garantia','nota_final'
  ];
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  select * into v_permiso
    from correcciones_informe
   where informe_id = p_informe and solicitante_id = v_quien
     and guardada_at is null and expira_at > now()
   order by abierta_at desc limit 1;
  if not found then
    raise exception 'La autorización para corregir este cierre venció o no se pidió. Toque «Editar» y pida un código nuevo a operaciones o gerencia.';
  end if;

  select * into v_inf from informes_cierre where id = p_informe;
  if not found then raise exception 'Ese cierre no existe'; end if;
  if v_inf.emitido_at is null then raise exception 'Ese cierre es un borrador: se edita directo, sin código'; end if;
  if v_inf.anulado_at is not null then raise exception 'El cierre % está anulado y no se corrige', v_inf.codigo; end if;

  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' or p_cambios = '{}'::jsonb then
    raise exception 'No llegó ningún cambio';
  end if;
  for v_k in select jsonb_object_keys(p_cambios) loop
    if not (v_k = any (v_permitidas)) then
      raise exception 'El campo «%» no se corrige por esta vía', v_k;
    end if;
  end loop;

  v_items := coalesce(p_cambios->'items', v_inf.items);
  if jsonb_typeof(v_items) <> 'array'
     or (select count(*) from jsonb_array_elements(v_items) e where coalesce(e->>'bloque', 'venta') <> 'gratuito') = 0 then
    raise exception 'El cierre necesita al menos un equipo con precio';
  end if;

  insert into informes_cierre_versiones (informe_id, version, datos, motivo, corregido_por, autorizo)
  values (p_informe, v_inf.version, to_jsonb(v_inf), v_permiso.motivo, v_quien, v_permiso.autorizo);

  v_sin_igv := importe_informe_sin_igv(v_items);
  v_monto   := round(v_sin_igv * 1.18, 2);

  perform set_config('app.corrigiendo_cierre', 'si', true);
  perform set_config('app.expediente_autorizado', 'si', true);
  update informes_cierre set
    cliente_nombre        = coalesce(p_cambios->>'cliente_nombre', cliente_nombre),
    cliente_doc           = case when p_cambios ? 'cliente_doc' then nullif(p_cambios->>'cliente_doc', '') else cliente_doc end,
    cliente_direccion     = case when p_cambios ? 'cliente_direccion' then nullif(p_cambios->>'cliente_direccion', '') else cliente_direccion end,
    cliente_correo        = case when p_cambios ? 'cliente_correo' then nullif(p_cambios->>'cliente_correo', '') else cliente_correo end,
    referencia            = case when p_cambios ? 'referencia' then nullif(p_cambios->>'referencia', '') else referencia end,
    asunto                = coalesce(nullif(p_cambios->>'asunto', ''), asunto),
    presupuesto_ref       = case when p_cambios ? 'presupuesto_ref' then nullif(p_cambios->>'presupuesto_ref', '') else presupuesto_ref end,
    orden_compra          = case when p_cambios ? 'orden_compra' then nullif(p_cambios->>'orden_compra', '') else orden_compra end,
    cliente_nuevo         = coalesce((p_cambios->>'cliente_nuevo')::boolean, cliente_nuevo),
    urgente               = coalesce((p_cambios->>'urgente')::boolean, urgente),
    modalidad_pago        = case when p_cambios ? 'modalidad_pago'
                              then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_cambios->'modalidad_pago') x where trim(x) <> '')
                              else modalidad_pago end,
    forma_pago            = case when p_cambios ? 'forma_pago' then nullif(p_cambios->>'forma_pago', '')::forma_pago_informe else forma_pago end,
    comprobante           = case when p_cambios ? 'comprobante' then nullif(p_cambios->>'comprobante', '')::comprobante_venta else comprobante end,
    nota_condiciones      = case when p_cambios ? 'nota_condiciones' then nullif(p_cambios->>'nota_condiciones', '') else nota_condiciones end,
    entrega_fecha         = case when p_cambios ? 'entrega_fecha' then nullif(p_cambios->>'entrega_fecha', '') else entrega_fecha end,
    entrega_hora          = case when p_cambios ? 'entrega_hora' then nullif(p_cambios->>'entrega_hora', '') else entrega_hora end,
    entrega_lugar         = case when p_cambios ? 'entrega_lugar' then nullif(p_cambios->>'entrega_lugar', '') else entrega_lugar end,
    entrega_direccion     = case when p_cambios ? 'entrega_direccion' then nullif(p_cambios->>'entrega_direccion', '') else entrega_direccion end,
    nota_despacho         = case when p_cambios ? 'nota_despacho' then nullif(p_cambios->>'nota_despacho', '') else nota_despacho end,
    contacto_venta        = coalesce(p_cambios->'contacto_venta', contacto_venta),
    contacto_contabilidad = coalesce(p_cambios->'contacto_contabilidad', contacto_contabilidad),
    contacto_despacho     = coalesce(p_cambios->'contacto_despacho', contacto_despacho),
    items                 = v_items,
    incluye               = case when p_cambios ? 'incluye'
                              then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_cambios->'incluye') x where trim(x) <> '')
                              else incluye end,
    gratis                = case when p_cambios ? 'gratis' then nullif(p_cambios->>'gratis', '') else gratis end,
    garantia              = case when p_cambios ? 'garantia' then nullif(p_cambios->>'garantia', '') else garantia end,
    nota_final            = case when p_cambios ? 'nota_final' then nullif(p_cambios->>'nota_final', '') else nota_final end,
    monto_total           = v_monto,
    version               = version + 1,
    corregido_at          = now(),
    corregido_por         = v_quien
  where id = p_informe;

  if v_inf.venta_id is not null and v_monto <> v_inf.monto_total then
    select * into v_venta from ventas where id = v_inf.venta_id;
    if found and v_venta.monto_total <> v_sin_igv then
      update ventas
         set monto_total = v_sin_igv,
             notas = concat_ws(E'\n', notas, format(
               'El informe %s se corrigió (versión %s): la venta pasa de %s %s a %s %s.',
               coalesce(v_inf.codigo, '(sin código)'), v_inf.version + 1,
               v_venta.moneda, to_char(v_venta.monto_total, 'FM999G999G990D00'),
               v_venta.moneda, to_char(v_sin_igv, 'FM999G999G990D00')))
       where id = v_venta.id;
    end if;
  end if;

  update correcciones_informe set guardada_at = now() where id = v_permiso.id;

  return (select to_jsonb(i) from informes_cierre i where i.id = p_informe);
end;
$fn$;
revoke all on function corregir_informe_emitido(uuid, jsonb) from public;
grant execute on function corregir_informe_emitido(uuid, jsonb) to authenticated;

comment on function corregir_informe_emitido is
  'Aplica una corrección a un cierre emitido dentro de la ventana que abrió el código (0154): archiva la versión anterior entera, recalcula el importe y corrige la venta atada. Serie, número, fecha, cliente y estado no se tocan.';
