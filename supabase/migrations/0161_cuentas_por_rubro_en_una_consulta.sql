-- ============================================================
-- CRM EFAMEINSA · Migración 0161 · Los conteos por rubro, en una sola consulta
-- ============================================================
-- Santos, 02-09: «pequeños tirones» al navegar. Medido: «Mi cartera» era la
-- pantalla más lenta (1,0 s con el servidor caliente) y la razón estaba en el
-- filtro de rubros: para pintar «Hotel (2.214) · Otro (1.550) · … · Sin rubro
-- (6.858)» hacía UNA consulta de conteo POR RUBRO —nueve idas y vueltas— en
-- cada carga. Esta función devuelve todos los conteos de un viaje.
--
-- Corre con los permisos de quien pregunta (security invoker): la RLS de
-- `cuentas` sigue mandando, así que un comercial solo cuenta su cartera aunque
-- pase otro `p_comercial`. Gerencia y Central cuentan todo.
-- ============================================================

create or replace function cuentas_por_rubro(p_comercial uuid default null)
returns table (rubro_id integer, n bigint)
language sql
stable
security invoker
set search_path = public
as $fn$
  select c.rubro_id, count(*)::bigint
    from cuentas c
   where (p_comercial is null or c.comercial_id = p_comercial)
   group by c.rubro_id
$fn$;

revoke all on function cuentas_por_rubro(uuid) from public;
grant execute on function cuentas_por_rubro(uuid) to authenticated;

comment on function cuentas_por_rubro(uuid) is
  'Cuántos clientes hay por rubro (null = sin rubro) en una cartera o en toda la empresa, en una sola consulta (0161). Respeta la RLS de cuentas.';
