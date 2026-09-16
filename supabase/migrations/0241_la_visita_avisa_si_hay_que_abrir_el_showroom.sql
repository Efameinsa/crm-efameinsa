-- ============================================================
-- CRM EFAMEINSA · Migración 0241 · La visita dice si hay que abrir el showroom
-- ============================================================
-- El formato de visita de Lesly (T:\formatos para santos, 16-09) es un correo
-- del comercial a Central, Almacén y Logística con CC a gerencia: FECHA ·
-- HORA · DATOS DEL PROSPECTO · VISITANTES (nombre y DNI) · OBSERVACIÓN, y el
-- pedido «por favor aperturar la lavandería». El CRM manda ese mismo correo
-- al registrar la visita; el check de la lavandería (showroom) es lo único
-- que faltaba en la tabla.
-- ============================================================
alter table public.visitas_planta add column if not exists showroom boolean not null default false;
comment on column public.visitas_planta.showroom is 'Hay que abrir la lavandería (showroom) para la visita (0241).';

drop function if exists public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time, uuid);
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
  p_showroom boolean default false
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

  insert into visitas_planta (cuenta_id, oportunidad_id, empresa, ruc, persona, dni, telefono, motivo, fecha, hora, registrado_por, es_prueba, showroom)
  values (p_cuenta, p_oportunidad, btrim(p_empresa), nullif(btrim(coalesce(p_ruc, '')), ''), btrim(p_persona),
          nullif(regexp_replace(coalesce(p_dni, ''), '[^0-9A-Za-z]', '', 'g'), ''), nullif(btrim(coalesce(p_telefono, '')), ''),
          btrim(p_motivo), p_fecha, p_hora, v_quien, v_prueba, coalesce(p_showroom, false))
  returning id into v_id;

  select coalesce(nombre, 'alguien') into v_nombre from perfiles where id = v_quien;
  v_cuando := to_char(p_fecha, 'DD/MM') || case when p_hora is not null then ' ' || to_char(p_hora, 'HH24:MI') else '' end;

  insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
  select p.id, 'visita_planta',
         format('Visita a planta el %s · %s', v_cuando, btrim(p_empresa)),
         format('Viene %s%s. Motivo: %s.%s Lo registró %s. Imprímalo para vigilancia.',
                btrim(p_persona), case when p_dni is not null then ' (DNI ' || p_dni || ')' else '' end, btrim(p_motivo),
                case when coalesce(p_showroom, false) then ' Hay que abrir la lavandería.' else '' end, v_nombre),
         '/central/visitas'
    from perfiles p
   where p.rol = 'central' and p.activo and coalesce(p.es_prueba, false) = v_prueba;
  return v_id;
end $$;
revoke all on function public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time, uuid, boolean) from public;
grant execute on function public.registrar_visita_planta(uuid, text, text, text, text, text, text, date, time, uuid, boolean) to authenticated;
