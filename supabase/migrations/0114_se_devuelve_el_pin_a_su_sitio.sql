-- ============================================================
-- CRM EFAMEINSA · Migración 0114 · Se devuelve el PIN a su sitio
-- ============================================================
-- Darwin, 28-08 por la noche: «quitá esa atribución de que hoy todas las
-- reasignaciones pasan, porque quiero auditar como si fuera mañana; para eso
-- necesito esa restricción viva».
--
-- El permiso del día (0111) se creó porque el código no funcionaba, y eso se
-- arregló en la 0113: ahora la corrección procede con la autorización del
-- supervisor, que era lo que faltaba. Sin ese motivo, el permiso sobra — y
-- mientras esté puesto, no se puede auditar el circuito de verdad.
--
-- Se vence acá mismo, sin esperar a la medianoche. La clave se queda en la
-- tabla (vencida) porque es el registro de que existió y de hasta cuándo valió.

update config_seguridad
   set valor = (now() - interval '1 minute')::text
 where clave = 'pin_supervisor_libre_hasta';

comment on function pin_libre_hasta() is
  'Hasta cuándo se puede corregir una derivación sin código. Vencido desde la migración 0114: el PIN se pide siempre.';
