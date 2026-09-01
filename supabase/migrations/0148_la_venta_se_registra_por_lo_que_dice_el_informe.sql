-- ============================================================
-- CRM EFAMEINSA · Migración 0148 · La venta se registra por lo que dice el informe
-- ============================================================
-- INCIDENTE DEL 01-09. Katerine (C5) le dijo a Santos: «acabo de hacer un
-- cierre de 2.250 y me salió 6.000, y en mi informe del día también sale
-- 6.000». Cliente SIERRA TRAVEL S.R.L. - CASA SAMAYKUY. Los hechos:
--
--   26-08 16:38  cotiza Presu_479-26 con DOS lavadoras LG:
--                Giant C Max 2.250 + Titan Max 3.750 = US$ 6.000
--   01-09 16:34  emite el informe de cierre 011-2026 con UNA sola línea:
--                la Giant C Max a 2.250 (2.655 con IGV)
--   01-09 16:38  registra la venta desde la cotización → US$ 6.000
--
-- El cliente compró una de las dos máquinas. El informe de cierre lo dice
-- bien; la venta no, porque `registrar_venta` copiaba el total de la
-- cotización tal cual, y la cotización traía las dos. De ahí salen los 6.000
-- del informe del día, de la agenda y del cierre semanal: todos leen
-- `ventas.monto_total`.
--
-- No es un error de ella: el CRM no tenía manera de cerrar UNA PARTE de una
-- cotización, y nadie le había dicho que primero duplicara la cotización con
-- una sola línea. Emitir el cierre y después registrar la venta es una forma
-- perfectamente razonable de trabajar (ya se dijo en la 0105).
--
-- LA REGLA: cuando hay un informe de cierre emitido para ese cliente, EL
-- INFORME MANDA. Es el documento firmado que va a Central y a facturación;
-- la cotización es lo que se ofreció. Así que:
--
--   1. `registrar_venta` busca el informe emitido, sin venta atada y de la
--      misma semana (la misma regla conservadora de la 0105: un solo
--      candidato o nada). Si lo encuentra, la venta nace con el importe del
--      informe —sin IGV, como siempre se guardó en `ventas`— y queda atada a
--      él en el acto. Si el importe difiere del cotizado, lo deja escrito en
--      `notas`, para que quien mire la venta sepa por qué no coincide con
--      el presupuesto.
--   2. En el orden inverso —venta primero, informe después— el trigger que
--      ya los ataba (0105) además corrige el importe de la venta cuando no
--      coincide, con la misma nota. Antes ataba y callaba, y la venta
--      quedaba con la cifra equivocada para siempre.
--
-- Lo que NO cambia: si no hay informe emitido, la venta sigue naciendo con el
-- total de la cotización, como hasta hoy. Y el informe, una vez emitido, no
-- se toca (0050/0142): acá se lee, nunca se escribe.

-- ── El importe de un informe, sin IGV ─────────────────────────────────
-- `informes_cierre.monto_total` va CON IGV (es lo que se cobra); `ventas`
-- siempre guardó el valor de venta sin IGV, igual que `cotizaciones.total`.
-- Se recalcula desde las líneas, excluyendo el bloque «gratuito», con la
-- misma fórmula que usa la aplicación al emitir.
create or replace function importe_informe_sin_igv(p_items jsonb)
returns numeric language sql immutable as $$
  select coalesce(round(sum((i->>'cantidad')::numeric * (i->>'precio_unitario')::numeric), 2), 0)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
   where coalesce(i->>'bloque', 'venta') <> 'gratuito'
$$;

comment on function importe_informe_sin_igv(jsonb) is
  'Suma de las líneas de un informe de cierre sin IGV y sin el bloque gratuito: el valor de venta que va a la tabla ventas (0148).';

-- ── El informe emitido que corresponde a esta venta, si hay uno solo ──
create or replace function informe_emitido_para_venta(p_cuenta uuid, p_fecha date)
returns informes_cierre language plpgsql stable security definer set search_path = public as $$
declare
  v_informe informes_cierre%rowtype;
  v_n integer;
begin
  select count(*) into v_n
    from informes_cierre i
   where i.cuenta_id = p_cuenta
     and i.emitido_at is not null
     and i.anulado_at is null
     and i.venta_id is null
     and abs(i.fecha - p_fecha) <= 7;
  if v_n <> 1 then
    return null;  -- ninguno, o dos candidatos: no se adivina
  end if;
  select i.* into v_informe
    from informes_cierre i
   where i.cuenta_id = p_cuenta
     and i.emitido_at is not null
     and i.anulado_at is null
     and i.venta_id is null
     and abs(i.fecha - p_fecha) <= 7;
  return v_informe;
end;
$$;

