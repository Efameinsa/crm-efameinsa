-- ============================================================
-- CRM EFAMEINSA · Migración 0443 · A quién va dirigida la cotización,
-- editable en cada cotización
-- ============================================================
-- Gabriela (PV2), 12-10-2026, buzón: «permitir editar el correo y nombre de
-- las personas a las cuales se está realizando las cotizaciones. En la
-- mayoría de casos los que aparecen por defecto no son las personas con las
-- cuales se realiza las cotizaciones» (captura: HOTELERA CUSCO S.A., salía
-- el contacto principal de la ficha, VELAOCHAGA CASTRO MIGUEL ANGEL).
--
-- `atencion_pdf`: el «Atención:», el teléfono y el correo tal como salen en
-- ESTA cotización: {"nombre": …, "telefono": …, "email": …}. NULL = los del
-- contacto principal de la ficha (lo de siempre). Se escribe con el mismo
-- UPDATE que el lugar de entrega y la nota (0391): no toca crear_cotizacion
-- ni editar_cotizacion. No cambia el contacto principal del cliente.
-- ============================================================

alter table cotizaciones add column if not exists atencion_pdf jsonb;
comment on column cotizaciones.atencion_pdf is
  'A quién va dirigida esta cotización (0443): {nombre, telefono, email} para el «Atención:» del PDF. NULL = el contacto principal de la ficha.';
