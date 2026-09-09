-- ============================================================
-- CRM EFAMEINSA · Migración 0203 · El aviso ve al cliente con el teléfono sucio
-- ============================================================
-- La 0201 arregló el lado del CONTACTO QUE ENTRA: si Central tipea «1 956 181
-- 464», el CRM ya sabe leer ahí el 956181464. Falta el otro lado — que el
-- número esté sucio en la FICHA que ya existe.
--
-- Y está sucio en 204 contactos: «987524031 / 987524031», «989 001 284 // 942
-- 710 197», el número repetido o dos números en un solo campo. Esos contactos
-- son invisibles para el aviso de coincidencias de la bandeja, que compara la
-- columna `telefono_normalizado` con un `in(...)` exacto. Doce celulares
-- distintos quedan hoy repartidos entre fichas que no se reconocen entre sí.
--
-- Es el pendiente que Santos aprobó: «partir los teléfonos con dos números en
-- un campo al cruzar duplicados».
--
-- POR QUÉ UNA FUNCIÓN Y NO OTRA CONSULTA MÁS. El aviso corre mientras Central
-- TECLEA —«se reportan demoras al ingreso de bandeja», 28-08— así que no puede
-- pagarse un barrido de los 14.134 contactos en cada tecla. Acá se barren SOLO
-- los que tienen el teléfono sucio (559 de 14.134): los que lo tienen limpio ya
-- los encuentra el `in(...)` de siempre con los celulares que la 0201 extrae
-- del contacto que entra. Medido: 125 ms con un celular, 250 ms con trescientos.
--
-- ESTO NO DECIDE NADA. Devuelve candidatos para que el aviso los muestre y
-- Central compare —hay teléfonos compartidos de verdad: el contratista que
-- trabaja en dos hoteles, el número de una familia—. Quien une fichas es
-- Central, con «Es un cliente que ya tenemos» (0200).

create or replace function public.cuentas_por_celular(p_celulares text[])
returns table (cuenta_id uuid, celular text)
language sql
stable
security definer
set search_path = public
as $$
  select ct.cuenta_id, c.cel
    from contactos ct
    cross join lateral unnest(celulares_de(ct.telefono)) as c(cel)
   where ct.telefono is not null
     -- Solo los sucios: el limpio ya lo encuentra la búsqueda exacta de siempre.
     and coalesce(ct.telefono_normalizado, '') !~ '^9[0-9]{8}$'
     and c.cel = any(p_celulares);
$$;

comment on function public.cuentas_por_celular(text[]) is
  'Las fichas cuyo contacto lleva alguno de estos celulares ESCONDIDO dentro de un '
  'campo de teléfono sucio (0203). Complementa la búsqueda exacta; no decide nada.';

revoke all on function public.cuentas_por_celular(text[]) from public;
grant execute on function public.cuentas_por_celular(text[]) to authenticated;
