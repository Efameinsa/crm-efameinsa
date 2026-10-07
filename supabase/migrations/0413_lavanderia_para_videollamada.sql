-- 0413 — LA LAVANDERÍA TAMBIÉN SE PIDE PARA UNA VIDEOLLAMADA
--
-- Brenda Taboada (comercial), 07-10, buzón (idea): «solo tenemos habilitado el
-- apertura lavandería cuando hay visita en planta; actualmente lo pedíamos por
-- correo para videollamadas con clientes de provincia». La videollamada se
-- registra como una visita de tipo 'videollamada': pide abrir la lavandería
-- (y la TV) a Almacén, con el mismo correo, pero sin hoja para vigilancia.

alter table public.visitas_planta drop constraint if exists visitas_planta_tipo_visitante_check;
alter table public.visitas_planta
  add constraint visitas_planta_tipo_visitante_check check (tipo_visitante in ('cliente', 'proveedor', 'videollamada'));

create or replace function public.registrar_visita_planta(p_cuenta uuid, p_empresa text, p_ruc text, p_persona text, p_dni text, p_telefono text, p_motivo text, p_fecha date, p_hora time without time zone, p_oportunidad uuid DEFAULT NULL::uuid, p_showroom boolean DEFAULT false, p_cotizacion_ref text DEFAULT NULL::text, p_prender_tv boolean DEFAULT false, p_infocorp boolean DEFAULT false, p_acompanantes jsonb DEFAULT '[]'::jsonb, p_equipo_a_ver text DEFAULT NULL::text, p_quitar_film boolean DEFAULT false, p_tipo text DEFAULT 'cliente'::text)
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
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if length(btrim(coalesce(p_empresa, ''))) < 2 then raise exception 'Diga qué empresa viene'; end if;
  if length(btrim(coalesce(p_persona, ''))) < 3 then raise exception 'Diga quién viene: vigilancia lo pide por nombre'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Diga para qué viene'; end if;
  if p_fecha is null then raise exception 'Falta la fecha de la visita'; end if;
  if coalesce(p_tipo, 'cliente') not in ('cliente', 'proveedor', 'videollamada') then raise exception 'Tipo de visita no válido: cliente, proveedor o videollamada'; end if;
  if p_fecha < (now() at time zone 'America/Lima')::date then raise exception 'La visita no puede ser en una fecha ya pasada'; end if;

  insert into visitas_planta (cuenta_id, oportunidad_id, empresa, ruc, persona, dni, telefono, motivo, fecha, hora, registrado_por, es_prueba, showroom, cotizacion_ref, prender_tv, infocorp, acompanantes, equipo_a_ver, quitar_film, tipo_visitante)
  values (p_cuenta, p_oportunidad, btrim(p_empresa), nullif(btrim(coalesce(p_ruc, '')), ''), btrim(p_persona),
          nullif(regexp_replace(coalesce(p_dni, ''), '[^0-9A-Za-z]', '', 'g'), ''), nullif(btrim(coalesce(p_telefono, '')), ''),
          btrim(p_motivo), p_fecha, p_hora, v_quien, v_prueba, coalesce(p_showroom, false),
          nullif(btrim(coalesce(p_cotizacion_ref, '')), ''), coalesce(p_prender_tv, false), coalesce(p_infocorp, false),
          coalesce(p_acompanantes, '[]'::jsonb), nullif(btrim(coalesce(p_equipo_a_ver, '')), ''), coalesce(p_quitar_film, false), coalesce(p_tipo, 'cliente'))
  returning id into v_id;

  select coalesce(nombre, 'alguien') into v_nombre from perfiles where id = v_quien;
  v_cuando := to_char(p_fecha, 'DD/MM') || case when p_hora is not null then ' ' || to_char(p_hora, 'HH24:MI') else '' end;

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
                case when coalesce(p_quitar_film, false) then format(' Quitar el film a %s.', coalesce(p_equipo_a_ver, 'la máquina')) else '' end,
                case when coalesce(p_infocorp, false) then ' Se solicita Infocorp.' else '' end,
                v_nombre),
         '/central/visitas'
    from perfiles p
   where p.rol = 'central' and p.activo and coalesce(p.es_prueba, false) = v_prueba;
  return v_id;
end $function$;

grant execute on function public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time without time zone, uuid, boolean, text, boolean, boolean, jsonb, text, boolean, text) to authenticated;

insert into _migraciones_aplicadas (archivo) values ('0413_lavanderia_para_videollamada.sql')
on conflict do nothing;
