-- ============================================================
-- CRM EFAMEINSA · Migración 0222 · Liberable también cuando falta «cliente desde»
-- ============================================================
-- Caso GATE GOURMET (11-09). C5 reclamó que el cliente «pertenece a C8»
-- (Brenda, C1). La ficha de Brenda tiene cuatro cotizaciones de junio 2025 y
-- ninguna venta: por la regla de gerencia del 14-08 —seis meses sin venta,
-- liberable— ya no era suya. Pero `v_cuentas_liberables` la marcaba como NO
-- liberable, y no por la regla: porque esa ficha tiene `cartera_desde` VACÍO
-- y `coalesce(ultima_venta_at, cartera_desde) < now() - 6 meses` con nulo da
-- nulo, que en un WHERE es falso.
--
-- No es una ficha: son 3.070 fichas con dueño y sin `cartera_desde`, todas de
-- las importaciones del 17 al 29 de agosto (2.693 con gestiones o cotizaciones
-- del archivo, 148 con venta). Todas quedaban «protegidas» para siempre.
--
-- QUÉ HACE.
--   1. Rellena `cartera_desde` donde falta, con lo más antiguo que se sabe del
--      cliente en esa cartera: la primera oportunidad, la primera cotización
--      del archivo o el primer lead — y si no hay nada, el día en que se creó
--      la ficha. Es lo que «cliente desde» significa, y deja a la vista con
--      el dato que siempre esperó. Va con agregados por cuenta, no con
--      subconsultas por fila: la versión correlacionada se canceló por tiempo
--      al ensayarla (statement timeout de Supabase).
--   2. La vista deja de depender del nulo: una ficha sin ninguna fecha se
--      trata como liberable, porque no hay nada que pruebe un derecho vivo.
--
-- Solo lectura para la app: no cambia ninguna política ni ninguna pantalla.
-- ============================================================

-- 1. «Cliente desde» = lo más antiguo que se sabe de él. `least` ignora nulos.
with oo as (select cuenta_id, min(created_at) as m from oportunidades where cuenta_id is not null group by cuenta_id),
     hh as (select cuenta_id, min(fecha)::timestamptz as m from cotizaciones_historicas where cuenta_id is not null group by cuenta_id),
     ll as (select cuenta_id, min(recibido_at) as m from leads where cuenta_id is not null group by cuenta_id),
     primera as (
       -- Piso en el año 2000: el Excel trae fechas de 1900 en algunas filas y
       -- «cliente desde 1900» no es un dato, es basura que se propaga.
       select c.id, greatest(least(oo.m, hh.m, ll.m, c.created_at), '2000-01-01'::timestamptz) as desde
         from cuentas c
         left join oo on oo.cuenta_id = c.id
         left join hh on hh.cuenta_id = c.id
         left join ll on ll.cuenta_id = c.id
        where c.cartera_desde is null
     )
update cuentas c
   set cartera_desde = p.desde
  from primera p
 where p.id = c.id
   and p.desde is not null;

-- 2. La vista, sin el agujero del nulo.
create or replace view v_cuentas_liberables as
select id, tipo_doc, num_doc, razon_social, nombre_comercial, rubro_id, departamento, provincia, distrito,
       direccion, comercial_id, cartera_desde, ultima_venta_at, notas, created_at, updated_at,
       greatest(coalesce(ultima_venta_at, cartera_desde), cartera_desde) as referencia_desde
  from cuentas c
 where comercial_id is not null
   and coalesce(ultima_venta_at, cartera_desde, created_at) < now() - interval '6 months';

comment on view v_cuentas_liberables is
  'Clientes con seis meses sin venta (regla de gerencia del 14-08). Desde la 0222 una ficha sin fecha alguna cuenta como liberable: sin fecha no hay derecho vivo que respetar.';
