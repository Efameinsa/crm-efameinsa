-- 0297 · OBSERVACIONES DE SANTOS DEL 24-09 (almacén, aperturas y salida)
--
--  1. «El almacén tenía la opción de subir fotos para que salga la máquina,
--     pero no debería poder hasta que alguien autorice la salida cuando aún
--     hay un saldo pendiente.» La salida del almacén se traba con saldo; se
--     libera con el código de gerencia u operaciones y el motivo.
--  2. «La señorita de postventa es la que debería poner el técnico.» El
--     técnico lo pone postventa al mandar la apertura (y lo puede cambiar);
--     el almacén ya no lo escribe.
--  3. La apertura sigue el FORMATO DE LLAMADA de siempre (fecha de compra,
--     entrega y guía, contacto, problema, mantenimiento, protocolo, garantía,
--     provincia, puesta en marcha, cambios correctivos, programación).
--  4. El informe del almacén es el INFORME DE SOPORTE TÉCNICO numerado, con
--     secciones que se pueden editar y Word/PDF adjuntos «porque a veces es
--     extenso».
--  5. Por máquina: varias fotos y varios PDF o Word, y se pueden sumar después.

-- ── 1 · La salida con saldo se autoriza ───────────────────────────────────
alter table public.servicios_postventa
  add column if not exists salida_autorizada_at     timestamptz,
  add column if not exists salida_autorizada_por    uuid references public.perfiles (id) on delete set null,
  add column if not exists salida_autorizada_motivo text;
comment on column public.servicios_postventa.salida_autorizada_at is 'Quién autorizó con código que la máquina salga del almacén con saldo pendiente (0297).';

