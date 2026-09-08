-- El catálogo solo sabía de máquinas.
--
-- QUÉ PASABA. `productos.segmento` es obligatorio y solo aceptaba
-- «industrial» o «semi_industrial». Un mantenimiento preventivo no es ninguno
-- de los dos, y un repuesto tampoco, así que no había forma de cargarlos: el
-- catálogo son 121 máquinas y CERO servicios y repuestos.
--
-- Eso explica media docena de cosas que veníamos viendo por separado. El
-- cotizador de postventa buscaba y siempre volvía vacío; los mantenimientos y
-- repuestos se seguían cotizando en Word (18 documentos fuera de serie); los
-- repuestos usados en una atención se escriben a mano y no llegan a ninguna
-- parte; y el resumen decía «1 equipo» sobre cotizaciones que no llevan
-- ninguna máquina. El informe de UX del 08-09 lo anotó como «el catálogo no
-- tiene repuestos, así que la búsqueda siempre vuelve vacía».
--
-- Los dos valores nuevos van solos en esta migración porque Postgres no deja
-- USAR un valor de enum recién agregado dentro de la misma transacción, y el
-- aplicador corre cada archivo en una. Las filas de ejemplo van en la 0191.

alter type segmento_producto add value if not exists 'servicio';
alter type segmento_producto add value if not exists 'repuesto';
