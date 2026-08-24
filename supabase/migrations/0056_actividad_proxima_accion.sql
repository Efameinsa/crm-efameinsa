-- ============================================================
-- CRM EFAMEINSA · Migración 0056 · La próxima acción queda en el historial
-- ============================================================
-- docs/11-plan-correcciones-prueba-23-08.md · ítem C4.
--
-- En la prueba del 23-08 Darwin registró una gestión ("envié correo de
-- cotización") con su próxima acción ("llamar, 29/08") y en el historial del
-- cliente solo apareció el correo: «no ha salido el otro paso de ¿qué sigue?».
--
-- La próxima acción vive en `oportunidades` y es UNA sola, la vigente. Sirve
-- para la agenda y para "Mi día", pero se pisa en cada gestión: el historial
-- no podía contar a qué se comprometió el comercial en su momento, ni la
-- gerencia revisar si se cumplió. Estas dos columnas guardan una COPIA
-- inmutable en el evento, que es lo que un historial necesita.
--
-- Aditivas y nullables: las 300k+ actividades históricas quedan en null y la
-- línea de tiempo simplemente no muestra la línea "sigue:" para ellas.

alter table actividades
  add column if not exists proxima_accion text,
  add column if not exists proxima_accion_at date,
  add column if not exists proxima_accion_hora time;

comment on column actividades.proxima_accion is
  'Copia de la próxima acción que se agendó AL registrar esta gestión (migración 0056). Histórica: no se actualiza cuando la oportunidad cambia de próxima acción.';
