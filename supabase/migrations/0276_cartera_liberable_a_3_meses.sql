-- ════════════════════════════════════════════════════════════════════════
-- CRM EFAMEINSA · Migración 0276 · La cartera se libera a los TRES meses
-- ════════════════════════════════════════════════════════════════════════
--
-- Decisión de gerencia, 23-09-2026:
--
--   «Cartera: 3 meses sin venta para reasignar; se redistribuye cada 3 meses».
--
-- Hasta hoy la regla era la del 14-08: seis meses sin venta y el cliente deja
-- de ser del comercial (0001, corregida en la 0222 para que una ficha sin
-- fecha alguna también cuente). Ahora el plazo es de tres meses. Lo demás no
-- cambia: la vista solo SEÑALA qué clientes se pueden mover; moverlos sigue
-- siendo una decisión manual de gerencia (reasignar_cartera exige
-- es_backoffice()), ahora desde la pantalla «Cartera liberable» y en tandas.
-- Como reasignar pone cartera_desde = hoy, el cliente que se reparte queda
-- tres meses con su nuevo dueño antes de volver a salir: eso es el «cada 3
-- meses».
--
-- Qué se toca, sobre la definición VIVA de la vista (pg_get_viewdef del
-- 23-09), no sobre la de 0001/0222:
--
--   1. El plazo: '6 mons' → '3 months'. Se conserva la corrección de la 0222
--      (coalesce con created_at: sin fecha no hay derecho vivo que respetar)
--      y la lista explícita de columnas tal como está en la base.
--
--   2. Una columna nueva AL FINAL, `sin_venta_desde`: la misma fecha con la
--      que la vista decide (ultima_venta_at, si no cartera_desde, si no
--      created_at). La pantalla la necesita para ordenar «más tiempo sin
--      venta primero» y decir cuántos días van, sin volver a escribir la
--      regla en TypeScript. Agregar al final es lo único que `create or
--      replace view` permite sin romper a nadie.
--
--   3. security_invoker = on. La 0001 creó la vista así; la 0222 la
--      reemplazó con `create or replace` sin el WITH y la opción se perdió
--      (en la base viva reloptions está vacío): desde entonces la vista leía
--      `cuentas` con los permisos de su dueño y cualquier sesión podía listar
--      los 13 mil clientes liberables de todos. Con invoker vuelve a mandar
--      la RLS de `cuentas`: gerencia/admin ven todo, un comercial solo lo
--      suyo.
--
-- Nada más usaba los seis meses de cartera en SQL: cartera_en_juego y
-- asignar_lead no miran plazos de cartera (revisado el 23-09 sobre sus
-- definiciones vivas); los «6 months» que quedan en la base son el
-- mantenimiento preventivo de los equipos, que es otra cosa. El valor del
-- enum `liberacion_6_meses` se queda como está (renombrarlo tocaría el
-- historial); solo cambia su etiqueta en pantalla.
--
-- Idempotente: se puede correr dos veces.
-- ════════════════════════════════════════════════════════════════════════

create or replace view v_cuentas_liberables as
 SELECT id,
    tipo_doc,
    num_doc,
    razon_social,
    nombre_comercial,
    rubro_id,
    departamento,
    provincia,
    distrito,
    direccion,
    comercial_id,
    cartera_desde,
    ultima_venta_at,
    notas,
    created_at,
    updated_at,
    GREATEST(COALESCE(ultima_venta_at, cartera_desde), cartera_desde) AS referencia_desde,
    COALESCE(ultima_venta_at, cartera_desde, created_at) AS sin_venta_desde
   FROM cuentas c
  WHERE comercial_id IS NOT NULL AND COALESCE(ultima_venta_at, cartera_desde, created_at) < (now() - '3 months'::interval);

alter view v_cuentas_liberables set (security_invoker = on);

comment on view v_cuentas_liberables is
  'Clientes con tres meses sin venta: se pueden reasignar (gerencia, 23-09-2026: «3 meses sin venta para reasignar; se redistribuye cada 3 meses»; antes seis, regla del 14-08). Desde la 0222 una ficha sin fecha alguna cuenta como liberable. sin_venta_desde es la fecha con la que decide (0276).';
