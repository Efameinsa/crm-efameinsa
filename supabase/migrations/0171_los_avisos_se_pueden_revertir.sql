-- ============================================================
-- CRM EFAMEINSA · Migración 0171 · Un aviso mal derivado se revierte
-- ============================================================
-- Reunión del 04-09 por la tarde, con el equipo comercial delante. El caso
-- ocurrió el mismo día que se estrenó el aviso de tres destinos (0168):
--
--   «Alondra derivó una gestión, una llamada, y la ha derivado a los tres,
--    porque tú ya lo habilitaste. Pero se equivocó: no debió derivarlo a
--    todos. Era para Finanzas y terminó derivando a todos lados. ¿Cómo se
--    revierte eso en la central?»
--
-- Y el razonamiento de Carlos sobre por qué hace falta, dicho sin rodeos:
--
--   «Son errores humanos. Tiene que revertirse como si nada hubiera pasado.
--    Porque yo, si soy gestor, recibo, pero esto no es mío: la idea es que no
--    me genere el cliente, que no me genere nada (…) Que el administrador
--    operativo revierta la operación y vuelva a aparecer listo para asignar.»
--
--   «Por ahí tengo una sección de mi historial de operaciones, y que ahí
--    aparezca todo lo que ha estado haciendo y ponga revertir, revertir,
--    revertir. Y esa sección ya desaparece de la vista comercial o de todo lo
--    que corresponda, para que otra vez vuelva desde cero.»
--
-- QUIÉN PUEDE. No Central sola: «pero no la central directamente; a alguien le
-- tiene que dar la autorización, o al menos que pida autorización con el PIN».
-- Es el mismo mecanismo de corregir una derivación (0093): el código de cuatro
-- dígitos que dictan operaciones o gerencia, que dura diez minutos y se quema
-- al usarse. La razón que dio Carlos es de oficio, no de desconfianza: Central
-- es supervisión y control, y hoy la persona todavía está aprendiendo.
--
-- QUÉ SIGNIFICA «COMO SI NADA HUBIERA PASADO». Un aviso deja tres rastros
-- (0168) y hay que deshacer los tres:
--   · la actividad que entró en el historial del cliente,
--   · la línea anotada en el pedido de postventa,
--   · el contacto derivado fuera de la bandeja.
-- Por eso el aviso ahora se GUARDA con lo que hizo. Sin ese registro, revertir
-- sería adivinar qué línea borrar de unas observaciones que otros también
-- escriben.
--
-- LO QUE NO SE BORRA: el aviso revertido queda con su motivo, quién lo
-- revirtió y quién lo autorizó. Anular no es borrar, también acá.
--
-- Nota de método: `derivar_aviso` se reescribe entera y no se parcha porque
-- nació ayer en la 0168, no tiene historia intermedia y el cuerpo cambia de
-- arriba abajo. El cuidado de parchar en vivo es para las funciones viejas.
-- ============================================================

create table if not exists avisos_derivados (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  a_finanzas boolean not null default false,
  a_postventa boolean not null default false,
  a_comercial boolean not null default false,
  detalle text not null,
  -- Lo que el aviso dejó escrito, para poder deshacerlo con exactitud.
  actividad_id uuid references actividades (id) on delete set null,
  servicio_id uuid references servicios_postventa (id) on delete set null,
  linea_pedido text,
  -- De dónde venía el contacto, para devolverlo tal como estaba.
  estado_anterior estado_lead,
  area_anterior area_destino,
  derivado_por uuid not null references perfiles (id),
  created_at timestamptz not null default now(),
  revertido_at timestamptz,
  revertido_por uuid references perfiles (id),
  revertido_autorizo uuid references perfiles (id),
  revertido_motivo text
);

comment on table avisos_derivados is
  'Cada aviso que Central manda a Finanzas, postventa o el comercial, con lo que dejó escrito, para poder revertirlo si se equivocó de destino (Carlos, 04-09 tarde).';

create index if not exists avisos_sin_revertir_idx
  on avisos_derivados (created_at desc) where revertido_at is null;

alter table avisos_derivados enable row level security;

