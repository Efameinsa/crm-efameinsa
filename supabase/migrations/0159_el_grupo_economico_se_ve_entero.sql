-- ============================================================
-- CRM EFAMEINSA · Migración 0159 · El grupo económico se ve entero
-- ============================================================
-- Santos, 02-09: «analiza cómo se envió para que corrijas si hay algo que
-- corregir en la vista de postventa o de quien corresponda». Al abrir la
-- ficha del Hospital del Altiplano (Puno), Katerine NO veía que ahora es una
-- sede de ESSALUD (0158): `grupo_economico` corre con los permisos de quien
-- pregunta, y la RLS de `cuentas` solo le deja ver SUS fichas. La madre
-- (sin dueño) y las sedes de otros no existían para ella, así que la
-- sección «Sedes de la institución» no aparecía. Lo mismo le pasaba desde
-- la 0052 a cualquier comercial cuyo grupo tenga fichas en otra cartera —
-- justo el caso para el que existe la sección.
--
-- CÓMO. La función queda en dos partes: la de siempre comprueba, con la RLS
-- del que pregunta, que esa persona puede ver la ficha por la que pregunta;
-- y recién entonces llama a una versión `security definer` que lista a
-- toda la familia. Nadie ve un grupo por adivinar un id: tiene que poder
-- abrir una de sus fichas. Lo que se devuelve de las hermanas es lo que ya
-- devolvía la 0052: nombre, RUC, comercial, compras y cotizaciones; nada de
-- contactos ni de gestiones.
-- ============================================================

create or replace function grupo_economico_def(p_cuenta_id uuid)
returns table(id uuid, razon_social text, num_doc text, es_madre boolean, es_esta boolean, comercial text, ventas bigint, monto numeric, cotizaciones bigint)
language sql
security definer
set search_path = public
stable
as $fn$
  with raiz as (
    select coalesce(c.cuenta_padre_id, c.id) id from cuentas c where c.id = p_cuenta_id
  ),
  miembros as (
    select c.* from cuentas c, raiz r where c.id = r.id or c.cuenta_padre_id = r.id
  )
  select m.id,
         m.razon_social,
         m.num_doc,
         m.cuenta_padre_id is null,
         m.id = p_cuenta_id,
         p.nombre,
         (select count(*) from ventas v join oportunidades o on o.id = v.oportunidad_id where o.cuenta_id = m.id),
         (select coalesce(sum(v.monto_total), 0) from ventas v join oportunidades o on o.id = v.oportunidad_id where o.cuenta_id = m.id),
         (select count(*) from cotizaciones_historicas ch where ch.cuenta_id = m.id)
  from miembros m
  left join perfiles p on p.id = m.comercial_id
  order by (m.cuenta_padre_id is null) desc, m.razon_social;
$fn$;

revoke all on function grupo_economico_def(uuid) from public;

comment on function grupo_economico_def(uuid) is
  'La familia completa de una ficha (madre y hermanas), sin RLS. Solo la llama grupo_economico(), que antes comprueba que quien pregunta puede ver la ficha (0159).';

create or replace function grupo_economico(p_cuenta_id uuid)
returns table(id uuid, razon_social text, num_doc text, es_madre boolean, es_esta boolean, comercial text, ventas bigint, monto numeric, cotizaciones bigint)
language sql
security invoker
set search_path = public
stable
as $fn$
  -- Con la RLS del que pregunta: si no puede ver esta ficha, no hay grupo.
  select g.*
    from grupo_economico_def(p_cuenta_id) g
   where exists (select 1 from cuentas c where c.id = p_cuenta_id);
$fn$;

comment on function grupo_economico(uuid) is
  'Empresa madre y hermanas de una ficha, con lo que compró cada una (0052). Desde la 0159 muestra la familia entera aunque las hermanas estén en otra cartera, siempre que quien pregunta pueda ver la ficha por la que pregunta.';
