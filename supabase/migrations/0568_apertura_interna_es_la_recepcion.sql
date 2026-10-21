-- 0568 · La apertura de servicio INTERNA es la recepción del equipo en planta
--
-- Reunión del 20-10-2026 15:45. Gerencia: «la apertura de servicio es una
-- sola… interna o externa, lo primerito». Lesly: «almacén no le interesa si va
-- a pagar el cliente, solamente ejecuta la orden… va a llegar una pestaña
-- interna con trabajos pendientes en planta… almacén tiene que subir el
-- informe».
--
-- Ese mismo día nacieron dos caminos para lo mismo: la orden de recepción
-- REC-n (0557, botón «El equipo viene a planta») y la apertura interna (0566).
-- Desde aquí la apertura interna CREA su REC: el almacén la recibe, la revisa
-- y deja su informe en los pasos de la recepción, y la recepción sabe de qué
-- apertura salió (para mostrar los antecedentes y qué hay que ejecutar).

alter table public.recepciones_equipo
  add column if not exists servicio_id uuid references public.servicios_postventa(id) on delete set null;
create index if not exists ix_recepciones_equipo_servicio on public.recepciones_equipo (servicio_id) where servicio_id is not null;
comment on column public.recepciones_equipo.servicio_id is
  '0568: la apertura de servicio interna de la que salió esta recepción (gerencia y Lesly 20-10).';

drop function if exists public.crear_recepcion_equipo(uuid, text, text, text, text, date, text);
create or replace function public.crear_recepcion_equipo(
  p_atencion uuid, p_equipo text, p_serie text, p_motivo text, p_llega_por text, p_fecha date, p_nota text,
  p_servicio uuid default null)
returns uuid language plpgsql security definer set search_path = public as $function$
declare
  v_a atenciones%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La orden de recepción la da postventa';
  end if;
  select * into v_a from atenciones where id = p_atencion;
  if v_a.id is null then raise exception 'Ese caso no existe'; end if;
  if coalesce(btrim(p_equipo), '') = '' then raise exception 'Diga qué equipo llega'; end if;
  -- Una apertura interna, una recepción: si ya existe, se devuelve esa.
  if p_servicio is not null then
    select r.id into v_id from recepciones_equipo r where r.servicio_id = p_servicio and r.anulada_at is null limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  insert into recepciones_equipo (atencion_id, cuenta_id, equipo_texto, serie, motivo, llega_por, fecha_estimada, nota, es_prueba, servicio_id)
  values (p_atencion, v_a.cuenta_id, btrim(p_equipo), nullif(upper(btrim(coalesce(p_serie, ''))), ''), p_motivo, p_llega_por, p_fecha,
          nullif(btrim(coalesce(p_nota, '')), ''), v_a.es_prueba, p_servicio)
  returning id into v_id;
  return v_id;
end $function$;
grant execute on function public.crear_recepcion_equipo(uuid, text, text, text, text, date, text, uuid) to authenticated;

-- Una segunda apertura en el mismo caso cuando la primera ya salió.
CREATE OR REPLACE FUNCTION public.apertura_desde_caso(p_atencion uuid, p_tipo_pedido text, p_apertura_tipo text, p_fecha date, p_hora text, p_tecnico text, p_transporte text, p_direccion text, p_confirmo text, p_destino text, p_guia text DEFAULT NULL::text, p_guia_detalle text DEFAULT NULL::text, p_nota text DEFAULT NULL::text, p_recibe_nombre text DEFAULT NULL::text, p_recibe_telefono text DEFAULT NULL::text, p_empresa text DEFAULT 'EFAMEINSA'::text, p_repuestos jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_apertura_tipo not in ('mantenimiento', 'puesta_marcha', 'entrega_garantia', 'servicio_tecnico', 'revision_garantia', 'capacitacion') then raise exception 'Ese no es uno de los formatos de apertura de servicio'; end if;
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
  -- 0568 (Lino Espíritu 20-10): el técnico fue, no lo solucionó y el equipo
  -- viene a planta. La primera apertura ya salió; el caso necesita otra (la
  -- interna). Solo se frena si la anterior todavía no salió.
  if v_a.servicio_id is not null and exists (
       select 1 from servicios_postventa sp where sp.id = v_a.servicio_id and sp.despachado_at is null and sp.cerrado_at is null) then
    raise exception 'Este caso ya tiene una apertura de servicio que todavía no sale: ábrala desde su pedido';
  end if;

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
         -- 0457: el encabezado dice lo que hace el técnico (reunión 13-10).
         when p_apertura_tipo = 'revision_garantia' then 'REVISIÓN POR GARANTÍA'
         when p_apertura_tipo = 'servicio_tecnico' then 'SERVICIO TÉCNICO'
         when p_apertura_tipo = 'capacitacion' then 'REFUERZO DE CAPACITACIÓN'
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
end $function$;
