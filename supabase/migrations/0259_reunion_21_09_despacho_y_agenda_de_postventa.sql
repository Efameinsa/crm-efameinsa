-- 21-09-2026: reunión de Carlos con Lesly, Rubí y Gabriela (postventa) mirando
-- el CRM en vivo (transcripciones 10.06 y 10.31). Lo que toca a la base:
--
-- 1. Un pedido de repuesto o accesorio (el calderín de Malvich) no lleva plano
--    de preinstalación, y el circuito lo exigía: «que haya un check si tiene o
--    no plano; si no tiene, debería saltar el proceso».
-- 2. La apertura de despacho debe decir si la entrega es A DOMICILIO o EN
--    AGENCIA, y en agencia cuál (Cusco tiene seis). Hoy iba en la nota.
-- 3. Rubí pidió que su cuenta se llame «Postventa 1», para no confundir con
--    «Postventa 2» (Gabriela).

alter table servicios_postventa
  add column if not exists sin_plano boolean not null default false,
  add column if not exists sin_plano_motivo text,
  add column if not exists entrega_modo text check (entrega_modo in ('domicilio', 'agencia')),
  add column if not exists agencia_destino text;

comment on column servicios_postventa.sin_plano is 'Este pedido no lleva plano de preinstalación (repuesto, accesorio): el paso se salta (0259).';
comment on column servicios_postventa.entrega_modo is 'A domicilio o en agencia (0259). En agencia, agencia_destino dice cuál y a qué ciudad.';

update perfiles set nombre = 'Postventa 1' where codigo_comercial = 'PV' and nombre = 'Post Venta';
