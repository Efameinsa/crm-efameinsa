-- ============================================================
-- CRM EFAMEINSA · Migración 0558 · Unir con otra ficha (Katerine, 20-10)
-- ============================================================
-- Caso: Dennis Gallardo Correa escribió por WhatsApp el 20-10 pidiendo una
-- lavadora de 25 kg. Dennis ya era contacto, con ese mismo celular, de la
-- ficha SALVADOR CARRION ANA EUGENIA - LAVANDERIAS GLUP (RUC 10…, cartera de
-- Katerine, expediente vivo del 17-10). Central lo derivó y el CRM abrió una
-- ficha nueva «Dennis gallardo correa 42790476». Katerine lo vio y pidió
-- unirlas, pero el comercial no tenía cómo: «¿Es el mismo cliente?» solo
-- aparece cuando el CRM adivina la pareja, y «Fichas repetidas» (0556) solo
-- junta fichas que se llaman igual.
--
-- Tres cosas:
--   1. El cruce por teléfono ya no descarta la ficha cuando el nombre del
--      lead no se parece a la razón social pero SÍ es uno de sus contactos
--      («Dennis gallardo correa» es contacto de «SALVADOR CARRION … GLUP»).
--      Central veía «teléfono coincide, se une sola» y la base abría otra.
--   2. fusionar_cuentas: sin código cuando las dos fichas son del comercial
--      que las une (no mueve cartera de nadie); se lleva también las tablas
--      que faltaban (llamadas, préstamos de file, recepciones, mensajes del
--      portal, Infocorp, correos de campaña, «facturar a», SUNAT); no deja
--      contactos repetidos por celular; y el expediente comercial abierto y
--      sin papeles de la ficha que se une pasa al expediente vivo del mismo
--      comercial en la ficha que queda (regla del 01-09: un expediente por
--      cliente y comercial).
--   3. buscar_fichas_para_unir: el buscador del botón «Unir con otra ficha»
--      (nombre, RUC/DNI, celular o nombre de un contacto), que ve todas las
--      fichas aunque el comercial solo lea las suyas, con lo justo para
--      decidir cuál se queda.
-- ============================================================

-- ---------- 0. En la base local algunas tablas son de supabase_admin y la
-- función (dueño postgres) no podía moverlas: «permission denied for table
-- inventario_files». En la nube todas son de postgres y esto no hace nada.
do $$
declare t text;
begin
  foreach t in array array['inventario_files', 'recepciones_equipo', 'solicitudes_infocorp', 'correos_campana_recibidos', 'registro_acciones']
  loop
    begin
      execute format('grant select, insert, update, delete on public.%I to postgres', t);
    exception when others then
      raise notice 'sin permiso para %: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- ---------- 1. El teléfono une cuando la persona ya es contacto de la ficha
