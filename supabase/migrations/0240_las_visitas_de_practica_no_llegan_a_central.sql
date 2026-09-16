-- ============================================================
-- CRM EFAMEINSA · Migración 0240 · Las visitas de práctica no llegan a Central
-- ============================================================
-- 16-09, minutos después de desplegar la 0238. La verificación registró una
-- visita desde la cuenta de práctica de postventa; la Central real la vio en
-- su pantalla, la imprimió, y cuando la verificación borró su rastro «se
-- borró». La política de lectura dejaba ver a Central todas las visitas sin
-- mirar `es_prueba`, y el aviso salía a TODAS las Centrales. Mismo criterio
-- que el resto de las tablas: la serie de práctica no cruza a la real.
-- ============================================================

drop policy if exists visitas_planta_select on public.visitas_planta;
create policy visitas_planta_select on public.visitas_planta for select
  using (
    es_prueba = coalesce((select es_cuenta_prueba()), false)
    and (
      registrado_por = (select auth.uid())
      or (select es_backoffice())
      or (select rol_actual()) = 'central'
      or (select puede_postventa())
    )
  );

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
  p_oportunidad uuid default null
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

  insert into visitas_planta (cuenta_id, oportunidad_id, empresa, ruc, persona, dni, telefono, motivo, fecha, hora, registrado_por, es_prueba)
  values (p_cuenta, p_oportunidad, btrim(p_empresa), nullif(btrim(coalesce(p_ruc, '')), ''), btrim(p_persona),
          nullif(regexp_replace(coalesce(p_dni, ''), '[^0-9A-Za-z]', '', 'g'), ''), nullif(btrim(coalesce(p_telefono, '')), ''),
          btrim(p_motivo), p_fecha, p_hora, v_quien, v_prueba)
  returning id into v_id;

  select coalesce(nombre, 'alguien') into v_nombre from perfiles where id = v_quien;
  v_cuando := to_char(p_fecha, 'DD/MM') || case when p_hora is not null then ' ' || to_char(p_hora, 'HH24:MI') else '' end;

  -- Solo a las Centrales de la misma serie (real o práctica).
  insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
  select p.id, 'visita_planta',
         format('Visita a planta el %s · %s', v_cuando, btrim(p_empresa)),
         format('Viene %s%s. Motivo: %s. Lo registró %s. Imprímalo para vigilancia.',
                btrim(p_persona), case when p_dni is not null then ' (DNI ' || p_dni || ')' else '' end, btrim(p_motivo), v_nombre),
         '/central/visitas'
    from perfiles p
   where p.rol = 'central' and p.activo and coalesce(p.es_prueba, false) = v_prueba;
  return v_id;
end $$;
