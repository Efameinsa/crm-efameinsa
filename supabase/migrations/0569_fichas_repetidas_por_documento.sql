-- 0569 · «Fichas repetidas» también por documento: el DNI y el RUC 10 de la misma persona
--
-- Reunión del 20-10-2026 15:45, Lino Espíritu: una ficha con DNI 44224120
-- (la abrió una comercial el 12-10) y otra con RUC 10442241207; cada una con
-- su caso abierto por la misma secadora. Gerencia: «volvemos a lo mismo… la
-- desigualdad de dos fichas… eliminemos los duplicados ahorita».
--
-- La 0556 agrupaba solo por nombre y descartaba los grupos donde más de una
-- ficha tenía documento, así que este par nunca salía. Al 20-10 había 40
-- pares DNI ⇄ RUC 10 y 3 grupos con el mismo RUC/DNI.
--
-- Ahora la lista suma los grupos por documento (clave «doc:<DNI o RUC>»): el
-- mismo número, o el DNI que está dentro de un RUC 10 (10 + DNI + dígito).

create or replace function public.clave_documento(p_num_doc text)
returns text language sql immutable as $$
  select case
    when p_num_doc ~ '^10[0-9]{9}$' then substr(p_num_doc, 3, 8)
    when p_num_doc ~ '^[0-9]{8}$' then p_num_doc
    when p_num_doc ~ '^[0-9]{11}$' then p_num_doc
  end
$$;

create or replace function public.fichas_repetidas(p_solo_comercial uuid default null)
returns table (clave text, cuentas jsonb)
language sql stable security definer set search_path = public as $$
  with base as (
    select c.id, c.razon_social, c.tipo_doc, c.num_doc, c.comercial_id, c.created_at,
           nombre_normalizado(c.razon_social) as clave_nombre,
           clave_documento(c.num_doc) as clave_doc,
           (select count(*) from oportunidades o where o.cuenta_id = c.id) as expedientes,
           (select count(*) from servicios_postventa s where s.cuenta_id = c.id) as pedidos,
           (select count(*) from atenciones a where a.cuenta_id = c.id) as casos,
           (select count(*) from informes_cierre i where i.cuenta_id = c.id) as cierres
      from cuentas c
     where c.archivada_at is null and c.fusionada_en is null and c.cuenta_padre_id is null
  ), por_nombre as (
    select b.clave_nombre as clave
      from base b
     where length(b.clave_nombre) >= 6
     group by b.clave_nombre
    having count(*) > 1
       and sum(b.expedientes + b.pedidos + b.casos + b.cierres) > 0
       and count(*) filter (where b.tipo_doc <> 'SIN_DOC' and b.num_doc is not null) <= 1
  ), por_doc as (
    -- 0569: el mismo documento, o el DNI dentro del RUC 10 de la misma persona.
    select 'doc:' || b.clave_doc as clave, b.clave_doc
      from base b
     where b.clave_doc is not null
     group by b.clave_doc
    having count(*) > 1
  ), miembros as (
    select n.clave, b.* from por_nombre n join base b on b.clave_nombre = n.clave
    union all
    select d.clave, b.* from por_doc d join base b on b.clave_doc = d.clave_doc
  )
  select m.clave,
         jsonb_agg(jsonb_build_object(
           'id', m.id, 'razon_social', m.razon_social, 'documento', case when m.tipo_doc <> 'SIN_DOC' then m.num_doc end,
           'comercial', (select coalesce(p.codigo_comercial || ' ', '') || p.nombre from perfiles p where p.id = m.comercial_id),
           'comercial_id', m.comercial_id,
           'expedientes', m.expedientes, 'pedidos', m.pedidos, 'casos', m.casos, 'cierres', m.cierres,
           'creada', m.created_at
         ) order by (m.tipo_doc = 'RUC') desc, (m.tipo_doc <> 'SIN_DOC') desc, (m.expedientes + m.pedidos + m.casos + m.cierres) desc)
    from miembros m
   where not exists (select 1 from fichas_no_repetidas n where n.clave = m.clave)
     and (p_solo_comercial is null or exists (select 1 from miembros x where x.clave = m.clave and x.comercial_id = p_solo_comercial))
   group by m.clave
   order by (m.clave like 'doc:%') desc, m.clave
$$;
revoke all on function public.fichas_repetidas(uuid) from public;
grant execute on function public.fichas_repetidas(uuid) to authenticated;
