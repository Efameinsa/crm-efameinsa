-- 0441 · Apertura desde el cliente: «ENTREGA DE REPUESTOS POR GARANTÍA».
-- Buzón, Rubí 12-10: «en la apertura que sale desde clientes, se agregue una
-- opción de envío "ENTREGA DE REPUESTOS POR GARANTÍA", que nos dé la opción de
-- agregar los repuestos, que no haya la opción de cobranza porque será
-- trasladado por garantía y que tenga el mismo formato de apertura de pedidos».
--
-- · servicios_postventa.apertura_tipo admite 'entrega_garantia' (encabezado
--   «ENTREGA DE REPUESTOS POR GARANTÍA:»).
-- · apertura_desde_caso recibe p_repuestos (jsonb: [{cantidad, descripcion,
--   sku}]): el pedido nace como REPUESTO (tipo_pedido 'repuesto', recorrido de
--   repuesto: listo y embalado → despacho) y cada unidad es una fila de
--   pedido_equipos, como en los pedidos que vienen de un cierre; la hoja los
--   junta con su CANTIDAD.
-- · Sin cobro: el pedido no tiene monto ni cierre (origen 'caso'), y la guía
--   queda anotada «por garantía, sin cobro» para Contabilidad/Finanzas.

alter table public.servicios_postventa
  drop constraint if exists servicios_postventa_apertura_tipo_check;
alter table public.servicios_postventa
  add constraint servicios_postventa_apertura_tipo_check
  check (apertura_tipo is null or apertura_tipo in ('entrega', 'entrega_puesta_marcha', 'puesta_marcha', 'mantenimiento', 'entrega_garantia'));

comment on column public.servicios_postventa.apertura_tipo is
  'Formato de la apertura de servicio: entrega (va a la agencia), entrega_puesta_marcha (el técnico lo lleva e instala), puesta_marcha (el equipo ya está con el cliente; el técnico va sin equipo, Rubí 05-10), mantenimiento o entrega_garantia (repuestos que salen por garantía, sin cobro; Rubí 12-10, 0441).';

drop function if exists public.apertura_desde_caso(uuid, text, text, date, text, text, text, text, text, text, text, text, text, text, text, text);