create or replace function public.tokens_persona(p text)
returns text[] language sql immutable set search_path to 'public' as $$
  select coalesce(array_agg(distinct t), '{}'::text[])
    from unnest(regexp_split_to_array(translate(upper(coalesce(p, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z]+')) as t
   where length(t) >= 3
     and t <> all (array['SRA','SRTA','ING','DON','LIC','DRA','DEL','LOS','LAS','SENOR','SENORA','CONTACTO']);
$$;

-- Dos nombres de persona son la misma si comparten al menos dos palabras
-- (nombre + apellido): «Dennis gallardo correa 42790476» y «DENNIS GALLARDO CORREA».
create or replace function public.misma_persona(p_a text, p_b text)
returns boolean language sql immutable set search_path to 'public' as $$
  select cardinality(array(select unnest(tokens_persona(p_a)) intersect select unnest(tokens_persona(p_b)))) >= 2;
$$;

create or replace function public.el_telefono_puede_unir(p_razon_lead text, p_email_lead text, p_cuenta uuid, p_razon_ficha text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select empresa_compatible(p_razon_lead, p_razon_ficha)
      or ficha_sin_identidad(p_cuenta)
      or (
        position('@' in coalesce(p_email_lead, '')) > 1
        and exists (
          select 1 from contactos ct
           where ct.cuenta_id = p_cuenta
             and lower(btrim(coalesce(ct.email, ''))) = lower(btrim(p_email_lead))
        )
      )
      -- 0558: el que escribe ya es contacto de esa ficha (mismo celular y
      -- mismo nombre de persona), aunque la razón social sea otra.
      or exists (
        select 1 from contactos ct
         where ct.cuenta_id = p_cuenta
           and misma_persona(p_razon_lead, ct.nombre)
      );
$$;

-- ---------- 2. fusionar_cuentas
create or replace function public.fusionar_cuentas(p_origen uuid, p_destino uuid, p_pin text, p_motivo text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_solicitante uuid := auth.uid();
  v_origen      cuentas%rowtype;
  v_destino     cuentas%rowtype;
  v_motivo      text;
  v_oportunidades integer := 0;
  v_contactos     integer := 0;
  v_atenciones    integer := 0;
  v_servicios     integer := 0;
  v_repetidos     integer := 0;
  v_sin_pin       boolean := false;
  v_ops_origen    uuid[];
  v_rango         text[] := array['asignada', 'filtrada', 'seguimiento', 'cotizada', 'potencial'];
  v_nombre        text;
  v_unidos        integer := 0;
  d               oportunidades%rowtype;
  h               oportunidades%rowtype;
  n_act           integer;
  n_lead          integer;
begin
  if v_solicitante is null then raise exception 'Sesión no válida'; end if;

  if p_origen = p_destino then
    raise exception 'No se puede unir una ficha consigo misma';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba por qué es el mismo cliente (mínimo una frase)';
  end if;
  v_motivo := btrim(p_motivo);

  select * into v_origen from cuentas where id = p_origen for update;
  if v_origen.id is null then raise exception 'La ficha de origen no existe'; end if;
  if v_origen.fusionada_en is not null then
    raise exception 'Esa ficha ya está fusionada';
  end if;
  -- Con RUC, el documento manda: no se une a ciegas una ficha que ya tiene su
  -- propia identidad fiscal. Si de verdad es un duplicado con RUC, lo decide
  -- gerencia — es el caso raro, no el que este botón viene a resolver.
  if coalesce(nullif(btrim(v_origen.num_doc), ''), '') <> '' and v_origen.tipo_doc <> 'SIN_DOC'
     and coalesce(rol_actual()::text, '') not in ('gerencia', 'admin') then
    raise exception 'Esa ficha ya tiene % %: unir dos fichas que tienen RUC lo decide gerencia: pídaselo a gerencia o a administración', v_origen.tipo_doc, v_origen.num_doc;
  end if;

  select * into v_destino from cuentas where id = p_destino for update;
  if v_destino.id is null then raise exception 'La ficha de destino no existe'; end if;
  if v_destino.fusionada_en is not null then
    raise exception 'Esa ficha de destino ya está fusionada en otra: elija la definitiva';
  end if;

  -- El código de operaciones existe porque unir mueve carteras. Si las dos
  -- fichas son del comercial que las une, no se mueve la cartera de nadie:
  -- no se pide (0558, Katerine 20-10). Todo lo demás sigue pidiéndolo.
  v_sin_pin := v_origen.comercial_id = v_solicitante and v_destino.comercial_id = v_solicitante;
  if not v_sin_pin then
    perform validar_codigo_autorizacion(p_pin, 'operaciones');
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_ops_origen from oportunidades where cuenta_id = p_origen;

  update oportunidades set cuenta_id = p_destino, updated_at = now() where cuenta_id = p_origen;
  get diagnostics v_oportunidades = row_count;

  -- Un contacto que ya está en la ficha que queda (mismo celular) no se
  -- duplica: lo que le falte al que queda (correo, cargo) se copia, y el
  -- repetido se quita; si tiene llamadas o chats colgando, se mueve igual.
  update contactos dst
     set email = coalesce(nullif(btrim(dst.email), ''), o.email),
         cargo = coalesce(nullif(btrim(dst.cargo), ''), o.cargo)
    from contactos o
   where dst.cuenta_id = p_destino and o.cuenta_id = p_origen
     and length(coalesce(o.telefono_normalizado, '')) >= 6
     and dst.telefono_normalizado = o.telefono_normalizado;
  delete from contactos o
   where o.cuenta_id = p_origen
     and length(coalesce(o.telefono_normalizado, '')) >= 6
     and exists (select 1 from contactos dst where dst.cuenta_id = p_destino and dst.telefono_normalizado = o.telefono_normalizado)
     and not exists (select 1 from llamadas l where l.contacto_id = o.id)
     and not exists (select 1 from wa_conversaciones w where w.contacto_id = o.id);
  get diagnostics v_repetidos = row_count;

  update contactos set cuenta_id = p_destino where cuenta_id = p_origen;
  get diagnostics v_contactos = row_count;

  update atenciones set cuenta_id = p_destino, updated_at = now() where cuenta_id = p_origen;
  get diagnostics v_atenciones = row_count;

  update servicios_postventa set cuenta_id = p_destino, updated_at = now() where cuenta_id = p_origen;
  get diagnostics v_servicios = row_count;

  -- 0282 (23-09): unir también se lleva lo que cuelga de la ficha y antes
  -- quedaba en la vieja. 0558: y lo que seguía faltando.
  perform set_config('app.fusionando_cuentas', 'si', true);
  update informes_cierre set cuenta_id = p_destino where cuenta_id = p_origen;
  update informes_servicio set cuenta_id = p_destino where cuenta_id = p_origen;
  update equipos_instalados set cuenta_id = p_destino where cuenta_id = p_origen;
  update cotizaciones_historicas set cuenta_id = p_destino where cuenta_id = p_origen;
  update leads set cuenta_id = p_destino where cuenta_id = p_origen;
  update soporte_tecnico set cuenta_id = p_destino where cuenta_id = p_origen;
  update visitas_planta set cuenta_id = p_destino where cuenta_id = p_origen;
  update aperturas_llamada set cuenta_id = p_destino where cuenta_id = p_origen;
  update asignaciones set cuenta_id = p_destino where cuenta_id = p_origen;
  update inventario_equipos set reservado_para = p_destino where reservado_para = p_origen;
  update wa_asignaciones_automaticas set cuenta_id = p_destino where cuenta_id = p_origen;
  update llamadas set cuenta_id = p_destino where cuenta_id = p_origen;
  update prestamos_file set cuenta_id = p_destino where cuenta_id = p_origen;
  update inventario_files set cuenta_id = p_destino where cuenta_id = p_origen;
  update recepciones_equipo set cuenta_id = p_destino where cuenta_id = p_origen;
  update portal_mensajes set cuenta_id = p_destino where cuenta_id = p_origen;
  update solicitudes_infocorp set cuenta_id = p_destino where cuenta_id = p_origen;
  update correos_campana_recibidos set cuenta_id = p_destino where cuenta_id = p_origen;
  update cotizaciones set facturar_a_cuenta_id = p_destino where facturar_a_cuenta_id = p_origen;
  update sunat_candidatos set cuenta_id = p_destino where cuenta_id = p_origen;
  update cuentas set cuenta_padre_id = p_destino where cuenta_padre_id = p_origen and id <> p_destino;
  update cuentas
     set ultima_venta_at = greatest(ultima_venta_at, v_origen.ultima_venta_at),
         cartera_desde = least(cartera_desde, v_origen.cartera_desde)
   where id = p_destino;

  update cuentas set fusionada_en = p_destino, updated_at = now() where id = p_origen;

  -- UN EXPEDIENTE POR CLIENTE Y COMERCIAL (regla del 01-09). El expediente
  -- comercial abierto que venía en la ficha unida, si no tiene papeles
  -- (cotización, cierre, venta, pedido, caso), se suma al expediente vivo del
  -- mismo comercial en la ficha que queda. Con papeles o de otro comercial,
  -- se queda como está (lo decide Central con «Unir expedientes»).
  select nombre into v_nombre from perfiles where id = v_solicitante;
  perform set_config('app.uniendo_expedientes', 'si', true);
  for d in
    select * from oportunidades
     where id = any(v_ops_origen) and tipo_postventa is null and unida_a is null and etapa::text = any(v_rango)
     order by created_at
  loop
    if exists (select 1 from cotizaciones where oportunidad_id = d.id)
       or exists (select 1 from informes_cierre where oportunidad_id = d.id)
       or exists (select 1 from ventas where oportunidad_id = d.id)
       or exists (select 1 from servicios_postventa where oportunidad_id = d.id)
       or exists (select 1 from atenciones where oportunidad_id = d.id or oportunidad_origen = d.id)
       or exists (select 1 from solicitudes_infocorp where oportunidad_id = d.id)
       or exists (select 1 from oportunidades u where u.unida_a = d.id) then
      continue;
    end if;
    select * into h from oportunidades
     where cuenta_id = p_destino and id <> all(v_ops_origen)
       and tipo_postventa is null and unida_a is null and etapa::text = any(v_rango)
       and comercial_id is not distinct from d.comercial_id
     order by updated_at desc limit 1;
    if h.id is null then continue; end if;

    update actividades set oportunidad_id = h.id where oportunidad_id = d.id; get diagnostics n_act = row_count;
    update leads set oportunidad_id = h.id, updated_at = now() where oportunidad_id = d.id; get diagnostics n_lead = row_count;
    update visitas_planta set oportunidad_id = h.id where oportunidad_id = d.id;
    update llamadas set oportunidad_id = h.id where oportunidad_id = d.id;
    update cotizacion_decisiones set oportunidad_id = h.id where oportunidad_id = d.id;
    update oportunidades set
      etapa = (v_rango[greatest(array_position(v_rango, d.etapa::text), array_position(v_rango, h.etapa::text))])::etapa_oportunidad,
      proxima_accion = coalesce(h.proxima_accion, d.proxima_accion),
      proxima_accion_at = coalesce(h.proxima_accion_at, d.proxima_accion_at),
      proxima_accion_hora = case when h.proxima_accion_at is null then d.proxima_accion_hora else h.proxima_accion_hora end,
      cierre_proyectado = coalesce(h.cierre_proyectado, d.cierre_proyectado),
      cotizacion_proyectada = coalesce(h.cotizacion_proyectada, d.cotizacion_proyectada),
      updated_at = now()
     where id = h.id;
    update oportunidades
       set etapa = 'historico', proxima_accion = null, proxima_accion_at = null, proxima_accion_hora = null,
           cierre_proyectado = null, cotizacion_proyectada = null, unida_a = h.id,
           cerrada_at = coalesce(cerrada_at, now()), updated_at = now()
     where id = d.id;
    insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
    values (h.id, 'nota',
            format('%s unió la ficha «%s» a esta y el expediente del %s pasó aquí: %s gestión(es) y %s contacto(s) de Central. Motivo: %s',
                   coalesce(v_nombre, 'Administración'), v_origen.razon_social,
                   to_char(d.created_at at time zone 'America/Lima', 'DD-MM-YYYY'), n_act, n_lead, v_motivo),
            v_solicitante, now()),
           (d.id, 'nota',
            format('Expediente unido al del %s al unir las fichas (%s): todo lo de aquí está allá.',
                   to_char(h.created_at at time zone 'America/Lima', 'DD-MM-YYYY'), coalesce(v_nombre, 'Administración')),
            v_solicitante, now());
    v_unidos := v_unidos + 1;
  end loop;
  perform set_config('app.uniendo_expedientes', '', true);

  -- Quien tenía la ficha que queda se entera; y quien pierde una ficha de su
  -- cartera, también (si no fue él mismo).
  if v_destino.comercial_id is not null and v_destino.comercial_id <> v_solicitante then
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    values (v_destino.comercial_id, 'gestiones_movidas', 'Le unieron una ficha a un cliente suyo',
            format('%s unió «%s» a «%s»: %s', coalesce(v_nombre, 'Administración'), v_origen.razon_social, v_destino.razon_social, v_motivo),
            format('/nuevo/cliente/%s', p_destino));
  end if;
  if v_origen.comercial_id is not null and v_origen.comercial_id <> v_solicitante
     and v_origen.comercial_id is distinct from v_destino.comercial_id then
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    values (v_origen.comercial_id, 'gestiones_movidas', 'Una ficha de su cartera se unió a otra',
            format('%s unió «%s» a «%s» (cartera de %s): %s', coalesce(v_nombre, 'Administración'), v_origen.razon_social, v_destino.razon_social,
                   coalesce((select nombre from perfiles where id = v_destino.comercial_id), 'nadie'), v_motivo),
            format('/nuevo/cliente/%s', p_destino));
  end if;

  return format(
    'Unida a %s: %s expediente(s), %s contacto(s), %s atención(es) y %s pedido(s) movidos.%s%s %s',
    v_destino.razon_social, v_oportunidades, v_contactos, v_atenciones, v_servicios,
    case when v_unidos > 0 then format(' %s expediente(s) se sumó/sumaron al expediente vivo.', v_unidos) else '' end,
    case when v_repetidos > 0 then format(' %s contacto(s) repetido(s) no se duplicó/duplicaron.', v_repetidos) else '' end,
    v_motivo
  );
end;
$function$;

revoke all on function public.fusionar_cuentas(uuid, uuid, text, text) from public;
grant execute on function public.fusionar_cuentas(uuid, uuid, text, text) to authenticated;

-- ---------- 3. El buscador de «Unir con otra ficha»
-- Ve todas las fichas (el comercial por RLS solo lee las suyas) con lo justo
-- para decidir: nombre, documento, cartera, movimiento y si unir pide código.
create or replace function public.buscar_fichas_para_unir(p_cuenta uuid, p_texto text)
returns table (
  id uuid, razon_social text, documento text, comercial text, comercial_id uuid,
  expedientes integer, contactos integer, ultimo_movimiento timestamptz,
  motivo text, sin_codigo boolean
)
language sql stable security definer set search_path to 'public' as $$
  with q as (
    select btrim(coalesce(p_texto, '')) as t,
           regexp_replace(coalesce(p_texto, ''), '[^0-9]', '', 'g') as digitos,
           array_remove(regexp_split_to_array(btrim(coalesce(p_texto, '')), '[[:space:]]+'), '') as palabras
  ),
  cand as (
    select c.id, 1 as orden, 'nombre' as motivo
      from cuentas c, q
     where length(q.t) >= 3
       and c.razon_social ilike all (select '%' || w || '%' from unnest(q.palabras) w)
    union all
    select c.id, 0, 'RUC o DNI'
      from cuentas c, q
     where length(q.digitos) >= 6 and c.num_doc like q.digitos || '%'
    union all
    select ct.cuenta_id, 2, 'celular de un contacto'
      from contactos ct, q
     where length(q.digitos) >= 6 and ct.telefono_normalizado like '%' || q.digitos || '%'
    union all
    select ct.cuenta_id, 3, 'contacto: ' || ct.nombre
      from contactos ct, q
     where length(q.t) >= 4 and length(q.digitos) < 6
       and ct.nombre ilike all (select '%' || w || '%' from unnest(q.palabras) w)
  ),
  elegidas as (
    select cand.id, (array_agg(cand.motivo order by cand.orden))[1] as motivo
      from cand group by cand.id
  )
  select c.id, c.razon_social,
         case when c.tipo_doc <> 'SIN_DOC' then c.num_doc end as documento,
         (select coalesce(p.codigo_comercial || ' ', '') || p.nombre from perfiles p where p.id = c.comercial_id) as comercial,
         c.comercial_id,
         (select count(*)::integer from oportunidades o where o.cuenta_id = c.id) as expedientes,
         (select count(*)::integer from contactos k where k.cuenta_id = c.id) as contactos,
         (select max(o.updated_at) from oportunidades o where o.cuenta_id = c.id) as ultimo_movimiento,
         e.motivo,
         (c.comercial_id = auth.uid() and (select b.comercial_id from cuentas b where b.id = p_cuenta) = auth.uid()) as sin_codigo
    from elegidas e
    join cuentas c on c.id = e.id
   where auth.uid() is not null
     and c.id <> p_cuenta
     and c.fusionada_en is null
     and c.archivada_at is null
   order by (c.tipo_doc <> 'SIN_DOC') desc,
            (select count(*) from oportunidades o where o.cuenta_id = c.id) desc,
            c.created_at
   limit 10;
$$;
revoke all on function public.buscar_fichas_para_unir(uuid, text) from public;
grant execute on function public.buscar_fichas_para_unir(uuid, text) to authenticated;
