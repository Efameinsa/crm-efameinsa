-- LA COTIZACIÓN SALE CON LOS DATOS QUE TIENE LA FICHA (Moisés, 14-10).
--
-- Presu_1156-26 (OPEN, HUARINGA MENDOZA ANITZA EVA): el borrador se creó a
-- las 08:49 con la ficha como la registró Central desde WhatsApp —«Anitza
-- Huaringa Mendoza🥰😍», SIN_DOC—. Un minuto después Moisés corrigió la ficha
-- (nombre completo y RUC 10462629961), gerencia la aprobó y él la confirmó a
-- las 09:31. El PDF salió igual con el nombre del WhatsApp y sin RUC: «se
-- actualizó los datos para su cotización pero no figura al descargar».
--
-- La causa: `cliente_snapshot` se copia UNA vez, al crear el borrador
-- (0012), y nada lo refresca. Congelarlo está bien —lo que el cliente recibió
-- no se mueve solo—, pero el momento de congelarlo es cuando el documento
-- SALE, no cuando se abre el borrador. Y para la que ya salió con la ficha
-- vieja no había salida: ni corrigiendo con código se podía (0123: «el
-- cliente de una cotización no se cambia»).
--
-- Esa regla de 0123 es para que no se cambie de DESTINATARIO. Completar el
-- RUC o limpiar el nombre de la MISMA ficha no es otro destinatario. Acá:
--
--   · snapshot_cliente_actual: los datos del cliente como los arma
--     crear_cotizacion (y cotizar_a_nombre_de si sale a nombre de otra
--     empresa del grupo).
--   · Al confirmarse (sale del borrador), la cotización toma los datos de la
--     ficha de ese momento.
--   · actualizar_cliente_de_cotizacion: para una ya confirmada, quien puede
--     cotizar en el expediente la pone al día con la ficha, sin código. Solo
--     los datos del cliente; precios, equipos y condiciones no se tocan. No
--     corre si ya hay informe de cierre o venta: ahí los documentos ya se
--     armaron con lo que decía.
--   · El candado (bloquear_edicion_cotizacion) deja pasar ese cambio solo si
--     el resultado es exactamente lo que dice la ficha.

