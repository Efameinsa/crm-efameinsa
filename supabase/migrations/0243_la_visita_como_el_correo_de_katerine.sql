-- ============================================================
-- CRM EFAMEINSA · Migración 0243 · La visita como el correo de Katerine
-- ============================================================
-- Ejemplo real (Downloads/ejemplo_visita_showroom.png, 16-09): la tabla es
-- FECHA · HORA · PROSPECTO (DNI/RUC y nombre) · N° COTIZACIÓN · OBSERVACIÓN,
-- y debajo los pedidos a la casa: «Prender TV», «Abrir lavandería», «Se
-- solicita Infocorp». Faltaban la cotización y dos de los tres pedidos.
-- ============================================================
alter table public.visitas_planta
  add column if not exists cotizacion_ref text,
  add column if not exists prender_tv boolean not null default false,
  add column if not exists infocorp boolean not null default false;

drop function if exists public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time, uuid, boolean);
create or replace function public.registrar_visita_planta(
  p_cuenta uuid,
  p_empresa text,
  p_ruc text,
  p_persona text,
  p_dni text,
  p_telefono text,
  p_motivo text,
  p_fecha date,
  p_hora time,
  p_oportunidad uuid default null,
  p_showroom boolean default false,
  p_cotizacion_ref text default null,
  p_prender_tv boolean default false,
  p_infocorp boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien uuid := auth.uid();
  v_id uuid;
  v_nombre text;
  v_cuando text;
  v_prueba boolean := coalesce(es_cuenta_prueba(), false);
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if length(btrim(coalesce(p_empresa, ''))) < 2 then raise exception 'Diga qué empresa viene'; end if;
  if length(btrim(coalesce(p_persona, ''))) < 3 then raise exception 'Diga quién viene: vigilancia lo pide por nombre'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Diga para qué viene'; end if;
  if p_fecha is null then raise exception 'Falta la fecha de la visita'; end if;
  if p_fecha < (now() at time zone 'America/Lima')::date then raise exception 'La visita no puede ser en una fecha ya pasada'; end if;

  insert into visitas_planta (cuenta_id, oportunidad_id, empresa, ruc, persona, dni, telefono, motivo, fecha, hora, registrado_por, es_prueba, showroom, cotizacion_ref, prender_tv, infocorp)
  values (p_cuenta, p_oportunidad, btrim(p_empresa), nullif(btrim(coalesce(p_ruc, '')), ''), btrim(p_persona),
          nullif(regexp_replace(coalesce(p_dni, ''), '[^0-9A-Za-z]', '', 'g'), ''), nullif(btrim(coalesce(p_telefono, '')), ''),
          btrim(p_motivo), p_fecha, p_hora, v_quien, v_prueba, coalesce(p_showroom, false),
          nullif(btrim(coalesce(p_cotizacion_ref, '')), ''), coalesce(p_prender_tv, false), coalesce(p_infocorp, false))
  returning id into v_id;

  select coalesce(nombre, 'alguien') into v_nombre from perfiles where id = v_quien;
  v_cuando := to_char(p_fecha, 'DD/MM') || case when p_hora is not null then ' ' || to_char(p_hora, 'HH24:MI') else '' end;

  insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
  select p.id, 'visita_planta',
         format('Visita %s el %s · %s', case when coalesce(p_showroom, false) then 'al showroom' else 'a planta' end, v_cuando, btrim(p_empresa)),
         format('Viene %s%s. Motivo: %s.%s%s%s Lo registró %s. Imprímalo para vigilancia.',
                btrim(p_persona), case when p_dni is not null then ' (DNI ' || p_dni || ')' else '' end, btrim(p_motivo),
                case when coalesce(p_showroom, false) then ' Abrir la lavandería.' else '' end,
                case when coalesce(p_prender_tv, false) then ' Prender el TV.' else '' end,
                case when coalesce(p_infocorp, false) then ' Se solicita Infocorp.' else '' end,
                v_nombre),
         '/central/visitas'
    from perfiles p
   where p.rol = 'central' and p.activo and coalesce(p.es_prueba, false) = v_prueba;
  return v_id;
end $$;
revoke all on function public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time, uuid, boolean, text, boolean, boolean) from public;
grant execute on function public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time, uuid, boolean, text, boolean, boolean) to authenticated;
