-- 0577 · EL FILE SE ENCUENTRA POR EL RUC DE SU FICHA. Santos, 21-10, con
-- GRIJALVA COMPANY S.A.C. (20529228016): «¿por qué no lo pidió por el CRM? ¿no
-- figura en las búsquedas?». Por nombre sí salía; por RUC no, porque la fila del
-- inventario (cargada del Excel de files) no trae el documento aunque esté
-- enlazada a la ficha. Le pasaba a 695 de los 1988 files activos.
--
-- El buscador del inventario («por nombre o RUC») ahora mira también el RUC/DNI
-- de la ficha enlazada.

create or replace function public.buscar_inventario_files(p_q text)
 returns setof inventario_files
 language sql
 stable
 set search_path to 'public'
as $function$
  with palabras as (
    select w from regexp_split_to_table(
      translate(lower(btrim(coalesce(p_q, ''))), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9&]+') as w
     where length(w) > 0
  )
  select i.*
    from inventario_files i
    left join cuentas c on c.id = i.cuenta_id
   where i.activo
     and length(btrim(coalesce(p_q, ''))) >= 3
     and not exists (
       select 1 from palabras p
        where position(p.w in regexp_replace(translate(lower(i.nombre || ' ' || coalesce(i.documento, '') || ' ' || coalesce(c.num_doc, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9&]', '', 'g')) = 0)
   order by i.nombre, i.empresa, i.tipo, i.anio nulls first
   limit 40;
$function$;
