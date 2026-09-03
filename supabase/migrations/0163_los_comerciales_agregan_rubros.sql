-- ============================================================
-- CRM EFAMEINSA · Migración 0163 · Los comerciales agregan rubros
-- ============================================================
-- Santos, 03-09, con la foto del desplegable de rubro en la mano: «los
-- comerciales deben de poder agregar rubros». Hoy el desplegable ofrece ocho
-- palabras (Hotel, Clínica, Educación, Textil, Lavandería, Minería,
-- Restaurante, Otro) y cuando el cliente no cabe en ninguna el gestor lo manda
-- a «Otro», que ya carga 1.550 clientes: es el rubro que menos dice.
--
-- Escribir en `catalogo_rubros` era de operaciones y gerencia (0118). Abrir la
-- tabla entera al comercial no conviene —renombrar o retirar sigue siendo de
-- quien mantiene la lista—, así que se abre UNA puerta: esta función, que solo
-- sabe agregar y que antes de agregar busca si ya existe.
--
-- Lo que evita:
--   · Duplicados por mayúsculas o tildes: «minería», «MINERIA» y «Minería /
--     Campamento» son el mismo rubro. La comparación se hace sobre una clave
--     sin tildes ni mayúsculas (no hay `unaccent` en esta base; se traduce a
--     mano) y un índice único la respalda para que tampoco entren por la
--     pantalla de catálogos.
--   · Perder la pista: cada rubro nuevo queda con quién lo agregó y cuándo,
--     y la pantalla de catálogos lo muestra para que Lesly pueda unificar o
--     renombrar lo que haga falta.
--   · Resucitar sin querer: si el rubro existía pero estaba retirado, vuelve a
--     la lista (el gestor lo necesita) y la función avisa que se reactivó.
-- ============================================================

alter table catalogo_rubros
  add column if not exists creado_por uuid references perfiles (id),
  add column if not exists creado_at  timestamptz;

comment on column catalogo_rubros.creado_por is 'Quién lo agregó desde la ficha del cliente (0163). Null = vino con el sistema o lo puso operaciones.';

-- ------------------------------------------------------------
-- La clave con la que dos nombres se consideran el mismo rubro.
create or replace function rubro_clave(p_nombre text)
returns text
language sql
immutable
as $fn$
  select lower(translate(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')),
                         'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))
$fn$;

create unique index if not exists ux_catalogo_rubros_clave on catalogo_rubros (rubro_clave(nombre));

-- ------------------------------------------------------------
create or replace function agregar_rubro(p_nombre text)
returns table (rubro_id integer, rubro_nombre text, nuevo boolean, reactivado boolean)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_fila   catalogo_rubros%rowtype;
begin
  if auth.uid() is null or not exists (select 1 from perfiles p where p.id = auth.uid() and p.activo) then
    raise exception 'Solo un usuario activo del CRM puede agregar rubros';
  end if;
  if length(v_nombre) < 3 then
    raise exception 'El rubro necesita al menos tres letras';
  end if;
  if length(v_nombre) > 40 then
    raise exception 'El rubro es muy largo: hasta 40 letras, como se va a leer en el desplegable';
  end if;

  select * into v_fila from catalogo_rubros r where rubro_clave(r.nombre) = rubro_clave(v_nombre);
  if found then
    if not v_fila.activo then
      update catalogo_rubros set activo = true where id = v_fila.id;
      return query select v_fila.id, v_fila.nombre, false, true;
    else
      return query select v_fila.id, v_fila.nombre, false, false;
    end if;
    return;
  end if;

  -- Se guarda como se va a leer: primera letra en mayúscula, el resto tal cual
  -- lo escribió el gestor («Agroindustria», «Pesquería / Conservas»).
  v_nombre := upper(left(v_nombre, 1)) || substr(v_nombre, 2);
  insert into catalogo_rubros (nombre, activo, creado_por, creado_at)
  values (v_nombre, true, auth.uid(), now())
  returning * into v_fila;
  return query select v_fila.id, v_fila.nombre, true, false;
end;
$fn$;

revoke all on function agregar_rubro(text) from public;
grant execute on function agregar_rubro(text) to authenticated;

comment on function agregar_rubro(text) is
  'Agrega un rubro desde la ficha del cliente (0163). Cualquier usuario activo. Si ya existe (sin mirar mayúsculas ni tildes) devuelve el existente; si estaba retirado lo reactiva.';

-- ------------------------------------------------------------
-- La pantalla de catálogos ahora dice quién agregó cada rubro y cuándo. Cambia
-- el tipo de retorno, así que hay que recrear la función.
drop function if exists uso_de_listas();
create or replace function uso_de_listas()
returns table (lista text, id text, codigo text, nombre text, activo boolean, usos bigint, agregado_por text, creado_at timestamptz)
language sql stable security definer set search_path = public as $fn$
  select 'rubros', r.id::text, null, r.nombre, r.activo,
         (select count(*) from cuentas c where c.rubro_id = r.id),
         (select coalesce(p.codigo_comercial, p.nombre) from perfiles p where p.id = r.creado_por),
         r.creado_at
    from catalogo_rubros r
  union all
  select 'motivos', m.id::text, null, m.nombre, m.activo,
         (select count(*) from oportunidades o where o.motivo_rechazo_id = m.id),
         null, null
    from catalogo_motivos_rechazo m
  union all
  select 'resultados', g.id::text, g.codigo, g.nombre, g.activo,
         (select count(*) from actividades a where a.resultado_id = g.id),
         null, null
    from catalogo_resultados_gestion g;
$fn$;

revoke all on function uso_de_listas() from public;
grant execute on function uso_de_listas() to authenticated;
