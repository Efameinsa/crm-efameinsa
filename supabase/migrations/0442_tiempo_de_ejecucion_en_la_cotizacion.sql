-- ============================================================
-- CRM EFAMEINSA · Migración 0442 · «Tiempo de ejecución» propio en la
-- cotización de postventa
-- ============================================================
-- Gabriela (PV2), 12-10-2026: «Colocar un ítem de tiempo de ejecución después
-- de forma de pago». El campo «Tiempo de entrega» (cuándo se atiende:
-- «Inmediata») salía en el PDF de postventa rotulado «Tiempo de ejecución», y
-- lo que dura el trabajo («1 día») lo escribía a mano en la nota. Ahora tiene
-- su columna; el PDF lo imprime después de la forma de pago. Se guarda con el
-- mismo UPDATE que las demás condiciones (no pasa por crear/editar_cotizacion).
-- ============================================================

alter table public.cotizaciones add column if not exists tiempo_ejecucion text;

comment on column public.cotizaciones.tiempo_ejecucion is
  'Cuánto dura el trabajo («1 día»). Solo postventa lo escribe; sale en su PDF después de la forma de pago (0442).';
