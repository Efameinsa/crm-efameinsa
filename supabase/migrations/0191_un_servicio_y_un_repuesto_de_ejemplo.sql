-- Un servicio y un repuesto de ejemplo, para ver cómo se cotizan.
--
-- Son EJEMPLOS y lo dicen en el nombre. Sirven para dos cosas: que se vea cómo
-- queda una cotización de postventa sin ninguna máquina de por medio, y que
-- Lesly tenga contra qué comparar cuando prepare el archivo de repuestos de
-- verdad — hoy el catálogo no le da ninguna referencia de formato.
--
-- OJO, Y HAY QUE DECIRLO: `productos` NO tiene columna `es_prueba`, así que
-- estas dos filas las ve cualquier comercial y se pueden cotizar. Por eso van
-- con «EJEMPLO» adelante y con un precio redondo evidente. Cuando llegue el
-- catálogo real de Lesly, se borran o se reemplazan.
--
-- El precio va en el nivel `base`, que es el que usan los productos
-- industriales: un servicio no tiene tres niveles de negociación como una
-- máquina semi industrial.

insert into productos (sku, marca, modelo, nombre, segmento, categoria, capacidad, activo, ficha)
values
  ('EJ-SRV-PREV', 'EFAMEINSA', 'PREV-30', 'EJEMPLO — Mantenimiento preventivo de lavadora hasta 30 kg',
   'servicio', 'servicio', null, true,
   jsonb_build_object(
     'descripcion', 'Incluye revisión general, limpieza de filtros, ajuste de fajas, medición de consumos y protocolo de pruebas en vacío y con carga. No incluye repuestos.',
     'bloques', jsonb_build_array()
   )),
  ('EJ-REP-BOMBA', 'UNIMAC', 'F340100', 'EJEMPLO — Bomba de desagüe para UniMac UCT060',
   'repuesto', 'repuesto', null, true,
   jsonb_build_object(
     'descripcion', 'Bomba de desagüe original. Compatible con UCT060 y equivalentes de la misma línea. Instalación no incluida.',
     'bloques', jsonb_build_array()
   ))
on conflict (sku) do nothing;

insert into precios_producto (producto_id, tier, precio, moneda, vigente_desde)
select p.id, 'base'::tier_precio, v.precio, 'USD', current_date
  from productos p
  join (values ('EJ-SRV-PREV', 450.00), ('EJ-REP-BOMBA', 180.00)) as v(sku, precio) on v.sku = p.sku
 where not exists (
   select 1 from precios_producto pp where pp.producto_id = p.id and pp.vigente_hasta is null
 );
