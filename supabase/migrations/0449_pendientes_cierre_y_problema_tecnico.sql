-- DOS TIPOS MÁS DE PENDIENTE ANOTADO (buzón, Rubí PV1, 12-10-2026: «que se
-- agreguen apartados para añadir PENDIENTE CIERRE y PROBLEMA TÉCNICO»). Los
-- anotaba como «Otro pendiente» con «CIERRE -» o «PROBLEMA TECNICO -» delante;
-- ahora cada uno tiene su tipo y sale en su propio bloque en la bandeja y en
-- el reporte diario.
alter table tareas_agenda drop constraint if exists tareas_agenda_tipo_pendiente_check;
alter table tareas_agenda
  add constraint tareas_agenda_tipo_pendiente_check
  check (tipo_pendiente in ('importacion', 'llamada_programada', 'pendiente_stock', 'pendiente_cierre', 'problema_tecnico', 'otro'));

comment on column tareas_agenda.tipo_pendiente is
  'null = tarea suelta de la agenda; con valor = pendiente anotado (Importación, Llamada programada, Pendiente de stock, Pendiente de cierre, Problema técnico, Otro) que sale en el reporte diario hasta que se marca resuelto.';