create or replace function snapshot_cliente_actual(p_oportunidad uuid, p_facturar_a uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_op        oportunidades%rowtype;
  v_destino   cuentas%rowtype;
  v_direccion text;
begin
  select * into v_op from oportunidades where id = p_oportunidad;
  if v_op.id is null then
    return null;
  end if;
  select * into v_destino from cuentas where id = coalesce(p_facturar_a, v_op.cuenta_id);
  if v_destino.id is null then
    return null;
  end if;

  if v_destino.id = v_op.cuenta_id then
    select coalesce(
      (select c.direccion from contactos c where c.cuenta_id = v_op.cuenta_id and c.es_principal limit 1),
      v_destino.direccion
    ) into v_direccion;
  else
    v_direccion := v_destino.direccion;
  end if;

  return jsonb_build_object(
    'razon_social', v_destino.razon_social,
    'tipo_doc', v_destino.tipo_doc,
    'num_doc', v_destino.num_doc,
    'direccion', v_direccion
  );
end;
$$;

revoke all on function snapshot_cliente_actual(uuid, uuid) from public, anon;
grant execute on function snapshot_cliente_actual(uuid, uuid) to authenticated, service_role;

-- Al salir del borrador, los datos de la ficha de ese momento. Corre antes
-- que trg_cotizaciones_inmutable (orden alfabético), que ahí todavía la ve
-- editable.
create or replace function cliente_de_la_ficha_al_emitir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ficha jsonb;
begin
  if old.estado = 'borrador' and old.enviada_at is null
     and (new.estado <> 'borrador' or new.enviada_at is not null) then
    v_ficha := snapshot_cliente_actual(new.oportunidad_id, new.facturar_a_cuenta_id);
    if v_ficha is not null then
      new.cliente_snapshot := coalesce(new.cliente_snapshot, '{}'::jsonb) || v_ficha;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cotizaciones_cliente_al_emitir on cotizaciones;
create trigger trg_cotizaciones_cliente_al_emitir
  before update on cotizaciones
  for each row execute function cliente_de_la_ficha_al_emitir();

-- El candado de siempre (0123), con una sola puerta nueva.
create or replace function bloquear_edicion_cotizacion()
returns trigger
language plpgsql
as $$
declare
  v_editable   boolean := old.estado = 'borrador' and old.enviada_at is null;
  v_corrigiendo boolean := coalesce(current_setting('app.corrigiendo_cotizacion', true), '') = 'si';
  v_de_ficha   boolean := coalesce(current_setting('app.cliente_de_ficha', true), '') = 'si';
begin
  -- La IDENTIDAD del documento no se mueve NUNCA, y corregir es justamente
  -- para conservarla: si el número pudiera cambiar, todo esto no serviría
  -- para nada.
  if new.serie is distinct from old.serie
     or new.oportunidad_id is distinct from old.oportunidad_id
     or new.creada_por is distinct from old.creada_por
     or new.created_at is distinct from old.created_at
     or (old.correlativo is not null and new.correlativo is distinct from old.correlativo)
     or (old.codigo is not null and new.codigo is distinct from old.codigo)
  then
    raise exception 'La serie, el número y el cliente de una cotización no se cambian.';
  end if;

  -- Poner al día los datos del cliente con su propia ficha (0472): pasa solo
  -- si queda exactamente lo que dice la ficha y no cambia nada más.
  if v_de_ficha and new.cliente_snapshot is distinct from old.cliente_snapshot then
    if new.cliente_snapshot is distinct from
         coalesce(old.cliente_snapshot, '{}'::jsonb) || snapshot_cliente_actual(new.oportunidad_id, new.facturar_a_cuenta_id)
       or new.subtotal is distinct from old.subtotal
       or new.total is distinct from old.total
       or new.moneda is distinct from old.moneda
       or new.condiciones is distinct from old.condiciones
       or new.vigencia_dias is distinct from old.vigencia_dias
       or new.entrega_lugar is distinct from old.entrega_lugar
       or new.facturar_a_cuenta_id is distinct from old.facturar_a_cuenta_id
    then
      raise exception 'Los datos del cliente de la cotización solo se ponen al día con lo que dice su ficha.';
    end if;
    return new;
  end if;

  -- El cliente tampoco, ni corrigiendo: si el destinatario cambió, eso no es
  -- una corrección, es otro documento.
  if v_corrigiendo then
    if new.cliente_snapshot is distinct from old.cliente_snapshot then
      raise exception 'El cliente de una cotización no se cambia, tampoco corrigiéndola.';
    end if;
    return new;
  end if;

  if v_editable then
    return new;
  end if;

  if new.cliente_snapshot is distinct from old.cliente_snapshot
     or new.subtotal is distinct from old.subtotal
     or new.total is distinct from old.total
     or new.moneda is distinct from old.moneda
     or new.condiciones is distinct from old.condiciones
     or new.vigencia_dias is distinct from old.vigencia_dias
     or new.entrega_lugar is distinct from old.entrega_lugar
  then
    raise exception 'Esta cotización ya salió al cliente y no se modifica. Pida una corrección autorizada si el número no se puede cambiar.';
  end if;

  return new;
end;
$$;

create or replace function actualizar_cliente_de_cotizacion(p_cotizacion uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cot    cotizaciones%rowtype;
  v_ficha  jsonb;
  v_nuevo  jsonb;
begin
  select * into v_cot from cotizaciones where id = p_cotizacion;
  if v_cot.id is null then
    raise exception 'La cotización no existe';
  end if;
  if not puede_cotizar_en(v_cot.oportunidad_id) then
    raise exception 'No autorizado para cambiar esta cotización';
  end if;
  if v_cot.anulada_at is not null or v_cot.estado = 'anulada' then
    raise exception 'Esta cotización está anulada';
  end if;
  if exists (select 1 from informes_cierre where cotizacion_id = p_cotizacion)
     or exists (select 1 from ventas where cotizacion_id = p_cotizacion) then
    raise exception 'Esta cotización ya tiene venta o informe de cierre: los datos del cliente ya no se cambian desde acá. Pídalo a operaciones.';
  end if;

  v_ficha := snapshot_cliente_actual(v_cot.oportunidad_id, v_cot.facturar_a_cuenta_id);
  if v_ficha is null then
    raise exception 'No se encontró la ficha del cliente';
  end if;
  v_nuevo := coalesce(v_cot.cliente_snapshot, '{}'::jsonb) || v_ficha;
  if v_nuevo = v_cot.cliente_snapshot then
    return jsonb_build_object('antes', v_cot.cliente_snapshot, 'despues', v_nuevo, 'cambio', false);
  end if;

  perform set_config('app.cliente_de_ficha', 'si', true);
  update cotizaciones set cliente_snapshot = v_nuevo where id = p_cotizacion;
  perform set_config('app.cliente_de_ficha', '', true);

  return jsonb_build_object('antes', v_cot.cliente_snapshot, 'despues', v_nuevo, 'cambio', true);
end;
$$;

revoke all on function actualizar_cliente_de_cotizacion(uuid) from public, anon;
grant execute on function actualizar_cliente_de_cotizacion(uuid) to authenticated;
