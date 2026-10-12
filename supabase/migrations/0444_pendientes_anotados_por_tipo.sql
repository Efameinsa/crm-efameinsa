-- PENDIENTES ANOTADOS, CON SU TIPO (buzón, Rubí PV1, 12-10-2026: «que me dé
-- la opción de agregar más pendientes como Importación, Llamada programada,
-- Pendiente de stock»). Los pendientes del reporte diario salen solos del
-- circuito (despachos, videollamadas, puestas, atenciones, preventivos); lo
-- que espera una importación o un stock no está en ningún lado. Se anota como
-- una tarea propia (0028) con su tipo: sale en la bandeja, en el calendario y,
-- mientras no se marque resuelta, en «5b» del reporte diario, por tipo.
alter table tareas_agenda
  add column if not exists tipo_pendiente text
  check (tipo_pendiente in ('importacion', 'llamada_programada', 'pendiente_stock', 'otro'));

create index if not exists ix_tareas_agenda_pendientes
  on tareas_agenda (comercial_id)
  where tipo_pendiente is not null and not completada;

comment on column tareas_agenda.tipo_pendiente is
  'null = tarea suelta de la agenda; con valor = pendiente anotado (Importación, Llamada programada, Pendiente de stock, Otro) que sale en el reporte diario hasta que se marca resuelto.';