-- ¿Lo pagado cubre lo acordado antes del despacho? Misma regla que
-- evaluarPagoParaDespacho (lib/postventa.ts): sin cifras (Excel) no se traba.
create or replace function public.pago_cubre_el_despacho(p_servicio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when s.informe_cierre_id is null and s.pago_confirmado_at is null and coalesce(s.monto_pagado, 0) = 0 then true
    when coalesce(s.monto, 0) <= 0 then true
    else coalesce(s.monto_pagado, 0) + 0.5 >= round(s.monto * coalesce(least(greatest(s.pct_antes_despacho, 0), 100), 100) / 100, 2)
  end
  from servicios_postventa s where s.id = p_servicio
$$;

create or replace function public.autorizar_salida_con_saldo(p_servicio uuid, p_pin text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autorizo uuid;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Diga por qué sale con saldo pendiente'; end if;
  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');
  update servicios_postventa
     set salida_autorizada_at = now(), salida_autorizada_por = v_autorizo, salida_autorizada_motivo = btrim(p_motivo), updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;

create or replace function public.almacen_registrar_salida(p_servicio uuid, p_fecha date, p_fotos jsonb, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s servicios_postventa%rowtype;
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La salida la registra el almacén';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  -- Sin apertura no sale nada del almacén (Carlos, 09-09); los pedidos
  -- anteriores al circuito, sin cierre en el CRM, siguen como estaban.
  if v_s.informe_cierre_id is not null and v_s.apertura_despacho_at is null then
    raise exception 'Sin apertura de despacho no sale nada del almacén: pídasela a postventa';
  end if;
  -- Con saldo pendiente no sale sin autorización (0297). Si postventa ya
  -- registró la salida con autorización, esto solo suma las fotos.
  if v_s.despachado_at is null and v_s.despacho_autorizado_por is null and v_s.salida_autorizada_at is null
     and not coalesce(pago_cubre_el_despacho(p_servicio), true) then
    raise exception 'Este pedido tiene saldo pendiente: no sale hasta que gerencia u operaciones autorice la salida con su código';
  end if;
  if jsonb_array_length(coalesce(p_fotos, '[]'::jsonb)) < 3 then
    raise exception 'La salida se registra con las fotos de la máquina (mínimo 3: frente, lateral y posterior)';
  end if;
  update servicios_postventa
     set despachado_at = coalesce(despachado_at, (coalesce(p_fecha, (now() at time zone 'America/Lima')::date))::timestamptz + interval '12 hours'),
         fecha_despacho = coalesce(fecha_despacho, p_fecha),
         salida_fotos = coalesce(salida_fotos, '[]'::jsonb) || p_fotos,
         salida_nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), salida_nota),
         updated_at = now()
   where id = p_servicio;
end $$;

-- ── 2 y 3 · La apertura: formato de llamada y técnico de postventa ────────
alter table public.aperturas_llamada
  add column if not exists formato jsonb not null default '{}'::jsonb,
  add column if not exists informe_servicio_id uuid references public.informes_servicio (id) on delete set null;
comment on column public.aperturas_llamada.formato is
  'El FORMATO DE LLAMADA (0297): fecha_compra, entrega_guia, contacto, problema, marca, modelo, serie, fecha_mantenimiento, protocolo, garantia, provincia, puesta_en_marcha, cambios_correctivos.';

drop function if exists public.enviar_apertura_llamada(uuid, text, timestamptz, text, text, text, uuid, uuid, text);
create or replace function public.enviar_apertura_llamada(
  p_cuenta uuid,
  p_tipo text,
  p_programada timestamptz,
  p_equipos text,
  p_indicaciones text default null,
  p_contacto text default null,
  p_servicio uuid default null,
  p_atencion uuid default null,
  p_pin_urgente text default null,
  p_tecnico text default null,
  p_formato jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_autorizo uuid;
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La apertura de llamada la envía postventa';
  end if;
  if p_programada is null then raise exception 'Falta el día y la hora'; end if;
  if nullif(btrim(coalesce(p_equipos, '')), '') is null then raise exception 'Diga qué equipos se revisan'; end if;
  if p_servicio is not null and not exists (select 1 from servicios_postventa where id = p_servicio and cuenta_id = p_cuenta) then
    raise exception 'Ese pedido no es de este cliente';
  end if;
  if p_pin_urgente is not null then
    if p_servicio is not null then raise exception 'La apertura urgente es para lo que todavía no tiene pedido'; end if;
    v_autorizo := validar_codigo_autorizacion(p_pin_urgente, 'gerencia');
  end if;
  insert into aperturas_llamada (cuenta_id, servicio_id, atencion_id, tipo, programada_para, equipos, indicaciones, contacto,
                                 solicitada_por, es_prueba, urgente, urgente_autorizo, tecnico, formato)
  values (p_cuenta, p_servicio, p_atencion, p_tipo, p_programada, btrim(p_equipos),
          nullif(btrim(coalesce(p_indicaciones, '')), ''), nullif(btrim(coalesce(p_contacto, '')), ''),
          auth.uid(), coalesce(es_cuenta_prueba(), false), v_autorizo is not null, v_autorizo,
          nullif(btrim(coalesce(p_tecnico, '')), ''), coalesce(p_formato, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

-- Postventa pone o cambia el técnico.
create or replace function public.postventa_tecnico_de_apertura(p_id uuid, p_tecnico text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'El técnico lo asigna postventa';
  end if;
  if nullif(btrim(coalesce(p_tecnico, '')), '') is null then raise exception 'Escriba el nombre del técnico'; end if;
  update aperturas_llamada set tecnico = btrim(p_tecnico)
   where id = p_id and anulada_at is null and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Esa apertura no existe o está anulada'; end if;
end $$;

-- El almacén toma la apertura sin tocar el técnico.
create or replace function public.almacen_tomar_apertura(p_id uuid, p_tecnico text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La toma el almacén';
  end if;
  update aperturas_llamada
     set tomada_at = coalesce(tomada_at, now()),
         tomada_por = coalesce(tomada_por, auth.uid())
   where id = p_id and anulada_at is null and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Esa apertura no existe o está anulada'; end if;
end $$;

-- ── 4 · El informe de soporte técnico, con secciones y documentos ─────────
alter table public.informes_servicio
  add column if not exists secciones          jsonb not null default '[]'::jsonb,
  add column if not exists documentos         jsonb not null default '[]'::jsonb,
  add column if not exists hora_informe_inicio time,
  add column if not exists hora_informe_fin    time,
  add column if not exists apertura_id         uuid references public.aperturas_llamada (id) on delete set null;
comment on column public.informes_servicio.secciones is 'Secciones editables del informe (0297): [{titulo, texto}]; cada línea del texto sale como viñeta.';
comment on column public.informes_servicio.documentos is 'Word o PDF adjuntos al informe (0297): [{path, nombre, tipo, tamano}].';

-- El informe del almacén se liga a la apertura; el técnico no se toca.
drop function if exists public.almacen_informe_apertura(uuid, text, text, jsonb, text);
create or replace function public.almacen_informe_apertura(
  p_id uuid,
  p_informe text,
  p_faltantes text default null,
  p_fotos jsonb default '[]'::jsonb,
  p_tecnico text default null,
  p_informe_servicio uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'El informe de la llamada lo sube el almacén';
  end if;
  if nullif(btrim(coalesce(p_informe, '')), '') is null then raise exception 'Escriba qué se vio en la llamada'; end if;
  update aperturas_llamada
     set informe_almacen = btrim(p_informe),
         faltantes = nullif(btrim(coalesce(p_faltantes, '')), ''),
         informe_fotos = coalesce(informe_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb),
         informe_servicio_id = coalesce(p_informe_servicio, informe_servicio_id),
         tomada_at = coalesce(tomada_at, now()),
         tomada_por = coalesce(tomada_por, auth.uid()),
         informe_at = now(),
         informe_por = auth.uid()
   where id = p_id and anulada_at is null and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Esa apertura no existe o está anulada'; end if;
end $$;

-- ── 5 · Por máquina: sumar fotos y documentos después ─────────────────────
create or replace function public.agregar_archivos_del_equipo(p_item uuid, p_archivos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(es_almacen(), false) or coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Los archivos de la máquina los sube el almacén o postventa';
  end if;
  if jsonb_array_length(coalesce(p_archivos, '[]'::jsonb)) = 0 then raise exception 'Elija al menos un archivo'; end if;
  update pedido_equipos
     set protocolo_fotos = coalesce(protocolo_fotos, '[]'::jsonb) || p_archivos
   where id = p_item and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Esa máquina no está en el pedido'; end if;
end $$;

revoke all on function public.pago_cubre_el_despacho(uuid) from public, anon;
revoke all on function public.autorizar_salida_con_saldo(uuid, text, text) from public, anon;
revoke all on function public.almacen_registrar_salida(uuid, date, jsonb, text) from public, anon;
revoke all on function public.enviar_apertura_llamada(uuid, text, timestamptz, text, text, text, uuid, uuid, text, text, jsonb) from public, anon;
revoke all on function public.postventa_tecnico_de_apertura(uuid, text) from public, anon;
revoke all on function public.almacen_tomar_apertura(uuid, text) from public, anon;
revoke all on function public.almacen_informe_apertura(uuid, text, text, jsonb, text, uuid) from public, anon;
revoke all on function public.agregar_archivos_del_equipo(uuid, jsonb) from public, anon;
grant execute on function public.pago_cubre_el_despacho(uuid) to authenticated;
grant execute on function public.autorizar_salida_con_saldo(uuid, text, text) to authenticated;
grant execute on function public.almacen_registrar_salida(uuid, date, jsonb, text) to authenticated;
grant execute on function public.enviar_apertura_llamada(uuid, text, timestamptz, text, text, text, uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.postventa_tecnico_de_apertura(uuid, text) to authenticated;
grant execute on function public.almacen_tomar_apertura(uuid, text) to authenticated;
grant execute on function public.almacen_informe_apertura(uuid, text, text, jsonb, text, uuid) to authenticated;
grant execute on function public.agregar_archivos_del_equipo(uuid, jsonb) to authenticated;