create or replace function public.apertura_desde_caso(
  p_atencion uuid,
  p_tipo_pedido text,
  p_apertura_tipo text,
  p_fecha date,
  p_hora text,
  p_tecnico text,
  p_transporte text,
  p_direccion text,
  p_confirmo text,
  p_destino text,
  p_guia text default null,
  p_guia_detalle text default null,
  p_nota text default null,
  p_recibe_nombre text default null,
  p_recibe_telefono text default null,
  p_empresa text default 'EFAMEINSA',
  p_repuestos jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_a atenciones%rowtype;
  v_cliente text;
  v_id uuid;
  v_hora time := nullif(btrim(coalesce(p_hora, '')), '')::time;
  v_garantia boolean := p_apertura_tipo = 'entrega_garantia';
  v_item jsonb;
  v_desc text;
  v_sku text;
  v_cant int;
  v_i int;
  v_n int := 0;
  v_lineas text[] := '{}';
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false)) then
    raise exception 'La apertura de servicio la emite postventa';
  end if;
  if p_tipo_pedido not in ('garantia', 'revision', 'mantenimiento') then raise exception 'El servicio es una garantía, una revisión o un mantenimiento'; end if;
  if p_apertura_tipo not in ('mantenimiento', 'puesta_marcha', 'entrega_garantia') then raise exception 'Ese no es uno de los formatos de apertura de servicio'; end if;
  if p_destino not in ('lima', 'provincia') then raise exception 'Diga si el servicio es en Lima o en provincia'; end if;
  if p_fecha is null then raise exception 'Diga el día del servicio'; end if;
  -- En la entrega de repuestos puede no ir técnico (salen por agencia o los lleva el almacén).
  if not v_garantia and nullif(btrim(coalesce(p_tecnico, '')), '') is null then raise exception 'Diga qué técnico va'; end if;
  if nullif(btrim(coalesce(p_direccion, '')), '') is null then raise exception 'Escriba dónde se hace el servicio, tal como lo confirmó el cliente'; end if;
  if nullif(btrim(coalesce(p_confirmo, '')), '') is null then raise exception 'Diga con quién del cliente confirmó la dirección'; end if;
  if coalesce(p_empresa, 'EFAMEINSA') not in ('EFAMEINSA', 'OPEN') then raise exception 'La apertura sale a nombre de EFAMEINSA o de OPEN'; end if;
  if p_guia is not null and p_guia not in ('traslado', 'materiales', 'repuestos', 'ambas') then raise exception 'Esa no es una de las guías que se pueden pedir'; end if;
  if v_garantia then
    if p_tipo_pedido <> 'garantia' then raise exception 'La entrega de repuestos por garantía va con el servicio «Garantía»'; end if;
    if jsonb_typeof(p_repuestos) <> 'array' or not exists (
      select 1 from jsonb_array_elements(p_repuestos) e where nullif(btrim(coalesce(e->>'descripcion', '')), '') is not null
    ) then
      raise exception 'Agregue los repuestos que se entregan por garantía';
    end if;
  end if;

  select * into v_a from atenciones where id = p_atencion for update;
  if v_a.id is null then raise exception 'Ese caso no existe'; end if;
  if v_a.cuenta_id is null then raise exception 'El caso no está en la ficha de un cliente: únalo a su ficha primero'; end if;
  if v_a.cerrado_at is not null then raise exception 'El caso ya está cerrado'; end if;
  if v_a.servicio_id is not null then raise exception 'Este caso ya tiene su apertura de servicio: ábrala desde su pedido'; end if;

  select coalesce(nullif(btrim(v_a.cliente_texto), ''), coalesce(c.num_doc || ' - ', '') || c.razon_social)
    into v_cliente from cuentas c where c.id = v_a.cuenta_id;

  if v_garantia then
    for v_item in select * from jsonb_array_elements(p_repuestos) loop
      v_desc := upper(nullif(btrim(coalesce(v_item->>'descripcion', '')), ''));
      if v_desc is null then continue; end if;
      v_cant := greatest(1, least(50, coalesce(nullif(v_item->>'cantidad', '')::numeric, 1)::int));
      v_lineas := v_lineas || (v_cant || ' x ' || v_desc);
    end loop;
  end if;

  insert into servicios_postventa (
    cuenta_id, cliente_texto, fecha_confirmacion, ubicacion, equipo, tipo_servicio, observaciones,
    origen, tipo_pedido, modalidad, responsable_id,
    direccion_entrega, direccion_verificada_at, direccion_verificada_con,
    apertura_tipo, apertura_fecha, apertura_hora, tecnico_asignado, transporte, apertura_nota,
    apertura_guia, apertura_guia_detalle, fecha_despacho, despacho_hora,
    apertura_despacho_at, apertura_despacho_por, es_prueba,
    recibe_nombre, recibe_telefono, apertura_empresa
  ) values (
    v_a.cuenta_id, v_cliente, (now() at time zone 'America/Lima')::date, btrim(p_direccion),
    case when v_garantia then 'REPUESTOS POR GARANTÍA: ' || array_to_string(v_lineas, ' · ')
         else coalesce(nullif(btrim(v_a.equipo_texto), ''), 'Servicio técnico') end,
    case when v_garantia then 'GARANTÍA · ENTREGA DE REPUESTOS'
         else case p_tipo_pedido when 'garantia' then 'GARANTÍA' when 'revision' then 'REVISIÓN' else 'MANTENIMIENTO' end end,
    concat_ws(E'\n',
      case when v_garantia then 'Abierto desde un caso de postventa (sin cierre de venta): entrega de repuestos por garantía, sin cobro.'
           else 'Abierto desde un caso de postventa (sin cierre de venta).' end,
      case when v_garantia and nullif(btrim(coalesce(v_a.equipo_texto, '')), '') is not null then 'Equipo en garantía: ' || btrim(v_a.equipo_texto) end,
      nullif(btrim(coalesce(v_a.detalle, '')), '')),
    'caso',
    case when v_garantia then 'repuesto' when p_tipo_pedido = 'mantenimiento' then 'mantenimiento' else 'revision' end,
    p_destino, auth.uid(),
    btrim(p_direccion), now(), btrim(p_confirmo),
    p_apertura_tipo, p_fecha, v_hora, nullif(btrim(coalesce(p_tecnico, '')), ''), nullif(btrim(coalesce(p_transporte, '')), ''), nullif(btrim(coalesce(p_nota, '')), ''),
    p_guia, nullif(btrim(coalesce(p_guia_detalle, '')), ''), p_fecha, v_hora,
    now(), auth.uid(), v_a.es_prueba,
    coalesce(nullif(btrim(coalesce(p_recibe_nombre, '')), ''), btrim(p_confirmo)), nullif(btrim(coalesce(p_recibe_telefono, '')), ''),
    coalesce(p_empresa, 'EFAMEINSA')
  ) returning id into v_id;

  -- Cada unidad es una fila, como en los pedidos que vienen de un cierre (0260).
  if v_garantia then
    for v_item in select * from jsonb_array_elements(p_repuestos) loop
      v_desc := upper(nullif(btrim(coalesce(v_item->>'descripcion', '')), ''));
      if v_desc is null then continue; end if;
      v_sku := nullif(btrim(coalesce(v_item->>'sku', '')), '');
      v_cant := greatest(1, least(50, coalesce(nullif(v_item->>'cantidad', '')::numeric, 1)::int));
      for v_i in 1..v_cant loop
        v_n := v_n + 1;
        insert into pedido_equipos (servicio_id, orden, descripcion, sku, es_prueba)
        values (v_id, v_n, v_desc, v_sku, v_a.es_prueba);
      end loop;
    end loop;
  end if;

  update atenciones set servicio_id = v_id, programada_at = coalesce(programada_at, (p_fecha + coalesce(v_hora, '09:00'::time)) at time zone 'America/Lima'),
         tecnico = coalesce(tecnico, nullif(btrim(coalesce(p_tecnico, '')), '')), updated_at = now()
   where id = p_atencion;
  return v_id;
end $$;

grant execute on function public.apertura_desde_caso(uuid, text, text, date, text, text, text, text, text, text, text, text, text, text, text, text, jsonb) to authenticated;

insert into _migraciones_aplicadas (archivo) values ('0441_apertura_entrega_de_repuestos_por_garantia.sql')
on conflict do nothing;
