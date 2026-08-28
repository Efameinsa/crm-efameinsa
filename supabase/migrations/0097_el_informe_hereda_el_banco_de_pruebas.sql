-- ============================================================
-- CRM EFAMEINSA · Migración 0097 · El informe hereda el banco de pruebas
-- ============================================================
-- Lo encontró la prueba de punta a punta del registro guiado de casos: la
-- cuenta de práctica (0092) NO PODÍA EMITIR UN INFORME. El error, literal:
--
--   new row violates row-level security policy for table "informes_servicio"
--
-- La política de la 0092 es correcta y no se toca: quien trabaja en el banco de
-- pruebas escribe filas de prueba, y quien trabaja en el dato real escribe
-- filas reales —`es_prueba = es_cuenta_prueba()`—. El problema es que la
-- columna tiene `default false` y la aplicación no la manda nunca: para el
-- usuario de práctica, ese default es siempre el valor equivocado, así que
-- cualquier inserción rebota.
--
-- Se podía arreglar en cada `insert` de la aplicación. Sería el arreglo frágil:
-- basta que alguien agregue una pantalla nueva y se olvide de la columna para
-- que vuelva el mismo error, y encima con un mensaje que no dice nada de lo que
-- pasa. El default lo resuelve una vez y para siempre, y del lado donde vive la
-- regla.
--
-- Es la capacitación del lunes la que estaba en juego: la cuenta de práctica
-- existe justamente para que los comerciales prueben sin ensuciar el CRM.

alter table informes_servicio  alter column es_prueba set default es_cuenta_prueba();
alter table equipos_instalados alter column es_prueba set default es_cuenta_prueba();

comment on column informes_servicio.es_prueba is
  'Se llena solo con el banco al que pertenece quien lo emite (migración 0097): la aplicación no tiene que acordarse, y la política de la 0092 nunca rebota una inserción legítima.';
comment on column equipos_instalados.es_prueba is
  'Se llena solo con el banco al que pertenece quien lo ficha (migración 0097).';