-- ── 1. Registrar la venta ─────────────────────────────────────────────
create or replace function registrar_venta(p_cotizacion_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cotizacion cotizaciones%rowtype;
  v_oportunidad oportunidades%rowtype;
  v_informe informes_cierre%rowtype;
  v_monto numeric;
  v_moneda moneda;
  v_notas text;
  v_venta_id uuid;
begin
  select * into v_cotizacion from cotizaciones where id = p_cotizacion_id;
  if v_cotizacion is null then
    raise exception 'Cotización % no encontrada', p_cotizacion_id;
  end if;
  if v_cotizacion.estado_aprobacion not in ('auto_aprobada', 'aprobada_gerencia') then
    raise exception 'La cotización aún no está aprobada';
  end if;

  select * into v_oportunidad from oportunidades where id = v_cotizacion.oportunidad_id;
  if v_oportunidad.comercial_id <> auth.uid() and not es_backoffice() then
    raise exception 'No autorizado';
  end if;

  -- Lo que se vendió es lo que dice el informe de cierre, si ya se emitió.
  v_monto := v_cotizacion.total;
  v_moneda := v_cotizacion.moneda;
  v_informe := informe_emitido_para_venta(v_oportunidad.cuenta_id, current_date);
  if v_informe.id is not null then
    v_monto := importe_informe_sin_igv(v_informe.items);
    v_moneda := coalesce(v_informe.moneda, v_cotizacion.moneda);
    if v_monto <> v_cotizacion.total or v_moneda <> v_cotizacion.moneda then
      v_notas := format(
        'La cotización %s es por %s %s; la venta se registró por %s %s, que es lo que dice el informe de cierre %s.',
        coalesce(v_cotizacion.codigo, 'sin número'),
        v_cotizacion.moneda, to_char(v_cotizacion.total, 'FM999G999G990D00'),
        v_moneda, to_char(v_monto, 'FM999G999G990D00'),
        coalesce(v_informe.codigo, '(sin código)'));
    end if;
  end if;

  insert into ventas (oportunidad_id, cotizacion_id, serie, monto_total, moneda, registrada_por, notas)
  values (v_oportunidad.id, v_cotizacion.id, v_cotizacion.serie, v_monto, v_moneda, auth.uid(), v_notas)
  returning id into v_venta_id;

  -- Se atan en el acto: el importe y la atadura salen de la misma decisión.
  if v_informe.id is not null then
    update informes_cierre set venta_id = v_venta_id where id = v_informe.id and venta_id is null;
  end if;

  update cotizaciones set estado = 'aceptada' where id = v_cotizacion.id;
  update oportunidades set etapa = 'venta', cerrada_at = now() where id = v_oportunidad.id;

  return v_venta_id;
end;
$$;

comment on function registrar_venta(uuid) is
  'Registra la venta de una cotización aprobada. Si ya hay un informe de cierre emitido para ese cliente, el importe sale del informe y no de la cotización, y la venta queda atada a él (0148).';

-- ── 2. El orden inverso: la venta ya estaba, el informe llega después ──
create or replace function atar_informe_a_venta()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_cuenta uuid;
  v_informe informes_cierre%rowtype;
  v_venta ventas%rowtype;
  v_fecha date;
  v_monto numeric;
  v_cot cotizaciones%rowtype;
begin
  -- Se dispara desde los dos lados; cada uno trae su cuenta y su fecha.
  if tg_table_name = 'ventas' then
    select o.cuenta_id into v_cuenta from oportunidades o where o.id = new.oportunidad_id;
    v_fecha := new.fecha_venta;
  else
    v_cuenta := new.cuenta_id;
    v_fecha := new.fecha;
  end if;
  if v_cuenta is null then return new; end if;

  -- Un solo informe emitido y sin venta atada.
  v_informe := informe_emitido_para_venta(v_cuenta, v_fecha);
  if v_informe.id is null then return new; end if;

  -- Una sola venta del CRM sin informe.
  if (select count(*) from ventas v join oportunidades o on o.id = v.oportunidad_id
       where o.cuenta_id = v_cuenta and v.origen = 'crm' and v.anulada_at is null
         and abs(v.fecha_venta - v_fecha) <= 7
         and not exists (select 1 from informes_cierre x where x.venta_id = v.id)) <> 1 then
    return new;  -- ninguna, o dos candidatas: no se adivina
  end if;
  select v.* into v_venta
    from ventas v
    join oportunidades o on o.id = v.oportunidad_id
   where o.cuenta_id = v_cuenta
     and v.origen = 'crm' and v.anulada_at is null
     and abs(v.fecha_venta - v_fecha) <= 7
     and not exists (select 1 from informes_cierre x where x.venta_id = v.id);

  update informes_cierre set venta_id = v_venta.id where id = v_informe.id;

  -- El informe manda también sobre el importe. Solo cuando llega el informe
  -- (desde `ventas` la venta recién nació con este mismo importe, 0148).
  if tg_table_name = 'informes_cierre' then
    v_monto := importe_informe_sin_igv(v_informe.items);
    if v_monto <> v_venta.monto_total then
      select * into v_cot from cotizaciones where id = v_venta.cotizacion_id;
      update ventas
         set monto_total = v_monto,
             notas = concat_ws(E'\n', notas, format(
               'La cotización %s es por %s %s; la venta se corrigió a %s %s, que es lo que dice el informe de cierre %s.',
               coalesce(v_cot.codigo, 'sin número'),
               v_venta.moneda, to_char(v_venta.monto_total, 'FM999G999G990D00'),
               v_venta.moneda, to_char(v_monto, 'FM999G999G990D00'),
               coalesce(v_informe.codigo, '(sin código)')))
       where id = v_venta.id;
    end if;
  end if;

  return new;
end;
$fn$;

comment on function atar_informe_a_venta is
  'Ata el informe de cierre con su venta sin importar cuál se registró primero (0105). Si el informe llega después y su importe no coincide, corrige la venta y lo anota: el informe manda (0148).';
