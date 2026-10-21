-- Une las fichas de la MISMA persona o empresa por documento (reunión 20-10-2026 15:45).
-- Gerencia: «eliminemos los duplicados ahorita y eso nos quita muchos más problemas».
-- Santos: «solamente validamos que todos se han duplicado… de un porrazo… pero hay
-- algunos que tienen poca coincidencia, tienen que ver ustedes».
--
-- Aquí solo entra lo que el documento valida solo:
--   · el DNI dentro del RUC 10 de la misma persona (10 + DNI + dígito), y
--   · el mismo RUC/DNI escrito en dos fichas.
-- Lo que coincide solo por nombre queda en «Fichas repetidas» para Central.
--
-- Se queda la ficha con RUC (la del comprobante); entre iguales, la de más
-- movimiento. Pasa por `fusionar_cuentas` como Administrador, así cada unión
-- queda en el registro de acciones y se puede deshacer clic por clic.
-- Correr con: node vmsql.mjs scripts/_unir-misma-persona-2010.sql   (y en la nube igual)
-- Sin «commit» al final no queda nada: cambie el rollback por commit para aplicar.

begin;
select set_config('request.jwt.claims', json_build_object('sub', '7903ef3b-b139-4fa9-aaec-83f172ae7c69', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '7903ef3b-b139-4fa9-aaec-83f172ae7c69', true);

create temp table _grupos on commit drop as
with base as (
  select c.id, c.razon_social, c.tipo_doc, c.num_doc, clave_documento(c.num_doc) as clave,
         (select count(*) from oportunidades o where o.cuenta_id = c.id)
       + (select count(*) from servicios_postventa s where s.cuenta_id = c.id)
       + (select count(*) from atenciones a where a.cuenta_id = c.id) as movimiento
    from cuentas c
   where c.fusionada_en is null and c.archivada_at is null and clave_documento(c.num_doc) is not null
     -- las instituciones con sedes bajo un mismo RUC (0158) no son duplicados
     and c.cuenta_padre_id is null and not coalesce(c.sedes_por_ruc, false)
     and not exists (select 1 from cuentas h where h.cuenta_padre_id = c.id)
), grupos as (
  select clave from base group by clave having count(*) > 1
), ordenado as (
  select b.*, row_number() over (partition by b.clave order by (b.tipo_doc = 'RUC') desc, b.movimiento desc, b.id) as n
    from base b join grupos g using (clave)
)
select o.clave, o.id as origen, d.id as destino, o.razon_social as origen_nombre, o.num_doc as origen_doc,
       d.razon_social as destino_nombre, d.num_doc as destino_doc
  from ordenado o join ordenado d on d.clave = o.clave and d.n = 1
 where o.n > 1
   -- Y el nombre lo confirma: comparten al menos DOS palabras de 4 letras o más
   -- (nombre y apellido, o los dos apellidos). Con una sola, puede ser el padre
   -- y el hijo (TRUJILLO MEDRANO / TRUJILLO CHOCCA). Si el documento coincide pero los nombres no tienen nada que
   -- ver, puede ser un RUC mal escrito: eso lo revisa una persona en
   -- «Fichas repetidas».
   and 2 <= (
     select count(distinct t)
       from regexp_split_to_table(lower(o.razon_social), '[^a-zñáéíóú]+') t
      where length(t) >= 4
        and t in (select regexp_split_to_table(lower(d.razon_social), '[^a-zñáéíóú]+'))
        and t not in ('lavanderia', 'lavandería', 'hotel', 'hostal', 'empresa', 'servicios', 'inversiones', 'comercial', 'asociacion', 'asociación')
   );

-- Los que el documento junta pero el nombre no confirma: quedan para una persona.
select 'REVISAR_A_MANO', o.razon_social, o.num_doc, '?', d.razon_social, d.num_doc
  from cuentas o join cuentas d on clave_documento(d.num_doc) = clave_documento(o.num_doc) and d.id <> o.id
 where o.fusionada_en is null and d.fusionada_en is null and o.archivada_at is null and d.archivada_at is null
   and o.num_doc ~ '^[0-9]{8}$' and d.num_doc ~ '^10[0-9]{9}$'
   and o.id not in (select origen from _grupos);

-- Respaldo legible de lo que se va a unir.
select 'VA_A_UNIR', clave, origen_nombre, origen_doc, '→', destino_nombre, destino_doc from _grupos order by clave;

do $$
declare g record; v_pin text; n int := 0;
begin
  for g in select * from _grupos loop
    v_pin := codigo_pin_supervisor('7903ef3b-b139-4fa9-aaec-83f172ae7c69'::uuid, ventana_pin_actual());
    perform fusionar_cuentas(g.origen, g.destino, v_pin,
      format('Es la misma %s: %s %s y %s %s (reunión de gerencia 20-10: unir los duplicados por documento).',
             case when g.destino_doc ~ '^10' or g.origen_doc ~ '^[0-9]{8}$' then 'persona' else 'empresa' end,
             'documento', g.origen_doc, 'documento', g.destino_doc));
    n := n + 1;
  end loop;
  raise notice 'Unidas: %', n;
end $$;

select 'QUEDAN_GRUPOS_POR_DOC', count(*) from (select clave_documento(num_doc) k from cuentas where fusionada_en is null and archivada_at is null and clave_documento(num_doc) is not null group by 1 having count(*) > 1) x;
rollback;
