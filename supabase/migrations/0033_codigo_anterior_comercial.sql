-- ============================================================
-- CRM EFAMEINSA · Migración 0033 · Código anterior del comercial
-- ============================================================
-- Reunión con el ing. Carlos (19-08): Brenda Taboada trabajó como C8 "toda la
-- vida" hasta junio de 2026 y desde entonces es C1. Toda su cartera e
-- historial se unifican bajo C1 y el código C8 queda LIBRE para otra persona.
--
-- Carlos planteó el riesgo operativo: "si yo como Central veo aquí C8… pero
-- C8 ya no hay, ahora hay C1; van a tener que relacionarlo". Dentro del CRM
-- eso se resuelve solo (todo pasa a mostrar "Brenda Taboada (C1)"), pero
-- Central sigue teniendo papeles y archivos viejos que dicen C8. Esta
-- columna deja el rastro explícito para que la ficha del comercial pueda
-- decir "antes C8" y nadie tenga que recordarlo de memoria.
--
-- No es un histórico completo de códigos a propósito: la rotación es rara y
-- un texto libre corto ("C8") es más legible que una tabla de versiones que
-- nadie mantendría.

alter table perfiles add column if not exists codigo_anterior text;

comment on column perfiles.codigo_anterior is
  'Código con el que este comercial operó antes (ej. "C8" para Brenda, que pasó a C1 en junio 2026). Solo trazabilidad para Central; el código vigente es codigo_comercial.';
