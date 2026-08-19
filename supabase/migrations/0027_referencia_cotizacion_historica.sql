-- Pedido de Carlos en la reunión 18-08 (repetido por Darwin el 19-08 con el
-- caso ADYSEM): en "Compras anteriores" de la ficha, las ventas históricas
-- mostraban "—" en Cotización — el comercial no puede buscar el documento
-- físico/PDF sin el número. La hoja COTIZ sí trae el Nro_PPTO ("1505-24");
-- se guarda en la venta como referencia de texto (no hay fila real en
-- `cotizaciones` que enlazar) junto con el equipo cuando la hoja lo anotó.
alter table ventas add column if not exists referencia_historica text;
alter table ventas add column if not exists equipo_historico text;
