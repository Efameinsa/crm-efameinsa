-- 0566 · Apertura de servicio INTERNA o EXTERNA (20-10, Santos, caso LINO ESPIRITU).
-- Externa: el técnico va al local del cliente (el circuito de siempre; null =
-- externa en las aperturas anteriores). Interna: el equipo se atiende en nuestra
-- planta y la apertura lleva sus antecedentes (fecha de compra, guía, problemas
-- anteriores, repuesto o mantenimiento vendido, repuesto cambiado, garantía y qué
-- se ejecuta), que salen en la hoja.
alter table public.servicios_postventa
  add column if not exists apertura_modalidad text check (apertura_modalidad in ('externa', 'interna')),
  add column if not exists apertura_antecedentes jsonb;
