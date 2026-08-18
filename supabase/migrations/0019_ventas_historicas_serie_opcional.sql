-- B11 pieza 4: la migración histórica de ventas (scripts/importar-ventas-
-- historicas.mjs) no tiene forma de saber si una venta pasada se facturó
-- por la serie EFAMEINSA o la serie OPEN — el número de presupuesto del
-- Excel histórico no lo revela y la numeración de Central es la del
-- sistema actual, no la histórica (decisión Darwin 2026-08-18: dejar en
-- blanco, se completa a mano si se identifica después).
--
-- El flujo normal (registrar_venta, migración 0005) SIEMPRE toma la serie
-- de la cotización y nunca inserta null — esto solo abre la puerta para
-- el backfill histórico, no cambia ninguna regla de negocio vigente.

alter table ventas alter column serie drop not null;
