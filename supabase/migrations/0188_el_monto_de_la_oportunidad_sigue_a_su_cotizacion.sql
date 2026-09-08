-- El embudo mostraba montos viejos.
--
-- QUÉ PASABA. `crear_cotizacion` guarda `monto_estimado` en la oportunidad
-- cuando nace el borrador —bien—, pero `editar_cotizacion` no lo volvía a
-- tocar. Cada vez que se agrega, cambia o borra una línea, el monto de la
-- cotización se recalcula y el de la oportunidad se queda en el de la primera
-- versión. Medido antes de corregir: de 143 cotizaciones con monto, **74**
-- tenían la oportunidad desfasada. Entre ellas reales y ya ENVIADAS al
-- cliente: INVERSIONES CARIBBEAN cotizó USD 64.999 y el embudo la contaba por
-- USD 46.499 — dieciocho mil dólares mal contados en el pipeline de gerencia.
--
-- Lo reportó el informe de UX del 08-09 desde el otro extremo: «dejé un
-- borrador de US$ 531 y la oportunidad siguió con Monto estimado -».
--
-- LO QUE NO SE CAMBIA, Y POR QUÉ. El informe también pide que crear un
-- borrador mueva la etapa a «Cotizada». Eso NO se hace acá: la función dice
-- expresamente «la ETAPA no se mueve: el borrador no salió al cliente», y es
-- una decisión, no un olvido. «Cotizada» significa que el cliente recibió
-- algo; moverla con un borrador haría que la etapa mienta, y el tablero de
-- gerencia se llenaría de cotizadas que nadie envió. Queda para que lo
-- decida Santos: el problema real que el informe describe —que el tablero no
-- vea nada— lo resuelve el monto, que es lo que sí se corrige.
--
-- Se parcha la definición VIVA con reemplazo verificado. Copiar el cuerpo de
-- estas dos funciones ya revivió reglas revertidas tres veces.

create or replace function public._parche_0188()
returns void language plpgsql as $function$
declare v_def text; v_buscar text; v_poner text; v_veces integer;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'editar_cotizacion';

  if v_def is null then raise exception 'no existe editar_cotizacion'; end if;
  if position('monto_estimado' in v_def) > 0 then
    raise notice 'editar_cotizacion ya estaba parchada';
    return;
  end if;

  v_buscar := '  where id = p_cotizacion_id;' || chr(10) || chr(10) || '  return p_cotizacion_id;';
  v_poner  := '  where id = p_cotizacion_id;' || chr(10) || chr(10)
           || '  -- El monto de la oportunidad sigue al de su cotización (0188): sin'  || chr(10)
           || '  -- esto el embudo de gerencia se quedaba con la primera versión.'     || chr(10)
           || '  update oportunidades set monto_estimado = v_subtotal'                 || chr(10)
           || '   where id = v_cot.oportunidad_id;'                                    || chr(10) || chr(10)
           || '  return p_cotizacion_id;';

  v_veces := (length(v_def) - length(replace(v_def, v_buscar, ''))) / length(v_buscar);
  if v_veces <> 1 then
    raise exception 'el trozo aparece % veces, se esperaba 1', v_veces;
  end if;

  execute replace(v_def, v_buscar, v_poner);
end $function$;

select public._parche_0188();
drop function public._parche_0188();

-- Y se pone al día lo que quedó desfasado. Solo donde la cotización es la
-- única de esa oportunidad: si hay varias, cuál manda es una decisión del
-- comercial y no se adivina desde acá.
update oportunidades o
   set monto_estimado = c.total
  from cotizaciones c
 where c.oportunidad_id = o.id
   and c.total is not null
   and coalesce(o.monto_estimado, -1) <> c.total
   and (select count(*) from cotizaciones c2 where c2.oportunidad_id = o.id) = 1;
