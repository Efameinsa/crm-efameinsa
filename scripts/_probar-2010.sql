-- Pruebas de las migraciones 0550-0557 (reunión 20-10), todo dentro de una
-- transacción que se deshace al final. Se corre con vmsql.mjs.
begin;
set local role authenticated;

-- 1. Brenda abre «Anotar gestión» en un cliente sin expediente y lo cierra sin guardar.
set local request.jwt.claims = '{"sub":"ed20331c-ab15-4268-be89-0136be34e58e","role":"authenticated"}';
select 'P1 expediente nuevo' as prueba, (select expediente_para_seguimiento('e5760db3-c2c8-490a-9dbb-e09078697f98')) is not null as ok;
select 'P1 se descarta vacío' as prueba,
       descartar_expediente_vacio((select id from oportunidades where cuenta_id = 'e5760db3-c2c8-490a-9dbb-e09078697f98' order by created_at desc limit 1)) as ok;
select 'P1 no quedó nada' as prueba, not exists (select 1 from oportunidades where cuenta_id = 'e5760db3-c2c8-490a-9dbb-e09078697f98') as ok;

-- 2. Cerrar un pedido de equipo sin puesta en marcha: la base lo frena.
do $$
begin
  update servicios_postventa set cerrado_at = now(), completado = true where id = '32e1ac6a-f225-4c88-8f59-5fc607744f8f';
  raise notice 'P2 FALLO: dejó cerrar sin puesta en marcha';
exception when others then
  raise notice 'P2 ok: %', sqlerrm;
end $$;

-- 3. Jhon (Finanzas) registra la nota de crédito de la E001-840 de Beneficencia.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ac9aa2c6-e569-4312-b65a-8e93e83c34e6","role":"authenticated"}';
select facturacion_registrar_nota_credito('1d1bd17c-9e96-41b0-bbc0-7019bfe176f3', 'b2885fb0-d0ed-46c8-bfff-5d1d133fdbcb', 'FC01-PRUEBA1', current_date, 'Se emitió en dólares (prueba)');
select 'P3 840 anulada' as prueba, (select anulada_at is not null from facturas_pedido where id = 'b2885fb0-d0ed-46c8-bfff-5d1d133fdbcb') as ok;
select 'P3 842 sigue vigente' as prueba, pedido_tiene_factura_vigente('1d1bd17c-9e96-41b0-bbc0-7019bfe176f3') as ok;

-- 4. Lernake: el caso abierto parecido es el del 29-09 (como Brenda, que ve los casos).
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ed20331c-ab15-4268-be89-0136be34e58e","role":"authenticated"}';
select 'P4 caso parecido' as prueba, (select codigo from atenciones where id = atencion_abierta_parecida(
  (select cuenta_id from atenciones where id = '3ac40ef4-2fe8-46d1-ad99-8108830c43b1'), 'problema_tecnico', null)) as codigo;

-- 5. Fichas repetidas (como gerencia/sin filtro).
select 'P5 grupos' as prueba, count(*) as n from fichas_repetidas(null);

-- 6. Brenda da la orden de recepción del caso de Lernake.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ed20331c-ab15-4268-be89-0136be34e58e","role":"authenticated"}';
select 'P6 recepción creada' as prueba, crear_recepcion_equipo('3ac40ef4-2fe8-46d1-ad99-8108830c43b1', 'Lavadora de prueba', null, 'garantia', 'cliente', null, 'prueba') is not null as ok;
select 'P6 Brenda la ve' as prueba, (select codigo from recepciones_equipo order by created_at desc limit 1) as codigo;
do $$
begin
  perform almacen_recepcion_paso((select id from recepciones_equipo order by created_at desc limit 1), 'recibido', null, '[{"path":"x"}]');
  raise notice 'P6 FALLO: postventa pudo registrar la llegada';
exception when others then
  raise notice 'P6 ok (postventa no registra la llegada): %', sqlerrm;
end $$;

rollback;
