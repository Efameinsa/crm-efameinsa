-- ============================================================
-- CRM EFAMEINSA · Migración 0162 · Anular un duplicado pasa la venta al informe nuevo
-- ============================================================
-- CASO DEL 02-09. Brenda emitió el cierre de dos clientes con un código de
-- equipo errado (001-2026 Inversiones Nacionales de Turismo, 003-2026 Grupo
-- Alimenticio San José) y volvió a emitirlos bien (005-2026 y 004-2026).
-- Central anuló el 001 con el código de gerencia, como manda la 0113. Y con
-- eso pasaron dos cosas que nadie pidió:
--
--   1. `anular_cierre()` anuló también la venta atada al 001. El 005 había
--      nacido SIN venta —el trigger de la 0105 no lo ató porque la venta ya
--      era del 001—, así que el cliente desapareció del récord de Brenda, del
--      informe del día y del cierre semanal. No se anuló una venta: se anuló
--      un papel, y la venta es la misma.
--   2. La fila de `servicios_postventa` del 001 siguió viva, con su pedido
--      ejecutado y liquidado, al lado de la del 005. Postventa veía dos
--      pedidos del mismo cliente y el tablero de control los contaba doble.
--
-- Se corrigió a mano (scripts/corregir-duplicados-001-003.mjs). Esta
-- migración hace que la anulación lo resuelva sola:
--
--   · Si el mismo cliente tiene OTRO cierre emitido, no anulado y sin venta,
--     de la misma semana, y es uno solo —la regla conservadora de la 0105 y la
--     0148: un candidato o nada—, la venta PASA a ese cierre en lugar de
--     anularse. El importe se corrige a lo que dice el informe heredero
--     (0148) y queda escrito en `notas` por qué.
--   · Si no hay heredero, se anula la venta como hasta hoy.
--   · En los dos casos, las filas de postventa del cierre anulado se cierran
--     con una observación. Cerrar no es borrar: quedan en la ficha del cliente.
--
-- Lo que NO cambia: quién puede anular, el motivo obligatorio, el código del
-- supervisor y que el informe anulado se queda con su número (0113).

create or replace function anular_cierre(p_informe uuid, p_motivo text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien uuid := auth.uid();
  v_rol text;
  v_autorizo uuid;
  v_inf record;
  v_heredero record;
  v_venta ventas%rowtype;
  v_cuenta uuid;
  v_monto numeric;
  v_n integer;
  v_cerrados integer := 0;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  select rol::text into v_rol from perfiles where id = v_quien and activo;
  if v_rol is null or v_rol not in ('central', 'gerencia', 'admin', 'operaciones') then
    raise exception 'Anular un cierre lo hace Central, operaciones o gerencia, no quien lo emitió';
  end if;

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
    end if;
  end if;

  if v_heredero.id is not null then
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
           case when v_heredero.id is not null
                then format('. El pedido sigue en la fila del informe %s', v_heredero.codigo)
                else '' end))
   where informe_cierre_id = p_informe and cerrado_at is null;
  get diagnostics v_cerrados = row_count;

  perform set_config('app.anulando_cierre', '', true);

  return jsonb_build_object(
    'codigo', v_inf.codigo,
    'serie', v_inf.serie,
    'cliente', v_inf.cliente_nombre,
    'venta_anulada', v_inf.venta_id is not null and v_heredero.id is null,
    'venta_movida_a', v_heredero.codigo,
    'pedidos_cerrados', v_cerrados
  );
end;
$$;

comment on function anular_cierre is
  'Anula un cierre emitido con motivo y código de supervisor (0113). Si el mismo cliente tiene un solo cierre nuevo sin venta en la misma semana, la venta pasa a ese cierre en vez de anularse; las filas de postventa del cierre anulado se cierran (0162).';

revoke all on function anular_cierre(uuid, text, text) from public;
grant execute on function anular_cierre(uuid, text, text) to authenticated;
