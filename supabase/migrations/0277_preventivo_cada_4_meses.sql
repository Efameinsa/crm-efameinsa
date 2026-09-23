-- EL PREVENTIVO DE LAS MÁQUINAS NUEVAS VA CADA 4 MESES, NO CADA 6 (23-09-2026).
--
-- Decisión de gerencia del 23-09: «Cada 3 meses se debe alertar para empezar
-- el proceso de envío de propuestas y concluir cierres antes de los 4 meses».
-- Santos, el mismo día: aplica SOLO a las máquinas nuevas; las 548 que ya
-- están en el parque NO se recalculan (esta migración no toca ninguna fila).
--
-- Qué cambia: el primer `proximo_mantenimiento` que se calcula al subir una
-- máquina al parque pasa de base + 6 meses a base + 4 meses, en las tres
-- funciones vivas que lo calculan (volcadas con scripts/_fn.mjs el 23-09 y
-- parchadas SOLO en esa línea):
--   · registrar_series_del_pedido (0253/0255): interval '6 months' → '4 months'
--   · registrar_serie_del_equipo  (0260/0268): interval '6 months' → '4 months'
--   · subir_maquina_al_parque     (0274): default de p_meses_mantenimiento y
--     su coalesce, 6 → 4 (cerrarPedido en src/lib/acciones/postventa.ts
--     también manda 4).
--
-- La alerta «a los 3 meses» = 1 mes antes de ese vencimiento: la ventana de
-- «Preventivos por ofrecer» pasa de 15 a 30 días (agenda, reporte diario y
-- macro de postventa; eso es pantalla, no base).
--
-- Idempotente: son `create or replace` de la definición viva; los permisos
-- (grants) se conservan. Los `on conflict` siguen sobre la expresión del
-- índice único, upper(btrim(serie)).

CREATE OR REPLACE FUNCTION public.registrar_series_del_pedido(p_servicio uuid, p_series text[], p_garantia_meses integer DEFAULT 24)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s record;
  v_serie text;
  v_base date;
  v_n int := 0;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false)) then
    raise exception 'Solo postventa o el almacén registran las series';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  v_base := coalesce((v_s.despachado_at at time zone 'America/Lima')::date, v_s.fecha_despacho, v_s.puesta_en_marcha, v_s.fecha_confirmacion);

  foreach v_serie in array p_series loop
    v_serie := upper(btrim(coalesce(v_serie, '')));
    if v_serie = '' then continue; end if;
    insert into equipos_instalados (serie, cuenta_id, cliente_texto, modelo_texto, servicio_id, informe_cierre_id,
      fecha_venta, fecha_despacho, guia_remision, fecha_puesta_marcha, garantia_meses, proximo_mantenimiento, ubicacion,
      registrado_por, registrado_en)
    values (v_serie, v_s.cuenta_id, v_s.cliente_texto, v_s.equipo, v_s.id, v_s.informe_cierre_id,
      v_s.fecha_confirmacion, v_base, v_s.guia, v_s.puesta_en_marcha, coalesce(p_garantia_meses, 24),
      case when v_base is null then null else (v_base + interval '4 months')::date end, v_s.ubicacion,
      auth.uid(), 'pedido')
    on conflict (upper(btrim(serie))) do update
      set servicio_id = coalesce(equipos_instalados.servicio_id, excluded.servicio_id),
          cuenta_id = coalesce(equipos_instalados.cuenta_id, excluded.cuenta_id),
          guia_remision = coalesce(equipos_instalados.guia_remision, excluded.guia_remision),
          fecha_despacho = coalesce(equipos_instalados.fecha_despacho, excluded.fecha_despacho);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_serie_del_equipo(p_item uuid, p_serie text, p_garantia_meses integer DEFAULT 24)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_it    record;
  v_s     record;
  v_serie text;
  v_base  date;
  v_eq    uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_almacen(), false) or rol_actual() = 'central') then
    raise exception 'Solo postventa o el almacén registran las series';
  end if;
  select * into v_it from pedido_equipos where id = p_item;
  if v_it.id is null then raise exception 'Ese equipo no está en el pedido'; end if;
  v_serie := upper(btrim(coalesce(p_serie, '')));
  if v_serie = '' then raise exception 'Escriba la serie como se lee en la placa'; end if;
  select * into v_s from servicios_postventa where id = v_it.servicio_id;
  v_base := coalesce((v_s.despachado_at at time zone 'America/Lima')::date, v_s.fecha_despacho, v_s.puesta_en_marcha, v_s.fecha_confirmacion);

  insert into equipos_instalados (serie, cuenta_id, cliente_texto, modelo_texto, servicio_id, informe_cierre_id,
    fecha_venta, fecha_despacho, guia_remision, fecha_puesta_marcha, garantia_meses, proximo_mantenimiento, ubicacion,
    registrado_por, registrado_en, es_prueba)
  values (v_serie, v_s.cuenta_id, v_s.cliente_texto, v_it.descripcion, v_s.id, v_s.informe_cierre_id,
    v_s.fecha_confirmacion, v_base, v_s.guia, v_s.puesta_en_marcha, coalesce(p_garantia_meses, 24),
    case when v_base is null then null else (v_base + interval '4 months')::date end, v_s.ubicacion,
    auth.uid(), 'pedido', v_s.es_prueba)
  on conflict ((upper(btrim(serie)))) do update
    set servicio_id = coalesce(equipos_instalados.servicio_id, excluded.servicio_id),
        cuenta_id = coalesce(equipos_instalados.cuenta_id, excluded.cuenta_id),
        modelo_texto = coalesce(equipos_instalados.modelo_texto, excluded.modelo_texto),
        guia_remision = coalesce(equipos_instalados.guia_remision, excluded.guia_remision),
        fecha_despacho = coalesce(equipos_instalados.fecha_despacho, excluded.fecha_despacho)
  returning id into v_eq;

  update pedido_equipos set serie = v_serie, equipo_id = v_eq where id = p_item;
  return v_eq;
end;
$function$;

CREATE OR REPLACE FUNCTION public.subir_maquina_al_parque(p_servicio uuid, p_serie text, p_garantia_meses integer DEFAULT 24, p_meses_mantenimiento integer DEFAULT 4)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         else (v_base + make_interval(months => coalesce(p_meses_mantenimiento, 4)))::date end,
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

