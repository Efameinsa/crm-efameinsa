-- ============================================================
-- CRM EFAMEINSA · Migración 0106 · El banco de pruebas deja trabajar
-- ============================================================
-- «Quiero generar un informe de venta con comercial0, que es de prueba, y me
-- bota este error: new row violates row-level security policy for table
-- informes_cierre» (Darwin, 28-08).
--
-- Es el mismo bug que la 0097 arregló para los informes de servicio, y estaba
-- esperando en tres tablas más. Vale la pena escribir bien el mecanismo, porque
-- el mensaje de Postgres apunta al lugar equivocado y hace perder media hora:
--
--   · La política de INSERT deja pasar la fila —se comprobó: insertar SIN
--     `returning` funciona—.
--   · La aplicación siempre pide la fila de vuelta (`.select()` después del
--     insert), y para devolverla Postgres exige que pase la política de SELECT.
--   · Esa política dice `es_prueba = es_cuenta_prueba()`: quien trabaja en el
--     banco de pruebas ve filas de prueba, y quien trabaja en el dato real ve
--     las reales. Correcta, y no se toca.
--   · Pero la columna tenía `default false` y la aplicación no la manda nunca.
--     Para el usuario de práctica ese default es siempre el valor equivocado,
--     así que la fila se creaba y desaparecía al leerla — y el error que sale
--     habla del INSERT, que es justamente el que sí pasó.
--
-- Se arregla donde vive la regla y no en cada `insert` de la aplicación: basta
-- que alguien agregue una pantalla nueva y se olvide de la columna para que
-- vuelva el mismo error con el mismo mensaje engañoso.

alter table informes_cierre     alter column es_prueba set default es_cuenta_prueba();
alter table servicios_postventa alter column es_prueba set default es_cuenta_prueba();
alter table soporte_tecnico     alter column es_prueba set default es_cuenta_prueba();

comment on column informes_cierre.es_prueba is
  'Se llena solo con el banco al que pertenece quien lo emite (migración 0106): la aplicación no tiene que acordarse, y la política de la 0092 nunca rebota una operación legítima.';

-- `leads` queda como está a propósito: su columna la escribe Central al
-- registrar el contacto y ninguna política de lectura la exige, así que ponerle
-- este default cambiaría el comportamiento de la bandeja sin que nadie lo haya
-- pedido. `perfiles` tampoco: ahí la marca la pone el administrador a mano
-- cuando crea una cuenta de práctica, que es exactamente lo que debe pasar.