drop policy if exists avisos_lectura on avisos_derivados;
create policy avisos_lectura on avisos_derivados
  for select to authenticated
  using (es_backoffice() or es_operaciones() or (select rol_actual()) = 'central'::rol_usuario);

-- ============================================================
-- El aviso, ahora con memoria de lo que hizo
-- ============================================================
create or replace function public.derivar_aviso(
  p_lead      uuid,
  p_finanzas  boolean default false,
  p_postventa boolean default false,
  p_comercial boolean default false,
  p_detalle   text    default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lead      leads;
  v_cuenta    cuentas;
  v_op        oportunidades;
  v_pedido    servicios_postventa;
  v_detalle   text := btrim(coalesce(p_detalle, ''));
  v_area      area_destino;
  v_hecho     text[] := '{}';
  v_falta     text[] := '{}';
  v_actividad uuid;
  v_servicio  uuid;
  v_linea     text;
  v_aviso     uuid;
begin
  if not (es_backoffice() or rol_actual() = 'central' or es_operaciones()) then
    raise exception 'Solo Central o gerencia derivan un aviso';
  end if;
  if not (p_finanzas or p_postventa or p_comercial) then
    raise exception 'Elija al menos un destino: Finanzas, postventa o el comercial';
  end if;
  if length(v_detalle) < 10 then
    raise exception 'Escriba qué avisó el cliente: es lo único que van a leer las áreas';
  end if;

  select * into v_lead from leads where id = p_lead;
  if not found then raise exception 'Ese contacto ya no está'; end if;

  select * into v_cuenta from cuentas
   where (v_lead.cuenta_id is not null and id = v_lead.cuenta_id)
      or (v_lead.cuenta_id is null and v_lead.num_doc is not null and num_doc = v_lead.num_doc)
   limit 1;

  -- AL COMERCIAL: queda en el historial de su oportunidad.
  if p_comercial then
    if v_cuenta.id is null then
      v_falta := array_append(v_falta, 'no se pudo ubicar la ficha del cliente: el aviso no entró en el historial de ningún comercial');
    else
      select * into v_op from oportunidades
       where cuenta_id = v_cuenta.id and etapa <> 'historico'
       order by (cerrada_at is null) desc, created_at desc
       limit 1;
      if v_op.id is null then
        v_falta := array_append(v_falta, 'el cliente no tiene ninguna oportunidad abierta donde anotar el aviso');
      else
        insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
        values (v_op.id, 'nota', '[Aviso de Central] ' || v_detalle, auth.uid(), now())
        returning id into v_actividad;
        v_hecho := array_append(v_hecho, 'anotado en el historial del cliente');
      end if;
    end if;
  end if;

  -- A POSTVENTA: se anota en el pedido en curso.
  if p_postventa then
    if v_cuenta.id is null then
      v_falta := array_append(v_falta, 'sin ficha de cliente no se pudo ubicar su pedido en postventa');
    else
      select * into v_pedido from servicios_postventa
       where cuenta_id = v_cuenta.id and cerrado_at is null and not completado
       order by created_at desc
       limit 1;
      if v_pedido.id is null then
        v_falta := array_append(v_falta, 'ese cliente no tiene ningún pedido abierto en postventa');
      else
        v_linea := to_char(now() at time zone 'America/Lima', 'DD-MM HH24:MI') ||
                   ' · Aviso de Central: ' || v_detalle;
        update servicios_postventa
           set observaciones = btrim(coalesce(observaciones, '') || chr(10) || v_linea),
               updated_at = now()
         where id = v_pedido.id;
        v_servicio := v_pedido.id;
        v_hecho := array_append(v_hecho, 'anotado en el pedido de postventa');
      end if;
    end if;
  end if;

  -- El contacto sale de la bandeja hacia el área que corresponda.
  v_area := case when p_finanzas then 'finanzas'::area_destino
                 when p_postventa then 'postventa'::area_destino
                 else 'comercial'::area_destino end;
  update leads
     set estado = 'derivado_area',
         area_destino = v_area,
         asignado_por = auth.uid(),
         asignado_at = now()
   where id = p_lead;

  if p_finanzas then v_hecho := array_append(v_hecho, 'derivado a Finanzas'); end if;

  -- El registro que hace posible deshacerlo.
  insert into avisos_derivados (
    lead_id, a_finanzas, a_postventa, a_comercial, detalle,
    actividad_id, servicio_id, linea_pedido,
    estado_anterior, area_anterior, derivado_por
  ) values (
    p_lead, p_finanzas, p_postventa, p_comercial, v_detalle,
    v_actividad, v_servicio, v_linea,
    v_lead.estado, v_lead.area_destino, auth.uid()
  ) returning id into v_aviso;

  return jsonb_build_object(
    'aviso', v_aviso,
    'hecho', v_hecho,
    'falta', v_falta,
    'cliente', coalesce(v_cuenta.razon_social, v_lead.razon_social, v_lead.nombre_contacto),
    'documento', coalesce(v_cuenta.num_doc, v_lead.num_doc),
    'telefono', v_lead.telefono,
    'codigo', v_lead.codigo,
    'finanzas', p_finanzas
  );
end $function$;

comment on function public.derivar_aviso(uuid, boolean, boolean, boolean, text) is
  'Central manda un mismo aviso a Finanzas, postventa y el comercial, en cualquier combinación, y guarda lo que dejó escrito para poder revertirlo (0168 y 0171).';

-- ============================================================
-- Revertir: como si nada hubiera pasado
-- ============================================================
create or replace function public.revertir_aviso(
  p_aviso  uuid,
  p_pin    text,
  p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_aviso    avisos_derivados;
  v_autorizo uuid;
  v_obs      text;
  v_deshecho text[] := '{}';
begin
  if not (es_backoffice() or rol_actual() = 'central' or es_operaciones()) then
    raise exception 'Solo Central, operaciones o gerencia revierten un aviso';
  end if;

  select * into v_aviso from avisos_derivados where id = p_aviso;
  if not found then raise exception 'Ese aviso ya no está'; end if;
  if v_aviso.revertido_at is not null then
    raise exception 'Ese aviso ya se revirtió';
  end if;

  -- El código lo dictan operaciones o gerencia, dura diez minutos y se quema.
  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');

  -- 1. Fuera del historial del comercial.
  if v_aviso.actividad_id is not null then
    delete from actividades where id = v_aviso.actividad_id;
    v_deshecho := array_append(v_deshecho, 'se quitó del historial del cliente');
  end if;

  -- 2. Fuera del pedido de postventa. Se quita exactamente la línea que se
  --    escribió, no las observaciones enteras: en ese campo escriben otros.
  if v_aviso.servicio_id is not null and v_aviso.linea_pedido is not null then
    select observaciones into v_obs from servicios_postventa where id = v_aviso.servicio_id;
    if v_obs is not null and position(v_aviso.linea_pedido in v_obs) > 0 then
      update servicios_postventa
         set observaciones = nullif(btrim(replace(v_obs, v_aviso.linea_pedido, '')), ''),
             updated_at = now()
       where id = v_aviso.servicio_id;
      v_deshecho := array_append(v_deshecho, 'se quitó del pedido de postventa');
    end if;
  end if;

  -- 3. El contacto vuelve a la bandeja, listo para asignar.
  update leads
     set estado = 'pendiente_triaje',
         area_destino = 'comercial',
         asignado_a = null,
         asignado_at = null,
         asignado_por = auth.uid()
   where id = v_aviso.lead_id;
  v_deshecho := array_append(v_deshecho, 'el contacto volvió a la bandeja');

  update avisos_derivados
     set revertido_at = now(),
         revertido_por = auth.uid(),
         revertido_autorizo = v_autorizo,
         revertido_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = p_aviso;

  return jsonb_build_object('deshecho', v_deshecho, 'lead', v_aviso.lead_id);
end $function$;

comment on function public.revertir_aviso(uuid, text, text) is
  'Deshace un aviso mal derivado: lo quita del historial del comercial y del pedido de postventa, y devuelve el contacto a la bandeja. Pide el código de operaciones o gerencia (Carlos, 04-09 tarde).';
