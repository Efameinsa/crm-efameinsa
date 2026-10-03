-- 0386 — LA VISITA DE UN PROVEEDOR A LA PLANTA
--
-- Lesly, 03-10 08:36 (con la captura de Almacén › Visitas a planta): «almacén
-- no tiene para registrar la visita de proveedores a planta». Hasta hoy la
-- visita la anunciaban comerciales y postventa desde la ficha del CLIENTE
-- (0238). Un proveedor no tiene ficha: el almacén lo registra desde su
-- pantalla, con lo que pide vigilancia (empresa, RUC, quién viene con DNI,
-- acompañantes, motivo, fecha y hora). Central recibe el aviso y lo imprime,
-- igual que con un cliente.

alter table public.visitas_planta
  add column if not exists tipo_visitante text not null default 'cliente'
    check (tipo_visitante in ('cliente', 'proveedor'));

comment on column public.visitas_planta.tipo_visitante is
  'Quién viene (0386): un cliente (desde su ficha) o un proveedor (lo registra el almacén).';

drop function if exists public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time without time zone, uuid, boolean, text, boolean, boolean, jsonb, text, boolean);

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
  if coalesce(p_tipo, 'cliente') not in ('cliente', 'proveedor') then raise exception 'Tipo de visita no válido: cliente o proveedor'; end if;
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

insert into _migraciones_aplicadas (archivo) values ('0386_visita_de_proveedor_a_planta.sql')
on conflict do nothing;
