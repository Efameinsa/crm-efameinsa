-- El bloque "Contactos entrantes por origen" de /gerencia/marketing contaba
-- trayendo las filas de leads del período al servidor Next (tope de 1.000 de
-- supabase-js). Con los ~39.000 leads históricos de Central (2019-2026)
-- importados el 19-08, cualquier rango largo quedaba truncado en silencio.
-- La agregación pasa a Postgres, mismo patrón que resumen_gerencia (0021):
-- SECURITY DEFINER + autorización explícita (solo backoffice y central).
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
           'clave', clave, 'n', n, 'asignados', asignados, 'descartados', descartados
         ) order by n desc), '[]'::jsonb)
  into v
  from (
    select case when fuente in ('google_ads', 'meta_ads') then fuente
                else 'contacto_' || canal::text end as clave,
           count(*) as n,
           count(*) filter (where estado = 'asignado' or asignado_a is not null) as asignados,
           count(*) filter (where estado = 'descartado') as descartados
    from leads
    where recibido_at::date between p_desde and p_hasta
    group by 1
  ) x;

  return v;
end $$;

revoke all on function leads_por_origen(date, date) from public;
grant execute on function leads_por_origen(date, date) to authenticated;
