-- 0572 · Unir dos fichas no falla si las dos tienen búsqueda SUNAT guardada
--
-- 21-10-2026, al unir las fichas parecidas al 100 % (Santos): fusionar_cuentas
-- movía sunat_candidatos de la ficha que se va a la que se queda, y la tabla
-- admite UNA fila por ficha: «duplicate key … sunat_candidatos_cuenta_id_key».
-- El mismo error le habría salido a quien une dos fichas a mano. Ahora, si las
-- dos tienen, queda la del destino.

CREATE OR REPLACE FUNCTION public.fusionar_cuentas(p_origen uuid, p_destino uuid, p_pin text, p_motivo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- 0572: una búsqueda SUNAT por ficha; si las dos tienen, queda la del destino.
  delete from sunat_candidatos where cuenta_id = p_origen and exists (select 1 from sunat_candidatos x where x.cuenta_id = p_destino);
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
