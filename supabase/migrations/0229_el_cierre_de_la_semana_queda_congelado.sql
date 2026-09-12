-- ============================================================
-- CRM EFAMEINSA · Migración 0229 · El cierre de la semana queda congelado
-- ============================================================
-- Carlos, 12-09: «este cierre debe guardarse como histórico en el CRM del
-- comercial». Hasta hoy el histórico (0177) guardaba lo DECLARADO —el
-- compromiso y las necesidades— y recalculaba lo vendido; pero el proyectado
-- y el «debe» de ese sábado no se guardaban en ningún lado, y el PDF se
-- regeneraba al vuelo. La proyección se arma con las oportunidades que HOY
-- tienen fecha de cierre, así que la de una semana pasada ya no se puede
-- reconstruir igual: el documento que gerencia leyó ese sábado se perdía.
--
-- Desde ahora, al cerrar la semana se congela la foto —proyectado, vendido,
-- diferencia, ventas, contactos, cotizaciones, perdidas— y se guarda el PDF
-- tal como salió (bucket «adjuntos», cierres-semana/<comercial>/<lunes>.pdf).
-- El histórico del comercial y el de gerencia muestran esa foto y abren ese
-- PDF, no uno recalculado.
-- ============================================================

alter table public.declaraciones_semana
  add column if not exists proyectado_usd  numeric,
  add column if not exists vendido_usd     numeric,
  add column if not exists diferencia_usd  numeric,
  add column if not exists ventas          integer,
  add column if not exists gestiones       integer,
  add column if not exists cotizaciones    integer,
  add column if not exists rechazos        integer,
  add column if not exists pdf_path        text,
  add column if not exists cerrado_at      timestamptz;

comment on column public.declaraciones_semana.proyectado_usd is
  'Lo proyectado para la semana tal como estaba al cerrarla (0229). La proyección viva cambia después; esto no.';
comment on column public.declaraciones_semana.pdf_path is
  'El PDF del cierre tal como salió ese sábado, en el bucket adjuntos (cierres-semana/<comercial>/<lunes>.pdf).';
