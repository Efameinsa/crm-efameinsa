-- ============================================================
-- CRM EFAMEINSA · Migración 0242 · El informe técnico como el formato de Lesly
-- ============================================================
-- Los cinco formatos de T:\formatos para santos (16-09) —informe de llamada,
-- mantenimiento, recepción, revisión y protocolo de prueba— son el mismo
-- documento: cabecera con el equipo, cliente, asunto, fecha de ejecución y
-- de informe, HORA DE INICIO Y DE CULMINACIÓN, técnico y quién elaboró;
-- secciones de texto (detalle, verificación/pruebas, pendiente); contador de
-- ciclos; fotos; y en la revisión la tabla «Cotizar: repuestos» con código,
-- descripción, cantidad, precio y stock. Carlos, 15-09: «¿por qué seguimos
-- haciendo los formatos si ya tenemos la herramienta? Tiene que generarlo en
-- automático». Lo que faltaba en `informes_servicio`: las dos horas y los
-- repuestos. El resto ya estaba.
-- ============================================================
alter table public.informes_servicio
  add column if not exists hora_inicio time,
  add column if not exists hora_fin time,
  add column if not exists fecha_informe date,
  add column if not exists repuestos jsonb not null default '[]'::jsonb;
comment on column public.informes_servicio.repuestos is
  'Repuestos que el informe recomienda cotizar (0242): [{codigo, descripcion, cantidad, precio, stock}].';
comment on column public.informes_servicio.fecha_informe is
  'Fecha en que se elaboró el informe (0242); la de ejecución es ejecutado_at.';
