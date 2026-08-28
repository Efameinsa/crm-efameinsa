-- ============================================================
-- CRM EFAMEINSA · Migración 0104 · La garantía del cierre de ventas
-- ============================================================
-- Pedido de Darwin el 28-08, el mismo día que la garantía pasó a imprimirse en
-- la cotización: «en cierre de ventas también que se pueda editar porque no
-- aparece».
--
-- Y no aparecía. En el informe de cierre la garantía existía como el PRIMER
-- renglón de la lista «Incluye» —el texto «36 meses de garantía», quemado en
-- INCLUYE_POR_DEFECTO—, y esa lista vive plegada dentro de «Ver y editar lo
-- prellenado»: el comercial emitía el documento sin haberla visto nunca, y
-- para cambiarla tenía que desplegar esa sección y editar una línea suelta
-- dentro de un textarea de cinco renglones. No era un campo, era un renglón de
-- texto.
--
-- Ahora es una columna propia, con su casilla a la vista en las condiciones de
-- venta y su línea rotulada en el PDF, igual que en la cotización
-- (`cotizaciones.garantia`, migración 0094).
--
-- ------------------------------------------------------------
-- POR QUÉ EL VALOR POR DEFECTO PASA DE 36 A 24 MESES
-- ------------------------------------------------------------
-- Los «36 meses de garantía» salieron de UN documento: el Word del que se
-- calcó el formato (INFORME OPEN Nº004-2026). Todo lo demás dice 24:
--   · el manual de postventa, «en los dos formatos de cierre» (docs/13 y el
--     comentario de la migración 0087),
--   · `equipos_instalados.garantia_hasta`, que se calcula con 24 meses por
--     defecto (0087) — o sea que el parque instalado ya venía contando 24
--     mientras el cierre prometía 36,
--   · la cotización que el cliente firmó.
-- Se unifica en 24 y, cuando el informe sale de una cotización del CRM, ni
-- siquiera se usa el valor por defecto: se hereda el que se le cotizó a ESE
-- cliente. Si gerencia confirma que la garantía comercial es de 36, se cambia
-- la constante en src/lib/informes.ts y listo.

alter table informes_cierre
  add column if not exists garantia text;

comment on column informes_cierre.garantia is
  'Garantía acordada, tal como va impresa en las condiciones de venta del informe
   (0104). Se hereda de la cotización cuando el cierre sale de una; NULL en los
   informes anteriores al 28-08, que la llevaban dentro de la lista «incluye».';
