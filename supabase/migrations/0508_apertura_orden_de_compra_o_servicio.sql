-- 16-10-2026: orden de compra u orden de servicio en la apertura (Rubí, buzón:
-- «Después de "SERVICIO A REALIZAR" debe estar para seleccionar ORDEN DE
-- COMPRA U ORDEN DE SERVICIO»). Va en la fila 2 de la hoja. Sin elegir, si el
-- cierre trae su OC sale esa como orden de compra; si no, «—».

alter table servicios_postventa add column if not exists apertura_orden_tipo text;
alter table servicios_postventa add column if not exists apertura_orden_numero text;

alter table servicios_postventa drop constraint if exists servicios_postventa_apertura_orden_tipo_check;
alter table servicios_postventa add constraint servicios_postventa_apertura_orden_tipo_check
  check (apertura_orden_tipo is null or apertura_orden_tipo in ('compra', 'servicio', 'sin'));

comment on column servicios_postventa.apertura_orden_tipo is 'Fila 2 de la apertura (0508): compra = orden de compra, servicio = orden de servicio, sin = el cliente no emitió orden. Null = sin elegir (sale la OC del cierre, si la hay).';
comment on column servicios_postventa.apertura_orden_numero is 'Número de la orden de compra o de servicio de la fila 2 de la apertura (0508).';
