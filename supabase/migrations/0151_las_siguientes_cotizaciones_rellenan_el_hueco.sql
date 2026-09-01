-- ============================================================
-- CRM EFAMEINSA · Migración 0151 · Las siguientes cotizaciones rellenan el hueco 2202-2208
-- ============================================================
-- Decisión del ing. Carlos, 01-09 por la tarde, al enterarse de que los
-- números 2202 a 2208 de la serie EFAMEINSA los consumieron pruebas internas
-- (ver 0145): «podría decirle entonces que las siguientes cotizaciones barran
-- lo que falta de ese hueco y ya quedaría solucionado». Santos aceptó.
--
-- CÓMO. El contador vuelve a 2201. `siguiente_correlativo_anual` (0077)
-- entrega 2202, 2203 … 2208 a las próximas siete cotizaciones, y al llegar a
-- 2209 y 2210 —que ya existen (Brenda y Katherine)— los salta solos y sigue
-- en 2211. Ninguna cotización emitida cambia de número.
--
-- Se aplica el día del despliegue, no antes: cambia la numeración real que
-- reciben las comerciales desde ese momento.
-- ============================================================

update correlativos
   set ultimo = 2201
 where clave = 'EFAMEINSA-2026'
   and ultimo >= 2210
   and not exists (select 1 from cotizaciones where serie = 'EFAMEINSA' and correlativo between 2202 and 2208);
