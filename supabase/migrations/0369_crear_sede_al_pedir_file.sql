-- ============================================================
-- CRM EFAMEINSA · Migración 0369 · Crear la sede al pedir un file
-- ============================================================
-- Gerencia, 02-10: MINSA, la Marina de Guerra y ESSALUD comparten UN RUC entre
-- postas, hospitales y bases que son entidades distintas. Rubí buscó por el
-- RUC de la Marina para pedir un file a Central y no encontró el que quería:
-- la sede existe como ficha solo si Central ya derivó un contacto de ella
-- (0158), y el buscador de Files no distinguía una sede de otra.
--
-- Esta función deja que quien pide el file (cualquier área) escriba el nombre
-- de la sede y la ficha se cree colgada de la institución, con su mismo RUC y
-- SIN dueño (igual que cuando la crea Central al derivar). Si ya hay una sede
-- con ese nombre —escrito con otras tildes o signos— devuelve esa, no duplica.
-- Solo sirve para las instituciones marcadas `sedes_por_ruc` (las tres que
-- nombró gerencia); para cualquier otra empresa se niega.
-- ============================================================

create or replace function crear_sede_para_file(p_madre uuid, p_nombre text)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_madre cuentas%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  if nombre_normalizado(p_nombre) = '' then
    raise exception 'Escriba el nombre de la sede';
  end if;
  select * into v_madre from cuentas where id = p_madre;
  if v_madre.id is null or not v_madre.sedes_por_ruc or v_madre.cuenta_padre_id is not null then
    raise exception 'Esa ficha no es una institución con sedes bajo un mismo RUC';
  end if;
  return sede_para_lead(v_madre.id, p_nombre, true);
end;
$fn$;

revoke all on function crear_sede_para_file(uuid, text) from public;
grant execute on function crear_sede_para_file(uuid, text) to authenticated;

comment on function crear_sede_para_file(uuid, text) is
  'Crea (o devuelve si ya existe) la sede de una institución con sedes_por_ruc para poder pedir su file (0369). Cualquier usuario autenticado; solo para madres marcadas por gerencia.';
