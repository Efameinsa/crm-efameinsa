-- 0531 · Al unir expedientes, la próxima acción viva gana a la vencida.
-- La 0530 tomaba la fecha más temprana: ECOLAV quedó con «llamar 21-08»
-- (vencida desde agosto) en vez de «Hacer seguimiento de la cotización
-- Presu_1208-26» del 19-10. Las 55 carpetas unidas el 17-10 se repararon
-- desde el respaldo con esta misma regla.

create or replace function public.unir_expedientes(p_desde uuid, p_hacia uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yo     uuid := auth.uid();
  d        oportunidades%rowtype;
  h        oportunidades%rowtype;
  v_masiva boolean := coalesce(current_setting('app.union_masiva', true), '') = 'si';
  v_rango  text[] := array['asignada', 'filtrada', 'seguimiento', 'cotizada', 'potencial'];
  v_etapa  text;
  n_act int; n_cot int; n_lead int; n_at int; n_ped int; n_otros int := 0; tmp int;
  v_nombre text;
  v_tomadas jsonb;
begin
  if v_yo is null then raise exception 'Sesión no válida'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba por qué se unen (una frase): lo van a leer las demás.';
  end if;
  if p_desde = p_hacia then raise exception 'Elija otro expediente: es el mismo.'; end if;
  select * into d from oportunidades where id = p_desde for update;
  select * into h from oportunidades where id = p_hacia for update;
  if d.id is null or h.id is null then raise exception 'Uno de los dos expedientes no existe.'; end if;
  if d.cuenta_id is distinct from h.cuenta_id then
    raise exception 'Son de fichas distintas. Si es el mismo cliente, primero se unen las fichas («Unir fichas»).';
  end if;
  if (d.tipo_postventa is null) <> (h.tipo_postventa is null) then
    raise exception 'Un expediente comercial no se une con uno de postventa (regla del ing. Carlos, 01-09).';
  end if;
  if not (coalesce(rol_actual()::text, '') in ('central', 'admin', 'gerencia', 'operaciones')
          or (d.tipo_postventa is not null and coalesce(puede_postventa(), false))) then
    raise exception 'Unir expedientes lo hacen postventa (en los suyos), Central, operaciones o gerencia.';
  end if;
  if d.etapa::text <> all (v_rango) or h.etapa::text <> all (v_rango) then
    raise exception 'Solo se unen expedientes abiertos (uno de los dos ya está cerrado o archivado).';
  end if;

  -- El caso que ya estaba tomado sigue tomado por quien lo tomó (la nota de
  -- abajo no se lo adjudica a quien une: trampa del 15-10, Choquehuanca).
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'por', tomada_por, 'at', tomada_at)), '[]'::jsonb)
    into v_tomadas
    from atenciones where oportunidad_id in (p_desde, p_hacia);

  perform set_config('app.uniendo_expedientes', 'si', true);
  update actividades set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics n_act = row_count;
  update cotizaciones set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics n_cot = row_count;
  update leads set oportunidad_id = p_hacia, updated_at = now() where oportunidad_id = p_desde; get diagnostics n_lead = row_count;
  update atenciones set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics n_at = row_count;
  update atenciones set oportunidad_origen = p_hacia where oportunidad_origen = p_desde;
  update servicios_postventa set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics n_ped = row_count;
  update cotizacion_decisiones set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics tmp = row_count; n_otros := n_otros + tmp;
  update informes_cierre set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics tmp = row_count; n_otros := n_otros + tmp;
  update ventas set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics tmp = row_count; n_otros := n_otros + tmp;
  update visitas_planta set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics tmp = row_count; n_otros := n_otros + tmp;
  update solicitudes_infocorp set oportunidad_id = p_hacia where oportunidad_id = p_desde; get diagnostics tmp = row_count; n_otros := n_otros + tmp;
  perform set_config('app.uniendo_expedientes', '', true);

  -- La etapa más avanzada de las dos; la próxima acción más cercana.
  v_etapa := v_rango[greatest(array_position(v_rango, d.etapa::text), array_position(v_rango, h.etapa::text))];
  update oportunidades set
    etapa = v_etapa::etapa_oportunidad,
    -- La próxima acción que sigue viva (la más cercana desde hoy); si las dos
    -- están vencidas, la más reciente. Una vencida de agosto no le gana a un
    -- seguimiento de esta semana (0531, ECOLAV).
    proxima_accion = (select x.t from (values (h.proxima_accion, h.proxima_accion_at), (d.proxima_accion, d.proxima_accion_at)) x(t, f)
                       where x.f is not null
                       order by (x.f >= (now() at time zone 'America/Lima')::date) desc,
                                case when x.f >= (now() at time zone 'America/Lima')::date then x.f end asc,
                                x.f desc
                       limit 1),
    proxima_accion_at = (select x.f from (values (h.proxima_accion, h.proxima_accion_at), (d.proxima_accion, d.proxima_accion_at)) x(t, f)
                       where x.f is not null
                       order by (x.f >= (now() at time zone 'America/Lima')::date) desc,
                                case when x.f >= (now() at time zone 'America/Lima')::date then x.f end asc,
                                x.f desc
                       limit 1),
    cierre_proyectado = coalesce(h.cierre_proyectado, d.cierre_proyectado),
    cotizacion_proyectada = coalesce(h.cotizacion_proyectada, d.cotizacion_proyectada),
    serie_texto = coalesce(h.serie_texto, d.serie_texto),
    equipo_id = coalesce(h.equipo_id, d.equipo_id),
    updated_at = now()
  where id = p_hacia;

  update oportunidades
     set etapa = 'historico', proxima_accion = null, proxima_accion_at = null, proxima_accion_hora = null,
         cierre_proyectado = null, cotizacion_proyectada = null,
         cerrada_at = coalesce(cerrada_at, now()), updated_at = now()
   where id = p_desde;

  select nombre into v_nombre from perfiles where id = v_yo;
  insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
  values (p_hacia, 'nota',
          format('%s unió aquí el expediente del %s (%s): %s gestión(es), %s cotización(es), %s contacto(s) de Central, %s caso(s)%s. Motivo: %s',
                 coalesce(v_nombre, 'Administración'),
                 to_char(d.created_at at time zone 'America/Lima', 'DD-MM-YYYY'),
                 coalesce(d.tipo_postventa::text, 'comercial'),
                 n_act, n_cot, n_lead, n_at,
                 case when n_ped > 0 then format(', %s pedido(s)', n_ped) else '' end,
                 btrim(p_motivo)),
          v_yo, now()),
         (p_desde, 'nota',
          format('Expediente unido al del %s por %s: todo lo de aquí está allá. Motivo: %s',
                 to_char(h.created_at at time zone 'America/Lima', 'DD-MM-YYYY'), coalesce(v_nombre, 'Administración'), btrim(p_motivo)),
          v_yo, now());

  update atenciones a
     set tomada_por = (x->>'por')::uuid, tomada_at = (x->>'at')::timestamptz
    from jsonb_array_elements(v_tomadas) x
   where a.id = (x->>'id')::uuid
     and (a.tomada_por is distinct from (x->>'por')::uuid or a.tomada_at is distinct from (x->>'at')::timestamptz);

  if not v_masiva then
    if h.comercial_id is not null and h.comercial_id <> v_yo then
      insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
      values (h.comercial_id, 'gestiones_movidas', 'Se unió otro expediente a uno suyo',
              format('%s: %s', coalesce(v_nombre, 'Administración'), btrim(p_motivo)), format('/comercial/oportunidades/%s', p_hacia));
    end if;
    if d.comercial_id is not null and d.comercial_id <> v_yo and d.comercial_id is distinct from h.comercial_id then
      insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
      values (d.comercial_id, 'gestiones_movidas', 'Un expediente suyo se unió a otro del mismo cliente',
              format('%s: %s', coalesce(v_nombre, 'Administración'), btrim(p_motivo)), format('/comercial/oportunidades/%s', p_hacia));
    end if;
  end if;

  return format('Listo: %s gestión(es), %s cotización(es), %s contacto(s) y %s caso(s) pasaron al expediente que queda.',
                n_act, n_cot, n_lead, n_at);
end $$;
revoke all on function public.unir_expedientes(uuid, uuid, text) from public, anon;
grant execute on function public.unir_expedientes(uuid, uuid, text) to authenticated;
