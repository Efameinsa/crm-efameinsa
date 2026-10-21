-- Une las fichas PARECIDAS al 100 % (Santos 21-10-2026): «todas las que tienen 100 %
-- los puedes juntar, a excepción de los WhatsApps (los que tienen solo un nombre);
-- el resto que tenga dos palabras (nombre y apellido o dos nombres) sí».
-- Se queda: la que tiene documento; si no, la que tiene cartera; si no, la de más
-- movimiento; si no, la más antigua. Si la que se queda no tiene cartera y la otra
-- sí, la cartera pasa a la que se queda. Cada unión pasa por fusionar_cuentas como
-- Administrador (queda en el registro de acciones y se puede deshacer).
-- Termina en ROLLBACK: cámbielo por COMMIT para aplicar.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '7903ef3b-b139-4fa9-aaec-83f172ae7c69', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '7903ef3b-b139-4fa9-aaec-83f172ae7c69', true);

create temp table _pares on commit drop as
select f.cuenta_a, f.cuenta_b
  from fichas_parecidas f
  join cuentas ca on ca.id = f.cuenta_a and ca.fusionada_en is null and ca.archivada_at is null
  join cuentas cb on cb.id = f.cuenta_b and cb.fusionada_en is null and cb.archivada_at is null
 where f.porcentaje = 100
   and not exists (select 1 from fichas_no_repetidas n where n.clave = 'par:' || f.cuenta_a || ':' || f.cuenta_b)
   and array_length(regexp_split_to_array(btrim(nombre_normalizado(ca.razon_social)), '\s+'), 1) >= 2
   and array_length(regexp_split_to_array(btrim(nombre_normalizado(cb.razon_social)), '\s+'), 1) >= 2;

do $$
declare
  g record; a uuid; b uuid; d uuid; o uuid; v_pin text; n int := 0; saltadas int := 0;
  ra cuentas%rowtype; rb cuentas%rowtype; ma int; mb int;
begin
  for g in select * from _pares loop
    -- Lo que ya se unió en esta corrida apunta a su ficha final.
    a := g.cuenta_a; b := g.cuenta_b;
    loop select fusionada_en into d from cuentas where id = a; exit when d is null; a := d; end loop;
    loop select fusionada_en into d from cuentas where id = b; exit when d is null; b := d; end loop;
    if a = b then saltadas := saltadas + 1; continue; end if;
    select * into ra from cuentas where id = a;
    select * into rb from cuentas where id = b;
    -- Documentos distintos: no son el mismo (puede pasar tras unir otras).
    if clave_documento(ra.num_doc) is not null and clave_documento(rb.num_doc) is not null
       and clave_documento(ra.num_doc) <> clave_documento(rb.num_doc) then saltadas := saltadas + 1; continue; end if;
    ma := (select count(*) from oportunidades where cuenta_id = a) + (select count(*) from servicios_postventa where cuenta_id = a) + (select count(*) from atenciones where cuenta_id = a);
    mb := (select count(*) from oportunidades where cuenta_id = b) + (select count(*) from servicios_postventa where cuenta_id = b) + (select count(*) from atenciones where cuenta_id = b);
    if (clave_documento(ra.num_doc) is not null) <> (clave_documento(rb.num_doc) is not null) then
      d := case when clave_documento(ra.num_doc) is not null then a else b end;
    elsif (ra.comercial_id is not null) <> (rb.comercial_id is not null) then
      d := case when ra.comercial_id is not null then a else b end;
    elsif ma <> mb then
      d := case when ma > mb then a else b end;
    else
      d := case when ra.created_at <= rb.created_at then a else b end;
    end if;
    o := case when d = a then b else a end;
    v_pin := codigo_pin_supervisor('7903ef3b-b139-4fa9-aaec-83f172ae7c69'::uuid, ventana_pin_actual());
    perform fusionar_cuentas(o, d, v_pin,
      'Mismo cliente: el nombre coincide al 100 % en «Fichas parecidas» (Santos 21-10: unir las de 100 % con nombre y apellido).');
    -- La cartera no se pierde si la que se queda no tenía.
    update cuentas c set comercial_id = x.comercial_id, cartera_desde = coalesce(c.cartera_desde, x.cartera_desde)
      from cuentas x where c.id = d and x.id = o and c.comercial_id is null and x.comercial_id is not null;
    n := n + 1;
  end loop;
  raise notice 'Unidas: % · saltadas (ya juntas o con documentos distintos): %', n, saltadas;
end $$;

select 'QUEDAN_100_DOS_PALABRAS', count(*)
  from fichas_parecidas f
  join cuentas ca on ca.id = f.cuenta_a and ca.fusionada_en is null
  join cuentas cb on cb.id = f.cuenta_b and cb.fusionada_en is null
 where f.porcentaje = 100
   and array_length(regexp_split_to_array(btrim(nombre_normalizado(ca.razon_social)), '\s+'), 1) >= 2
   and array_length(regexp_split_to_array(btrim(nombre_normalizado(cb.razon_social)), '\s+'), 1) >= 2;
rollback;
