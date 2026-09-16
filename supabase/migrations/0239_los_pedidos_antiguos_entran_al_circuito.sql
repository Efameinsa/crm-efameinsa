-- ============================================================
-- CRM EFAMEINSA · Migración 0239 · Los pedidos antiguos entran al circuito
-- ============================================================
-- Reunión del 15-09 (Carlos, Lesly, Rubí, Gabriela). Choquehuanca (venta del
-- 01-08, pagó el saldo el 14-09), JMZ (variador en importación, venta de
-- junio), Suyón, Bungarena, «20 máquinas en MG por despachar que vienen de
-- enero»: ventas anteriores al circuito que no tienen cierre en el CRM y por
-- eso no aparecen en Pedidos. «¿Dónde continúo mi gestión si no tengo el
-- pedido?» (Rubí). Carlos: «tendríamos que llamarlo a este cliente antiguo y
-- llevarlo a preparación, para empezar la misma secuencia… como una regla
-- decir que ya lo aprobó».
--
-- `traer_pedido_antiguo` abre el pedido desde la ficha del cliente con lo
-- que se sabe —qué se vendió, cuánto, cuándo, con qué documento— ya
-- ejecutado, liquidado y aprobado, porque todo eso pasó antes del CRM, y con
-- el tipo de circuito que le toca (0237). Queda escrito quién lo trajo.
-- ============================================================

create or replace function public.traer_pedido_antiguo(
  p_cuenta uuid,
  p_equipo text,
  p_tipo text,
  p_monto numeric default null,
  p_moneda text default 'USD',
  p_fecha_venta date default null,
  p_referencia text default null,
  p_nota text default null,
  p_entrega_en text default null,
  p_con_instalacion boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien uuid := auth.uid();
  v_cuenta cuentas%rowtype;
  v_id uuid;
  v_nombre text;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if not coalesce(puede_postventa(), false) and not coalesce(es_backoffice(), false) then
    raise exception 'Los pedidos los trae postventa';
  end if;
  if p_tipo not in ('equipo', 'repuesto', 'mantenimiento', 'revision') then
    raise exception 'Diga qué se vendió: equipo, repuesto, mantenimiento o revisión';
  end if;
  if length(btrim(coalesce(p_equipo, ''))) < 3 then
    raise exception 'Diga qué se vendió, aunque sea en una línea: es lo que va a leer el almacén';
  end if;
  select * into v_cuenta from cuentas where id = p_cuenta;
  if v_cuenta.id is null then raise exception 'Ese cliente no existe'; end if;
  select coalesce(nombre, 'postventa') into v_nombre from perfiles where id = v_quien;

  insert into servicios_postventa (
    cuenta_id, cliente_texto, fecha_confirmacion, ubicacion, equipo, tipo_servicio,
    observaciones, monto, moneda, origen, modalidad, tipo_pedido, entrega_en, con_instalacion,
    pedido_ejecutado_at, pedido_ejecutado_por, liquidacion_at, liquidacion_por,
    aprobado_at, aprobado_por, responsable_id, direccion_entrega, es_prueba
  ) values (
    p_cuenta,
    coalesce(v_cuenta.num_doc || ' - ', '') || v_cuenta.razon_social,
    coalesce(p_fecha_venta, (now() at time zone 'America/Lima')::date),
    v_cuenta.direccion,
    btrim(p_equipo),
    case p_tipo when 'equipo' then 'ENTREGA DE EQUIPO' when 'repuesto' then 'REPUESTO' when 'revision' then 'SERVICIO DE REVISIÓN' else 'MANTENIMIENTO' end,
    concat_ws(E'\n',
      format('Pedido anterior al circuito, traído a preparación por %s el %s.', v_nombre, to_char(now() at time zone 'America/Lima', 'DD-MM-YYYY HH24:MI')),
      case when nullif(btrim(coalesce(p_referencia, '')), '') is not null then 'Documento de origen: ' || btrim(p_referencia) else null end,
      nullif(btrim(coalesce(p_nota, '')), '')),
    p_monto,
    coalesce(nullif(p_moneda, ''), 'USD')::moneda,
    'crm',
    case when upper(coalesce(v_cuenta.departamento, '')) in ('LIMA', 'CALLAO', '') then 'lima' else 'provincia' end,
    p_tipo,
    case when p_tipo = 'repuesto' then p_entrega_en else null end,
    case when p_tipo = 'repuesto' then p_con_instalacion else null end,
    now(), v_quien, now(), v_quien,
    now(), v_quien, v_quien,
    v_cuenta.direccion,
    coalesce(es_cuenta_prueba(), false)
  ) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.traer_pedido_antiguo(uuid, text, text, numeric, text, date, text, text, text, boolean) from public;
grant execute on function public.traer_pedido_antiguo(uuid, text, text, numeric, text, date, text, text, text, boolean) to authenticated;
