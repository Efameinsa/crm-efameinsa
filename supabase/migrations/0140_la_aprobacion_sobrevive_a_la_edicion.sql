-- ============================================================
-- CRM EFAMEINSA · Migración 0140 · La aprobación de gerencia sobrevive a la edición
-- ============================================================
-- Reportado por Ariana (C4) el 01-09 vía Santos: «me pide nuevamente
-- aprobación por el precio cuando ya fue aprobada por gerencia». Rastreado
-- contra producción: era LA MISMA cotización (borrador de RODRIGUEZ ALVAREZ
-- GAVINA, 1× TITAN MAX a 3.750 contra lista de 3.950).
--
--   10:22  Ariana crea el borrador → bajo lista → espera aprobación
--   10:35  Gerencia lo aprueba (misma sesión en que aprobó la de Ancajima)
--   10:54  Ariana edita el borrador (una cláusula, la forma de pago…)
--   10:56  El sistema pide aprobación OTRA VEZ — mismo equipo, mismo precio
--
-- POR QUÉ: editar_cotizacion borra TODOS los ítems y los reinserta
-- (`delete from cotizacion_items` + loop de inserts) sin conservar el campo
-- `aprobado`; y el update final decide `estado_aprobacion` mirando solo si
-- HAY ítems que requieren aprobación, no si ya estaban aprobados. Cualquier
-- edición —aunque no toque ni el equipo ni el precio— tira la aprobación a
-- la basura y vuelve a molestar a gerencia.
--
-- LA REGLA NUEVA: la aprobación se pega al PAR equipo+precio. Al editar,
-- el ítem que quedó con el mismo producto y el mismo precio unitario
-- conserva su `aprobado`; solo lo NUEVO (otro equipo bajo lista, u otro
-- precio) vuelve a pedir. Si todo lo que requiere ya estaba aprobado, la
-- cotización conserva su estado y su firma de aprobación tal cual.
--
-- Santos preguntó además si la aprobación debería valer por un período
-- (mismo día, N días) incluso para cotizaciones NUEVAS del mismo cliente y
-- equipo. Eso relaja un control de precios y es decisión del ing. Carlos:
-- queda como propuesta, NO en esta migración.
--
-- Se parcha la definición VIVA con reemplazos anclados (patrón de la 0074 y
-- la 0091: copiar la función entera es como se revivieron reglas revertidas
-- tres veces). Cada anclaje se exige EXACTAMENTE UNA vez o la migración
-- truena entera, sin aplicarse a medias.

do $$
declare
  v_def    text;
  v_ancla  text;
  v_nuevo  text;
  v_veces  integer;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'editar_cotizacion' limit 1;
  if v_def is null then
    raise exception 'No existe la función editar_cotizacion';
  end if;
  if v_def like '%v_hay_requiere_nuevo%' then
    raise notice '0140: editar_cotizacion ya estaba parchada; no se toca.';
    return;
  end if;

  -- ── 1. Declaraciones nuevas ──────────────────────────────────────────
  v_ancla := 'v_hay_requiere boolean := false;';
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception '0140: el anclaje de declaraciones aparece % veces, no 1', v_veces;
  end if;
  v_def := replace(v_def, v_ancla, v_ancla || '
  v_hay_requiere_nuevo boolean := false;
  v_ya_aprobado    boolean;
  v_aprobados_antes jsonb;');

  -- ── 2. Antes de borrar los ítems, recordar qué pares equipo+precio
  --      ya tenían la bendición de gerencia ─────────────────────────────
  v_ancla := 'delete from cotizacion_items where cotizacion_id = p_cotizacion_id;';
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception '0140: el anclaje del delete aparece % veces, no 1', v_veces;
  end if;
  v_def := replace(v_def, v_ancla,
'-- Lo que gerencia ya aprobó no se le vuelve a preguntar: la aprobación
  -- se pega al par equipo+precio y sobrevive a la edición (01-09, caso
  -- Gavina/Ariana: editar una cláusula la mandaba a pedir permiso de nuevo).
  select coalesce(jsonb_agg(jsonb_build_object(''p'', producto_id, ''u'', precio_unitario)), ''[]''::jsonb)
    into v_aprobados_antes
    from cotizacion_items
   where cotizacion_id = p_cotizacion_id and aprobado is true;

  ' || v_ancla);

  -- ── 3. En el loop: el ítem idéntico conserva su aprobación ───────────
  v_ancla := 'if v_requiere then v_hay_requiere := true; end if;';
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception '0140: el anclaje del loop aparece % veces, no 1', v_veces;
  end if;
  v_def := replace(v_def, v_ancla, v_ancla || '
    v_ya_aprobado := v_requiere and v_producto.id is not null and v_aprobados_antes @> jsonb_build_array(
      jsonb_build_object(''p'', v_producto.id, ''u'', (v_item->>''precio_unitario'')::numeric));
    if v_requiere and not v_ya_aprobado then v_hay_requiere_nuevo := true; end if;');

  v_ancla := 'precio_lista, precio_unitario, bajo_lista, requiere_aprobacion, color';
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception '0140: el anclaje de columnas del insert aparece % veces, no 1', v_veces;
  end if;
  v_def := replace(v_def, v_ancla, v_ancla || ', aprobado');

  v_ancla := 'nullif(btrim(coalesce(v_item->>''color'', '''')), '''')';
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception '0140: el anclaje de valores del insert aparece % veces, no 1', v_veces;
  end if;
  v_def := replace(v_def, v_ancla, v_ancla || ',
      case when v_ya_aprobado then true else null end');

  -- ── 4. El update final decide por lo NUEVO, no por lo ya aprobado ────
  v_ancla := 'estado_aprobacion = (case when coalesce(current_setting(''app.corrigiendo_cotizacion'', true), '''') = ''si'' then estado_aprobacion::text when v_hay_requiere then ''pendiente_gerencia'' else ''auto_aprobada'' end)::estado_aprobacion,
    aprobada_por      = case when v_hay_requiere then null else aprobada_por end,
    aprobada_at       = case when v_hay_requiere then null else aprobada_at end,';
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception '0140: el anclaje del update final aparece % veces, no 1', v_veces;
  end if;
  v_nuevo := 'estado_aprobacion = (case
      when coalesce(current_setting(''app.corrigiendo_cotizacion'', true), '''') = ''si'' then estado_aprobacion::text
      -- hay algo bajo lista que gerencia NO ha visto: a la cola
      when v_hay_requiere_nuevo then ''pendiente_gerencia''
      -- todo lo que requiere ya estaba aprobado: la aprobación se conserva
      when v_hay_requiere then estado_aprobacion::text
      else ''auto_aprobada'' end)::estado_aprobacion,
    aprobada_por      = case when v_hay_requiere_nuevo then null else aprobada_por end,
    aprobada_at       = case when v_hay_requiere_nuevo then null else aprobada_at end,';
  v_def := replace(v_def, v_ancla, v_nuevo);

  execute v_def;
  raise notice '0140 aplicada: editar_cotizacion conserva las aprobaciones de gerencia.';
end $$;

comment on function editar_cotizacion(uuid, jsonb, text, integer) is
  'Reescribe los ítems de un borrador. Desde la 0140, la aprobación de gerencia se pega al par equipo+precio: el ítem que no cambió la conserva y solo lo nuevo bajo lista vuelve a pedir permiso.';
