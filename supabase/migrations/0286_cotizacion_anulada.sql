-- ============================================================
-- CRM EFAMEINSA · Migración 0286 · Una cotización se puede anular
-- ============================================================
-- 23-09-2026, Katerine (C5), cliente JULCA GUEVARA YANET: vendió el 18-09
-- con la Presu_741-26 (USD 3,650 con IGV) y el informe de cierre 024-2026
-- salió por USD 3,850. Para que la cotización dijera lo mismo que el cierre
-- hizo la Presu_824-26 por USD 3,850 y le registró la venta: quedaron DOS
-- ventas del mismo equipo. Pidió «anular la de 4,307» (la 741).
--
-- No había cómo decirlo: el enum solo tenía borrador, enviada, aceptada,
-- perdida y vencida, y ninguna es verdad —no se perdió ni venció, la
-- reemplazó otra—. «anulada» es eso: el documento salió, sigue con su número
-- (el correlativo no se rellena, 03-09) y ya no vale. La tarjeta no ofrece
-- «Registrar venta» porque solo lo hace con «enviada».
--
-- El arreglo de los datos de ese caso va en scripts/anular-presu-741.mjs.
-- ============================================================

alter type estado_cotizacion add value if not exists 'anulada';
