-- 0583: «Cuenta sin nombre» → el nombre del cliente y de quién es la cartera
-- (Santos 22-10, pantallazo de Katerine con la Clínica Jesús del Norte).
--
-- Un expediente puede ser de un comercial y su ficha de otro: ventas e
-- históricos del Excel, derivaciones, reasignaciones de cartera (que no mueven
-- las ventas cerradas). La política cuentas_comercial solo deja leer la ficha
-- propia, así que el embed cuentas(...) volvía null y la pantalla ponía
-- «Cuenta sin nombre», sin decir por qué. Medido el 22-10: ~2.000 expedientes
-- así, ~220 vivos.
--
-- Esta función le devuelve al dueño del expediente lo mínimo para saber de qué
-- cliente se trata y a quién pedírselo: nombre, documento y la cartera donde
-- está. Nada de contactos, montos ni historial: eso sigue siendo de quien
-- tiene la ficha. Solo responde por expedientes de quien pregunta.

CREATE OR REPLACE FUNCTION public.fichas_de_otra_cartera(p_oportunidades uuid[])
 RETURNS TABLE (
   oportunidad_id uuid,
   cuenta_id uuid,
   razon_social text,
   nombre_comercial text,
   tipo_doc text,
   num_doc text,
   cartera_codigo text,
   cartera_nombre text
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o.id, c.id, c.razon_social, c.nombre_comercial, c.tipo_doc::text, c.num_doc,
         p.codigo_comercial, p.nombre
    from oportunidades o
    join cuentas c on c.id = o.cuenta_id
    left join perfiles p on p.id = c.comercial_id
   where o.id = any(p_oportunidades)
     and o.comercial_id = auth.uid()
     and c.comercial_id is distinct from auth.uid()
   limit 2000
$function$;

REVOKE ALL ON FUNCTION public.fichas_de_otra_cartera(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fichas_de_otra_cartera(uuid[]) TO authenticated;
