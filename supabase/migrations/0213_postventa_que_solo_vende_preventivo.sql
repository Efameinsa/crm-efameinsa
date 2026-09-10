-- ============================================================
-- La cuenta de postventa que SOLO vende preventivo
-- ============================================================
-- Santos, 10-09, después de la reunión: «Ariana solo verá ofrecer
-- mantenimiento, cotizar y vender, pero Ariana no ve nada del proceso de
-- gestión, control de pedidos ni nada de eso».
--
-- Y viene de lo que Carlos ya había dicho el 27-08 sobre ella: «ellos no hacen
-- eso: solamente venden. Termino de vender, sigo mi cierre y ya». Lo nuevo es
-- que ahora tiene una cuenta DEL ÁREA (PV1), y esa cuenta abre por defecto la
-- bandeja, los pedidos, los despachos y las atenciones — todo el trabajo de
-- quien EJECUTA el servicio, que no es el suyo.
--
-- No es un rol nuevo ni un permiso menos: es la misma cuenta de postventa con
-- una tarea acotada. Rubí (PV) sigue viendo todo.
--
-- LO QUE ESTA MARCA NO HACE: no le quita nada de lo que ya podía VER de los
-- clientes. Sigue viendo el universo entero de ventas, la ruta y las fichas,
-- que es justamente lo que la reunión pidió abrirle.

alter table perfiles add column if not exists solo_preventivo boolean not null default false;

comment on column perfiles.solo_preventivo is
  'Cuenta de postventa dedicada a VENDER mantenimiento preventivo: ve la ruta, las ventas de la empresa, el cotizador y sus cierres, y no las pantallas de ejecución del servicio (bandeja, pedidos, despachos, atenciones). Santos, 10-09.';

update perfiles set solo_preventivo = true where codigo_comercial = 'PV1';
