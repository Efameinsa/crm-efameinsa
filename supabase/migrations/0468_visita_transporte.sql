-- 0468 — LA VISITA LLEVA LOS DATOS DEL TRANSPORTE QUE LLEGA A LA PLANTA
--
-- Rubí Simeon (postventa), 13-10, buzón (mejora) «VISITA»: «Se debe incluir
-- para añadir datos del transporte que llega a nuestras instalaciones: RUC,
-- MARCA, PLACA, MTC, CHOFER, BREVETE». La visita guarda el vehículo (cuando
-- viene a recoger o a dejar equipos) y sale en la campana de Central, el
-- aviso al almacén, el correo, la lista de visitas y la hoja de vigilancia.

alter table public.visitas_planta
  add column if not exists transporte jsonb;

comment on column public.visitas_planta.transporte is
  'Transporte que llega a la planta (0468): {ruc, marca, placa, mtc, chofer, brevete}; null si no viene vehículo.';

drop function if exists public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time without time zone, uuid, boolean, text, boolean, boolean, jsonb, text, boolean, text, jsonb, jsonb);

create or replace function public.registrar_visita_planta(p_cuenta uuid, p_empresa text, p_ruc text, p_persona text, p_dni text, p_telefono text, p_motivo text, p_fecha date, p_hora time without time zone, p_oportunidad uuid DEFAULT NULL::uuid, p_showroom boolean DEFAULT false, p_cotizacion_ref text DEFAULT NULL::text, p_prender_tv boolean DEFAULT false, p_infocorp boolean DEFAULT false, p_acompanantes jsonb DEFAULT '[]'::jsonb, p_equipo_a_ver text DEFAULT NULL::text, p_quitar_film boolean DEFAULT false, p_tipo text DEFAULT 'cliente'::text, p_maquinas jsonb DEFAULT '[]'::jsonb, p_equipos_recoge jsonb DEFAULT '[]'::jsonb, p_transporte jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quien uuid := auth.uid();
  v_id uuid;
  v_nombre text;
  v_cuando text;
  v_prueba boolean := coalesce(es_cuenta_prueba(), false);
  v_n int := jsonb_array_length(coalesce(p_acompanantes, '[]'::jsonb));
  v_maquinas jsonb;
  v_resumen text;
  v_preparar text;
  v_recoge jsonb;
  v_recoge_txt text;
  v_transporte jsonb;
  v_transporte_txt text;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if length(btrim(coalesce(p_empresa, ''))) < 2 then raise exception 'Diga qué empresa viene'; end if;
  if length(btrim(coalesce(p_persona, ''))) < 3 then raise exception 'Diga quién viene: vigilancia lo pide por nombre'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Diga para qué viene'; end if;
  if p_fecha is null then raise exception 'Falta la fecha de la visita'; end if;
  if coalesce(p_tipo, 'cliente') not in ('cliente', 'proveedor', 'videollamada') then raise exception 'Tipo de visita no válido: cliente, proveedor o videollamada'; end if;
  if p_fecha < (now() at time zone 'America/Lima')::date then raise exception 'La visita no puede ser en una fecha ya pasada'; end if;

  -- Solo las máquinas con nombre; cada una con lo que hay que hacerle.
  select coalesce(jsonb_agg(jsonb_build_object(
           'maquina', left(btrim(m->>'maquina'), 160),
           'caracteristicas', nullif(left(btrim(coalesce(m->>'caracteristicas', '')), 200), ''),
           'mover_a_prueba', coalesce((m->>'mover_a_prueba')::boolean, false),
           'quitar_film', coalesce((m->>'quitar_film')::boolean, false))), '[]'::jsonb)
    into v_maquinas
    from jsonb_array_elements(case when jsonb_typeof(p_maquinas) = 'array' then p_maquinas else '[]'::jsonb end) m
   where length(btrim(coalesce(m->>'maquina', ''))) > 0;

  if exists (select 1 from jsonb_array_elements(v_maquinas) m
              where (m->>'quitar_film')::boolean and m->>'caracteristicas' is null) then
    raise exception 'Para quitarle el film escriba las características de la máquina (voltaje, fase, capacidad…): almacén las necesita';
  end if;

  -- Los equipos de la ficha que se lleva (0467; Rubí, 13-10): solo los de esa cuenta.
  select coalesce(jsonb_agg(jsonb_build_object('equipo_id', e.id, 'modelo', coalesce(e.modelo_texto, 'Equipo'), 'serie', e.serie) order by e.modelo_texto), '[]'::jsonb),
         string_agg(coalesce(e.modelo_texto, 'Equipo') || coalesce(' · serie ' || e.serie, ''), '; ' order by e.modelo_texto)
    into v_recoge, v_recoge_txt
    from equipos_instalados e
   where p_cuenta is not null and e.cuenta_id = p_cuenta
     and e.id::text in (select jsonb_array_elements_text(case when jsonb_typeof(p_equipos_recoge) = 'array' then p_equipos_recoge else '[]'::jsonb end));

  -- El transporte que llega a la planta (0468; Rubí, 13-10): solo los campos escritos.
  select nullif(jsonb_strip_nulls(jsonb_build_object(
           'ruc', nullif(left(btrim(coalesce(p_transporte->>'ruc', '')), 20), ''),
           'marca', nullif(left(btrim(coalesce(p_transporte->>'marca', '')), 80), ''),
           'placa', nullif(upper(left(btrim(coalesce(p_transporte->>'placa', '')), 20)), ''),
           'mtc', nullif(left(btrim(coalesce(p_transporte->>'mtc', '')), 40), ''),
           'chofer', nullif(left(btrim(coalesce(p_transporte->>'chofer', '')), 120), ''),
           'brevete', nullif(upper(left(btrim(coalesce(p_transporte->>'brevete', '')), 20)), ''))), '{}'::jsonb)
    into v_transporte
   where jsonb_typeof(p_transporte) = 'object';
  if v_transporte is not null then
    select string_agg(x, ', ' order by o) into v_transporte_txt from (values
      (1, 'placa ' || (v_transporte->>'placa')), (2, 'marca ' || (v_transporte->>'marca')),
      (3, 'RUC ' || (v_transporte->>'ruc')), (4, 'MTC ' || (v_transporte->>'mtc')),
      (5, 'chofer ' || (v_transporte->>'chofer')), (6, 'brevete ' || (v_transporte->>'brevete'))) t(o, x)
     where x is not null;
  end if;

  select string_agg(format('%s%s%s', m->>'maquina',
                           case when m->>'caracteristicas' is not null then ' — ' || (m->>'caracteristicas') else '' end,
                           case when (m->>'mover_a_prueba')::boolean and (m->>'quitar_film')::boolean then ' (llevar al área de prueba y quitar el film)'
                                when (m->>'mover_a_prueba')::boolean then ' (llevar al área de prueba)'
                                when (m->>'quitar_film')::boolean then ' (quitar el film)' else '' end), '; ')
    into v_resumen
    from jsonb_array_elements(v_maquinas) m;

  insert into visitas_planta (cuenta_id, oportunidad_id, empresa, ruc, persona, dni, telefono, motivo, fecha, hora, registrado_por, es_prueba, showroom, cotizacion_ref, prender_tv, infocorp, acompanantes, equipo_a_ver, quitar_film, tipo_visitante, maquinas_preparar, equipos_recoge, transporte)
  values (p_cuenta, p_oportunidad, btrim(p_empresa), nullif(btrim(coalesce(p_ruc, '')), ''), btrim(p_persona),
          nullif(regexp_replace(coalesce(p_dni, ''), '[^0-9A-Za-z]', '', 'g'), ''), nullif(btrim(coalesce(p_telefono, '')), ''),
          btrim(p_motivo), p_fecha, p_hora, v_quien, v_prueba, coalesce(p_showroom, false),
          nullif(btrim(coalesce(p_cotizacion_ref, '')), ''), coalesce(p_prender_tv, false), coalesce(p_infocorp, false),
          coalesce(p_acompanantes, '[]'::jsonb),
          coalesce(v_resumen, nullif(btrim(coalesce(p_equipo_a_ver, '')), '')),
          -- Mover o quitar el film: el almacén la deja lista (check «film») y luego la vuelve a su sitio.
          coalesce(p_quitar_film, false) or exists (select 1 from jsonb_array_elements(v_maquinas) m
                                                     where (m->>'quitar_film')::boolean or (m->>'mover_a_prueba')::boolean),
          coalesce(p_tipo, 'cliente'), v_maquinas, v_recoge, v_transporte)
  returning id into v_id;

  select coalesce(nombre, 'alguien') into v_nombre from perfiles where id = v_quien;
  v_cuando := to_char(p_fecha, 'DD/MM') || case when p_hora is not null then ' ' || to_char(p_hora, 'HH24:MI') else '' end;
  v_preparar := case when v_transporte_txt is not null then ' Llega en transporte: ' || v_transporte_txt || '.' else '' end || case when v_recoge_txt is not null then ' Recoge: ' || v_recoge_txt || '.' else '' end || case when v_resumen is not null then ' Preparar máquinas: ' || v_resumen || '.'
                     when coalesce(p_quitar_film, false) then format(' Quitar el film a %s.', coalesce(p_equipo_a_ver, 'la máquina'))
                     else '' end;

  -- Una videollamada no entra a la planta: no hay hoja para vigilancia, solo avisa el almacén (desde la acción).
  if p_tipo = 'videollamada' then return v_id; end if;

  insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
  select p.id, 'visita_planta',
         format('Visita %s el %s · %s', case when p_tipo = 'proveedor' then 'de proveedor' when coalesce(p_showroom, false) then 'al showroom' else 'a planta' end, v_cuando, btrim(p_empresa)),
         format('Viene %s%s%s. Motivo: %s.%s%s%s%s Lo registró %s. Imprímalo para vigilancia.',
                btrim(p_persona), case when p_dni is not null then ' (DNI ' || p_dni || ')' else '' end,
                case when v_n > 0 then format(' con %s acompañante(s)', v_n) else '' end,
                btrim(p_motivo),
                case when coalesce(p_showroom, false) then ' Abrir la lavandería.' else '' end,
                case when coalesce(p_prender_tv, false) then ' Prender el TV.' else '' end,
                v_preparar,
                case when coalesce(p_infocorp, false) then ' Se solicita Infocorp.' else '' end,
                v_nombre),
         '/central/visitas'
    from perfiles p
   where p.rol = 'central' and p.activo and coalesce(p.es_prueba, false) = v_prueba;
  return v_id;
end $function$;

grant execute on function public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time without time zone, uuid, boolean, text, boolean, boolean, jsonb, text, boolean, text, jsonb, jsonb, jsonb) to authenticated;

insert into _migraciones_aplicadas (archivo) values ('0468_visita_transporte.sql')
on conflict do nothing;
