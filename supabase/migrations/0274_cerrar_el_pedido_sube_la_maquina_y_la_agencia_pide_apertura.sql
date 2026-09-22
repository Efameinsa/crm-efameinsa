-- DOS CANDADOS QUE FALTABAN EN EL CIRCUITO DEL PEDIDO (22-09-2026).
--
-- 1. CERRAR EL PEDIDO NO SUBÍA LA MÁQUINA AL PARQUE.
--    `cerrarPedido` (src/lib/acciones/postventa.ts) hacía un upsert con
--    `onConflict: "serie"` sobre `equipos_instalados`. El único de la serie es
--    por EXPRESIÓN (`ux_equipos_serie`: upper(btrim(serie))), así que Postgres
--    respondía «there is no unique or exclusion constraint matching the ON
--    CONFLICT specification» —el mismo error que corrigieron la 0255 y la
--    0268 en las funciones de la base—, el error no se revisaba y la pantalla
--    decía «El equipo ya está en el parque instalado». Medido en producción el
--    22-09: los 4 pedidos cerrados en septiembre tenían 0 máquinas en el
--    parque, o sea sin garantía ni mantenimiento programado. Carlos, 01-09:
--    «Tan pronto está despachado, con la guía de remisión, ya comenzó a correr
--    mi garantía».
--    Ahora el alta va por esta función, con el `on conflict` sobre la
--    expresión del índice, y la acción corta si falla en vez de cerrar igual.
--
-- 2. LA ENTREGA EN AGENCIA NO PEDÍA LA APERTURA.
--    `almacen_registrar_salida` ya exigía la apertura de despacho («Sin
--    apertura de despacho no sale nada del almacén»), pero
--    `almacen_registrar_agencia` no, y además marca el pedido como despachado.
--    Desde la pantalla no se llegaba (la tarjeta de agencia aparece después de
--    la salida), pero la base lo aceptaba: probado el 22-09 con la cuenta del
--    almacén sobre un pedido real, dentro de una transacción deshecha. Carlos,
--    22-09: «no debería permitirte despachar… si es que no ha cumplido los
--    otros pasos». Se parcha la definición viva con la misma condición que la
--    salida: los pedidos que nacieron del cierre en el CRM la necesitan; los
--    del Excel (sin informe de cierre) no.

create or replace function subir_maquina_al_parque(
  p_servicio uuid,
  p_serie text,
  p_garantia_meses integer default 24,
  p_meses_mantenimiento integer default 6
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_s     record;
  v_serie text;
  v_base  date;
  v_eq    uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Solo postventa cierra el pedido y sube la máquina al parque';
  end if;

  v_serie := upper(btrim(coalesce(p_serie, '')));
  if v_serie = '' then raise exception 'Escriba la serie como se lee en la placa'; end if;

  select * into v_s from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;

  v_base := coalesce((v_s.despachado_at at time zone 'America/Lima')::date, v_s.fecha_despacho, v_s.puesta_en_marcha, v_s.fecha_confirmacion);

  insert into equipos_instalados (serie, cuenta_id, cliente_texto, modelo_texto, servicio_id, informe_cierre_id,
    fecha_venta, fecha_despacho, guia_remision, fecha_puesta_marcha, garantia_meses, proximo_mantenimiento, ubicacion,
    registrado_por, registrado_en, es_prueba)
  values (v_serie, v_s.cuenta_id, v_s.cliente_texto, v_s.equipo, v_s.id, v_s.informe_cierre_id,
    v_s.fecha_confirmacion, v_base, v_s.guia, v_s.puesta_en_marcha, coalesce(p_garantia_meses, 24),
    case when v_base is null then null
         else (v_base + make_interval(months => coalesce(p_meses_mantenimiento, 6)))::date end,
    v_s.ubicacion, auth.uid(), 'pedido', v_s.es_prueba)
  on conflict ((upper(btrim(serie)))) do update
    -- La máquina puede existir ya (la registró el almacén o Central en
    -- «Equipos del pedido»): se completa lo que le falte y el cierre fija la
    -- garantía y el próximo mantenimiento, que es lo que este paso decide.
    set servicio_id = coalesce(equipos_instalados.servicio_id, excluded.servicio_id),
        cuenta_id = coalesce(equipos_instalados.cuenta_id, excluded.cuenta_id),
        cliente_texto = coalesce(equipos_instalados.cliente_texto, excluded.cliente_texto),
        modelo_texto = coalesce(equipos_instalados.modelo_texto, excluded.modelo_texto),
        informe_cierre_id = coalesce(equipos_instalados.informe_cierre_id, excluded.informe_cierre_id),
        fecha_venta = coalesce(equipos_instalados.fecha_venta, excluded.fecha_venta),
        fecha_despacho = coalesce(equipos_instalados.fecha_despacho, excluded.fecha_despacho),
        guia_remision = coalesce(equipos_instalados.guia_remision, excluded.guia_remision),
        fecha_puesta_marcha = coalesce(excluded.fecha_puesta_marcha, equipos_instalados.fecha_puesta_marcha),
        garantia_meses = excluded.garantia_meses,
        proximo_mantenimiento = coalesce(excluded.proximo_mantenimiento, equipos_instalados.proximo_mantenimiento),
        ubicacion = coalesce(equipos_instalados.ubicacion, excluded.ubicacion)
  returning id into v_eq;

  -- Si la unidad está en la lista del pedido sin serie todavía, queda atada.
  update pedido_equipos set serie = v_serie, equipo_id = v_eq
   where id = (select id from pedido_equipos
                where servicio_id = v_s.id and (equipo_id = v_eq or coalesce(btrim(serie), '') = '')
                order by (equipo_id = v_eq) desc nulls last, id
                limit 1)
     and (equipo_id is null or equipo_id = v_eq);

  return v_eq;
end;
$function$;

revoke all on function subir_maquina_al_parque(uuid, text, integer, integer) from public;
grant execute on function subir_maquina_al_parque(uuid, text, integer, integer) to authenticated;

CREATE OR REPLACE FUNCTION public.almacen_registrar_agencia(p_servicio uuid, p_transportista text, p_guia text, p_fotos jsonb, p_recibe text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s record;
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La entrega en la agencia la registra el almacén';
  end if;
  if nullif(btrim(coalesce(p_guia, '')), '') is null then
    raise exception 'Falta el número de la guía de remisión: es lo que el cliente necesita para recoger';
  end if;
  select id, informe_cierre_id, apertura_despacho_at into v_s
    from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  -- Sin apertura no sale nada del almacén (0274): la misma condición que la salida.
  if v_s.informe_cierre_id is not null and v_s.apertura_despacho_at is null then
    raise exception 'Sin apertura de despacho no sale nada del almacén: pídasela a postventa';
  end if;
  update servicios_postventa
     set agencia_at = coalesce(agencia_at, now()),
         agencia_por = coalesce(agencia_por, auth.uid()),
         transportista = coalesce(nullif(btrim(coalesce(p_transportista, '')), ''), transportista),
         guia = btrim(p_guia),
         recibe_nombre = coalesce(nullif(btrim(coalesce(p_recibe, '')), ''), recibe_nombre),
         agencia_fotos = coalesce(agencia_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb),
         despachado_at = coalesce(despachado_at, now()),
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $function$;
