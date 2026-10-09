-- 0422 — PREPARACIÓN DE MÁQUINAS PARA VISITA DE CLIENTES
--
-- Brenda Taboada (comercial), 09-10, buzón (idea): «agregar la opción cuando
-- tengamos visita en planta de mover las máquinas al área de prueba para
-- exhibición o que se les retire el stretch film para la demostración al
-- cliente… así detallaría en mi visita qué equipos necesito que preparen».
-- Hasta ahora había una sola máquina («¿Viene a ver una máquina en especial?»)
-- y un check de film. Ahora la visita lleva la lista de máquinas a preparar,
-- cada una con lo que hay que hacerle. equipo_a_ver y quitar_film se siguen
-- llenando (resumen de la lista) para que el check «film» del almacén, el
-- re-embalaje y el circuito de la visita sigan funcionando igual.

alter table public.visitas_planta
  add column if not exists maquinas_preparar jsonb not null default '[]'::jsonb;

comment on column public.visitas_planta.maquinas_preparar is
  'Preparación de máquinas para la visita (0422): [{maquina, caracteristicas, mover_a_prueba, quitar_film}].';

drop function if exists public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time without time zone, uuid, boolean, text, boolean, boolean, jsonb, text, boolean, text);

create or replace function public.registrar_visita_planta(p_cuenta uuid, p_empresa text, p_ruc text, p_persona text, p_dni text, p_telefono text, p_motivo text, p_fecha date, p_hora time without time zone, p_oportunidad uuid DEFAULT NULL::uuid, p_showroom boolean DEFAULT false, p_cotizacion_ref text DEFAULT NULL::text, p_prender_tv boolean DEFAULT false, p_infocorp boolean DEFAULT false, p_acompanantes jsonb DEFAULT '[]'::jsonb, p_equipo_a_ver text DEFAULT NULL::text, p_quitar_film boolean DEFAULT false, p_tipo text DEFAULT 'cliente'::text, p_maquinas jsonb DEFAULT '[]'::jsonb)
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

  select string_agg(format('%s%s%s', m->>'maquina',
                           case when m->>'caracteristicas' is not null then ' — ' || (m->>'caracteristicas') else '' end,
                           case when (m->>'mover_a_prueba')::boolean and (m->>'quitar_film')::boolean then ' (llevar al área de prueba y quitar el film)'
                                when (m->>'mover_a_prueba')::boolean then ' (llevar al área de prueba)'
                                when (m->>'quitar_film')::boolean then ' (quitar el film)' else '' end), '; ')
    into v_resumen
    from jsonb_array_elements(v_maquinas) m;

  insert into visitas_planta (cuenta_id, oportunidad_id, empresa, ruc, persona, dni, telefono, motivo, fecha, hora, registrado_por, es_prueba, showroom, cotizacion_ref, prender_tv, infocorp, acompanantes, equipo_a_ver, quitar_film, tipo_visitante, maquinas_preparar)
  values (p_cuenta, p_oportunidad, btrim(p_empresa), nullif(btrim(coalesce(p_ruc, '')), ''), btrim(p_persona),
          nullif(regexp_replace(coalesce(p_dni, ''), '[^0-9A-Za-z]', '', 'g'), ''), nullif(btrim(coalesce(p_telefono, '')), ''),
          btrim(p_motivo), p_fecha, p_hora, v_quien, v_prueba, coalesce(p_showroom, false),
          nullif(btrim(coalesce(p_cotizacion_ref, '')), ''), coalesce(p_prender_tv, false), coalesce(p_infocorp, false),
          coalesce(p_acompanantes, '[]'::jsonb),
          coalesce(v_resumen, nullif(btrim(coalesce(p_equipo_a_ver, '')), '')),
          -- Mover o quitar el film: el almacén la deja lista (check «film») y luego la vuelve a su sitio.
          coalesce(p_quitar_film, false) or exists (select 1 from jsonb_array_elements(v_maquinas) m
                                                     where (m->>'quitar_film')::boolean or (m->>'mover_a_prueba')::boolean),
          coalesce(p_tipo, 'cliente'), v_maquinas)
  returning id into v_id;

  select coalesce(nombre, 'alguien') into v_nombre from perfiles where id = v_quien;
  v_cuando := to_char(p_fecha, 'DD/MM') || case when p_hora is not null then ' ' || to_char(p_hora, 'HH24:MI') else '' end;
  v_preparar := case when v_resumen is not null then ' Preparar máquinas: ' || v_resumen || '.'
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

grant execute on function public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time without time zone, uuid, boolean, text, boolean, boolean, jsonb, text, boolean, text, jsonb) to authenticated;

insert into _migraciones_aplicadas (archivo) values ('0422_preparar_maquinas_para_la_visita.sql')
on conflict do nothing;
