-- ============================================================
-- CRM EFAMEINSA · Migración 0073 · Los repetidos se cuentan como repetidos
-- ============================================================
-- El 25-08 Central preguntó qué hacer con los contactos «que fueron
-- anteriormente derivados» y estaba a punto de descartarlos. Ahora tiene el
-- botón correcto y salen de la bandeja como 'duplicado' (ver
-- `marcarLeadYaGestionado`). Falta que ese estado se VEA en gerencia.
--
-- Sin esto, un contacto marcado repetido desaparecía de las dos columnas del
-- bloque «Contactos entrantes por origen»: no es asignado y no es descartado.
-- El total por campaña seguía siendo correcto, pero la diferencia quedaba sin
-- explicación — y una campaña con 60 contactos de los que 24 no aparecen en
-- ninguna columna se lee como una campaña que nadie atendió. Es exactamente el
-- malentendido que esta tanda de cambios vino a evitar, solo que una pantalla
-- más arriba.
--
-- Se agrega la columna en vez de sumar los repetidos a 'asignados' porque son
-- cosas distintas: el contacto llegó y costó plata (cuenta para el costo por
-- lead), pero no generó trabajo nuevo. Contarlo como asignado inflaría la
-- conversión de la campaña.

create or replace function leads_por_origen(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if not es_backoffice() and rol_actual() <> 'central' then
    raise exception 'No autorizado';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'clave', clave, 'n', n, 'asignados', asignados,
           'descartados', descartados, 'duplicados', duplicados
         ) order by n desc), '[]'::jsonb)
  into v
  from (
    select case when fuente in ('google_ads', 'meta_ads') then fuente
                else 'contacto_' || canal::text end as clave,
           count(*) as n,
           count(*) filter (where estado = 'asignado' or asignado_a is not null) as asignados,
           count(*) filter (where estado = 'descartado') as descartados,
           count(*) filter (where estado = 'duplicado') as duplicados
    from leads
    where recibido_at::date between p_desde and p_hasta
    group by 1
  ) x;

  return v;
end $$;

revoke all on function leads_por_origen(date, date) from public;
grant execute on function leads_por_origen(date, date) to authenticated;
