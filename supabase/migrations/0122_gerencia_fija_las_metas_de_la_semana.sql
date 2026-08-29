-- ============================================================
-- CRM EFAMEINSA · Migración 0122 · Gerencia fija las metas de la semana
-- ============================================================
-- El visto bueno que la migración 0117 dejó pendiente. Darwin, 29-08, mirando
-- la barra de la semana de los comerciales: «gestiones diarias: 35 (aproximarlo
-- a semanal de 6 días), cotizaciones: 50 semanal, venta semanal: 32 mil
-- dólares».
--
-- La 0117 puso números propuestos —30 al día, 36 cotizaciones, 35/42 para
-- Katerine— y avisó en su cabecera que esperaban confirmación de gerencia y que
-- cambiarlos no sería un despliegue sino un update a estas columnas. Es
-- exactamente lo que hace esta migración. Queda una sola vara para los seis: la
-- excepción de Katerine desaparece porque ahora todos van a 35.
--
--     35 gestiones al día × 6 días (lunes a sábado) = 210 a la semana
--     50 cotizaciones enviadas a la semana
--     US$ 32.000 vendidos a la semana
--
-- POR QUÉ LA META DE VENTA SE ESCRIBE EN `meta_mensual` Y NO EN UNA COLUMNA
-- NUEVA. Toda la aplicación lee UNA sola meta de dinero por comercial: el panel
-- de gerencia la multiplica por los meses del rango (`resumen_gerencia`) y la
-- divide entre las 4,33 semanas del mes cuando el filtro es semanal, y la barra
-- de la semana hace ese mismo reparto. Una columna semanal aparte dejaría dos
-- metas distintas para la misma persona el mismo día —el error que la 0117 vino
-- a corregir en la supervisión diaria—. Así que la semanal manda y la mensual
-- se deriva de ella:
--
--     32.000 × 52 ÷ 12 = 138.667 al mes  →  138.667 ÷ 4,33 = 32.000 a la semana
--
-- El número mensual queda feo a propósito: es el que hace que la semana dé
-- justo lo que pidió gerencia, que es la vara que hoy se mira todos los días.
-- Sube desde los US$ 125.000 que había (US$ 28.846 semanales).
--
-- EL EMBUDO CIERRA CON HOLGURA, y conviene decirlo: con los ratios medidos de
-- 2026 (5 gestiones efectivas → 1 cotización; 10 cotizaciones → 1 venta; ticket
-- promedio US$ 8.714), 210 gestiones dan 42 cotizaciones —ocho menos que las 50
-- pedidas, así que la meta de cotizaciones aprieta más que la de gestiones— y
-- 50 cotizaciones dan 5 ventas, US$ 43.500, bastante por encima de los 32.000.
-- La meta de dinero no es la que va a quedar corta.
--
-- Postventa sigue fuera: un caso de garantía no es una gestión de venta
-- (migraciones 0075, 0078 y 0117). Las cuentas de prueba, también.

update perfiles
   set meta_gestiones_diarias    = 35,
       meta_cotizaciones_semanal = 50,
       meta_mensual              = 138667
 where rol::text = 'comercial'
   and activo
   and not coalesce(es_postventa, false)
   and not coalesce(es_prueba, false)
   and not coalesce(es_soporte, false);

-- El respaldo global, para quien no tenga la suya. Ya estaba en 35 en la base
-- —alguien lo subió a mano antes de la 0117— pero acá queda escrito y con el
-- mismo valor que la meta de cada uno, que es lo que evita que dos pantallas
-- midan a la misma persona contra varas distintas.
update parametros set valor = 35 where clave = 'meta_seguimientos_diarios';
