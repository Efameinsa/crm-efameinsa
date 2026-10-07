-- CORREGIR UN INFORME TAMBIÉN EN SU CUADRO «PARA COTIZAR» (06-10).
--
-- Buzón del almacén, 06-10 («no permite cotización en una modificación»): tras
-- una segunda videollamada coordinada, el almacén corrigió el informe 029-2026
-- para agregar lo que había que cotizar (la rueda tensora) y la corrección no
-- traía el cuadro. Ahora `repuestos` se corrige como el resto, con código y
-- rastro; y si el informe salió de una llamada derivada, su lista de faltantes
-- se rehace para que postventa vea qué cotizar.

create or replace function public.corregir_informe_servicio(p_informe uuid, p_cambios jsonb, p_motivo text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_quien uuid := auth.uid();
  v_per record;
  v_inf jsonb;
  v_autorizo uuid;
  v_antes jsonb := '{}'::jsonb;
  v_despues jsonb := '{}'::jsonb;
  v_campo text;
  v_nuevo jsonb;
  v_version integer;
  -- Lo que se puede corregir: el contenido del informe, no su número, su
  -- cliente ni su vínculo con el pedido.
  v_permitidos text[] := array[
    'asunto', 'tecnico', 'modalidad', 'ejecutado_at', 'hora_inicio', 'hora_fin',
    'hora_informe_inicio', 'hora_informe_fin', 'equipo_texto', 'detalle', 'verificacion',
    'observaciones', 'accesorios', 'pendientes', 'ciclos', 'secciones', 'repuestos',
    'cliente_conforme_nombre', 'cliente_conforme_doc'
  ];
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  select rol::text as rol, es_postventa, hace_postventa, es_operaciones, es_almacen, activo
    into v_per from perfiles where id = v_quien;
  if v_per is null or not v_per.activo then raise exception 'Sesión no válida'; end if;

  select to_jsonb(i) into v_inf from informes_servicio i where i.id = p_informe for update;
  if v_inf is null then raise exception 'El informe no existe'; end if;

  if not (
    coalesce(v_per.es_postventa, false) or coalesce(v_per.hace_postventa, false)
    or v_per.rol in ('gerencia', 'admin', 'operaciones') or coalesce(v_per.es_operaciones, false)
    or (coalesce(v_per.es_almacen, false) and (v_inf->>'elaborado_por')::uuid = v_quien)
  ) then
    raise exception 'Este informe lo corrigen postventa, gerencia, operaciones o quien lo elaboró';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escriba qué se corrige y por qué';
  end if;

  -- El código va antes de tocar nada; si no vale, se anota el intento y se corta.
  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');

  for v_campo in select jsonb_object_keys(coalesce(p_cambios, '{}'::jsonb)) loop
    if not (v_campo = any (v_permitidos)) then continue; end if;
    v_nuevo := p_cambios -> v_campo;
    if jsonb_typeof(v_nuevo) = 'string' and btrim(v_nuevo #>> '{}') = '' then v_nuevo := 'null'::jsonb; end if;
    if (v_inf -> v_campo) is distinct from v_nuevo then
      v_antes := v_antes || jsonb_build_object(v_campo, v_inf -> v_campo);
      v_despues := v_despues || jsonb_build_object(v_campo, v_nuevo);
    end if;
  end loop;
  if v_despues = '{}'::jsonb then raise exception 'No cambió nada'; end if;

  update informes_servicio i set
    asunto = case when v_despues ? 'asunto' then v_despues->>'asunto' else i.asunto end,
    tecnico = case when v_despues ? 'tecnico' then v_despues->>'tecnico' else i.tecnico end,
    modalidad = case when v_despues ? 'modalidad' then v_despues->>'modalidad' else i.modalidad end,
    ejecutado_at = case when v_despues ? 'ejecutado_at' then (v_despues->>'ejecutado_at')::timestamptz else i.ejecutado_at end,
    hora_inicio = case when v_despues ? 'hora_inicio' then (v_despues->>'hora_inicio')::time else i.hora_inicio end,
    hora_fin = case when v_despues ? 'hora_fin' then (v_despues->>'hora_fin')::time else i.hora_fin end,
    hora_informe_inicio = case when v_despues ? 'hora_informe_inicio' then (v_despues->>'hora_informe_inicio')::time else i.hora_informe_inicio end,
    hora_informe_fin = case when v_despues ? 'hora_informe_fin' then (v_despues->>'hora_informe_fin')::time else i.hora_informe_fin end,
    equipo_texto = case when v_despues ? 'equipo_texto' then v_despues->>'equipo_texto' else i.equipo_texto end,
    detalle = case when v_despues ? 'detalle' then v_despues->>'detalle' else i.detalle end,
    verificacion = case when v_despues ? 'verificacion' then v_despues->>'verificacion' else i.verificacion end,
    observaciones = case when v_despues ? 'observaciones' then v_despues->>'observaciones' else i.observaciones end,
    accesorios = case when v_despues ? 'accesorios' then v_despues->>'accesorios' else i.accesorios end,
    pendientes = case when v_despues ? 'pendientes' then v_despues->>'pendientes' else i.pendientes end,
    ciclos = case when v_despues ? 'ciclos' then (v_despues->>'ciclos')::integer else i.ciclos end,
    secciones = case when v_despues ? 'secciones' then v_despues->'secciones' else i.secciones end,
    repuestos = case when v_despues ? 'repuestos' then coalesce(v_despues->'repuestos', '[]'::jsonb) else i.repuestos end,
    cliente_conforme_nombre = case when v_despues ? 'cliente_conforme_nombre' then v_despues->>'cliente_conforme_nombre' else i.cliente_conforme_nombre end,
    cliente_conforme_doc = case when v_despues ? 'cliente_conforme_doc' then v_despues->>'cliente_conforme_doc' else i.cliente_conforme_doc end
  where i.id = p_informe;

  -- La llamada derivada de la que salió: su lista de faltantes es la que mira
  -- postventa para cotizar («2 und · RUEDA TENSORA (IM000000122)»).
  if v_despues ? 'repuestos' and (v_inf->>'apertura_id') is not null then
    update aperturas_llamada a set faltantes = (
      select nullif(string_agg(
        concat_ws(' · ',
          case when r->>'cantidad' is not null then concat(r->>'cantidad', ' ', coalesce(nullif(r->>'unidad', ''), 'und')) end,
          concat(r->>'descripcion', case when coalesce(r->>'codigo', '') <> '' then concat(' (', r->>'codigo', ')') end)
        ), E'\n' order by n), '')
      from jsonb_array_elements(coalesce(v_despues->'repuestos', '[]'::jsonb)) with ordinality as x(r, n)
      where coalesce(btrim(r->>'descripcion'), '') <> ''
    )
    where a.id = (v_inf->>'apertura_id')::uuid;
  end if;

  select coalesce(max(version), 0) + 1 into v_version from informes_servicio_versiones where informe_id = p_informe;
  insert into informes_servicio_versiones (informe_id, version, antes, despues, motivo, cambiado_por, autorizo)
  values (p_informe, v_version, v_antes, v_despues, btrim(p_motivo), v_quien, v_autorizo);

  return jsonb_build_object('version', v_version, 'campos', (select jsonb_agg(k) from jsonb_object_keys(v_despues) k));
end;
$fn$;

revoke all on function public.corregir_informe_servicio(uuid, jsonb, text, text) from public;
grant execute on function public.corregir_informe_servicio(uuid, jsonb, text, text) to authenticated;
