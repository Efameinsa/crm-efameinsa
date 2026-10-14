-- 0490 — QUIEN EMITIÓ UN CIERRE LO PUEDE ANULAR, SOLO CON EL PIN DE ADMIN, GERENCIA O LESLY
--
-- Santos, 14-10: «cuando alguien quiera anular un cierre, que se pueda solo
-- con PIN de admin, gerencia o Lesly», para que Ariana anule el suyo. Hasta hoy
-- solo Central, operaciones, gerencia o admin podían anular (0113: «no quien lo
-- emitió»), y el comercial solo podía PEDIR la anulación. El código no cambia:
-- validar_codigo_autorizacion(…, 'operaciones') acepta los PIN de admin,
-- gerencia y operaciones (Lesly), y se quema al usarse.

CREATE OR REPLACE FUNCTION public.anular_cierre(p_informe uuid, p_motivo text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quien uuid := auth.uid();
  v_rol text;
  v_autorizo uuid;
  v_inf record;
  v_heredero record;
  -- Un `record` sin asignar no es nulo: preguntarle un campo revienta.
  -- Por eso el «¿hay heredero?» vive en su propia variable (0172).
  v_hay_heredero boolean := false;
  v_heredero_codigo text;
  v_venta ventas%rowtype;
  v_cuenta uuid;
  v_monto numeric;
  v_n integer;
  v_cerrados integer := 0;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  select rol::text into v_rol from perfiles where id = v_quien and activo;
  if v_rol is null then raise exception 'Sesión no válida'; end if;

  if length(coalesce(btrim(p_motivo), '')) < 10 then
    raise exception 'Escriba por qué se anula: queda en el registro del informe';
  end if;

  select * into v_inf from informes_cierre where id = p_informe;
  if not found then raise exception 'Ese cierre no existe'; end if;
  if v_inf.emitido_at is null then
    raise exception 'Ese cierre todavía es un borrador del comercial: no hay nada que anular';
  end if;
  if v_inf.anulado_at is not null then
    raise exception 'El cierre % ya estaba anulado', v_inf.codigo;
  end if;

  if v_inf.es_prueba is distinct from es_cuenta_prueba() then
    raise exception 'Ese cierre no es de esta cuenta';
  end if;

  -- 0490 (Santos, 14-10): quien emitió el cierre también lo anula, pero solo
  -- con el código de admin, gerencia o Lesly (el de abajo): el código es la
  -- autorización. Los demás, como hasta hoy: Central, operaciones o gerencia.
  if not (v_rol in ('central', 'gerencia', 'admin', 'operaciones') or v_inf.creado_por = v_quien) then
    raise exception 'Este cierre lo anula quien lo emitió, Central, operaciones o gerencia, siempre con el código de admin, gerencia o Lesly';
  end if;

  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');

  perform set_config('app.anulando_cierre', 'si', true);

  update informes_cierre
     set anulado_at = now(), anulado_por = v_quien,
         anulado_autorizo = v_autorizo, anulado_motivo = btrim(p_motivo)
   where id = p_informe;

  -- ── ¿Hay un cierre nuevo del mismo cliente esperando esta venta? ──────
  if v_inf.venta_id is not null then
    select count(*) into v_n
      from informes_cierre h
     where h.cuenta_id = v_inf.cuenta_id
       and h.id <> v_inf.id
       and h.emitido_at is not null
       and h.anulado_at is null
       and h.venta_id is null
       and h.es_prueba is not distinct from v_inf.es_prueba
       and abs(h.fecha - v_inf.fecha) <= 7;
    if v_n = 1 then
      select h.* into v_heredero
        from informes_cierre h
       where h.cuenta_id = v_inf.cuenta_id
         and h.id <> v_inf.id
         and h.emitido_at is not null
         and h.anulado_at is null
         and h.venta_id is null
         and h.es_prueba is not distinct from v_inf.es_prueba
         and abs(h.fecha - v_inf.fecha) <= 7;
      v_hay_heredero := found;
      if found then v_heredero_codigo := v_heredero.codigo; end if;
    end if;
  end if;

  if v_hay_heredero then
    -- La venta es la misma: cambia de papel, no de cliente ni de comercial.
    select * into v_venta from ventas where id = v_inf.venta_id;

    update informes_cierre set venta_id = null where id = v_inf.id;
    update informes_cierre
       set venta_id = v_venta.id,
           oportunidad_id = coalesce(oportunidad_id, v_inf.oportunidad_id, v_venta.oportunidad_id)
     where id = v_heredero.id;

    v_monto := importe_informe_sin_igv(v_heredero.items);
    update ventas
       set monto_total = case when v_monto > 0 then v_monto else monto_total end,
           notas = concat_ws(E'\n', notas, format(
             'El informe de cierre %s se anuló el %s (%s); la venta pasó al informe %s%s.',
             v_inf.codigo, to_char(now() at time zone 'America/Lima', 'DD-MM-YYYY HH24:MI'),
             btrim(p_motivo), v_heredero.codigo,
             case when v_monto > 0 and v_monto <> v_venta.monto_total
                  then format(' y el importe se corrigió de %s %s a %s %s, que es lo que dice ese informe',
                              v_venta.moneda, to_char(v_venta.monto_total, 'FM999G999G990D00'),
                              v_venta.moneda, to_char(v_monto, 'FM999G999G990D00'))
                  else '' end))
     where id = v_venta.id;
  elsif v_inf.venta_id is not null then
    update ventas
       set anulada_at = now(), anulada_motivo = btrim(p_motivo)
     where id = v_inf.venta_id;

    select o.cuenta_id into v_cuenta
      from ventas v join oportunidades o on o.id = v.oportunidad_id
     where v.id = v_inf.venta_id;
    if v_cuenta is not null then
      update cuentas c
         set ultima_venta_at = (
           select max(v.fecha_venta)
             from ventas v join oportunidades o on o.id = v.oportunidad_id
            where o.cuenta_id = c.id and v.anulada_at is null)
       where c.id = v_cuenta;
    end if;
  end if;

  -- ── El pedido del cierre anulado no es trabajo de postventa ───────────
  update servicios_postventa
     set cerrado_at = now(), completado = true,
         observaciones = concat_ws(E'\n', observaciones, format(
           'Cerrado el %s: el informe de cierre %s se anuló (%s)%s.',
           to_char(now() at time zone 'America/Lima', 'DD-MM-YYYY HH24:MI'),
           v_inf.codigo, btrim(p_motivo),
           case when v_hay_heredero
                then format('. El pedido sigue en la fila del informe %s', v_heredero_codigo)
                else '' end))
   where informe_cierre_id = p_informe and cerrado_at is null;
  get diagnostics v_cerrados = row_count;

  perform set_config('app.anulando_cierre', '', true);

  -- El comercial se entera al toque, con el motivo (0237, caso Bungarena).
  if v_inf.creado_por is not null and v_inf.creado_por <> v_quien then
    perform crear_notificacion(
      v_inf.creado_por, null, 'cierre_anulado',
      format('Central anuló su cierre N.º %s · %s', v_inf.codigo, v_inf.cliente_nombre),
      format('Motivo: %s. Si la venta sigue en pie, emita un cierre nuevo; el correlativo sigue de largo.', btrim(p_motivo)),
      '/comercial/cierres/' || p_informe::text);
  end if;

  return jsonb_build_object(
    'codigo', v_inf.codigo,
    'serie', v_inf.serie,
    'cliente', v_inf.cliente_nombre,
    'venta_anulada', v_inf.venta_id is not null and not v_hay_heredero,
    'venta_movida_a', v_heredero_codigo,
    'pedidos_cerrados', v_cerrados
  );
end;
$function$;

insert into _migraciones_aplicadas (archivo) values ('0490_anular_cierre_quien_lo_emitio_con_pin.sql')
on conflict do nothing;
