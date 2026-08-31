-- ============================================================
-- Lo que no es comercial deja de ensuciar los informes: va a Finanzas
-- ============================================================
-- Reunión del 31-08 por la tarde. El caso real que trajo el ing. Carlos: uno de
-- los comerciales —Brenda, C1— registró una gestión donde el cliente pedía su
-- factura. Textual:
--
--   «Eso, para comenzar, no suma como netamente el tema comercial (…) ¿Rechaza?
--    ¿Hacia dónde va? (…) podemos más bien hacer que sí lo registre y vaya a
--    otros, para que no se manchen los informes.»
--
-- Y la solución que dictó, entera:
--
--   «Yo como gestor registro mi cliente, digo por favor necesito urgente. Llega
--    a la Central, la Central dice: no, ese es de Finanzas. Asigno a Finanzas y
--    le llega el mensaje a su WhatsApp, y ya está derivado.»
--
-- POR QUÉ NO ALCANZABA CON «DESCARTAR». Hoy Central tiene dos salidas: derivar
-- a un comercial, o descartar. Descartar hace desaparecer el pedido: nadie
-- atiende la factura y el cliente vuelve a llamar. Y dejarlo como gestión
-- comercial es lo que él no quiere, porque infla las cifras de quien no vendió
-- nada. Faltaba la tercera salida: sale del circuito comercial, pero alguien
-- se hace cargo.
--
-- POR QUÉ UN VALOR NUEVO Y NO «administracion», que ya existe. Porque el
-- destinatario es una persona concreta —John, de Tesorería y Finanzas— y el
-- aviso va a su teléfono. Meterlo en «Administración» obligaría a adivinar cada
-- vez a quién avisar, y el informe de Central no podría decir cuántos pedidos
-- fueron a Finanzas, que es justo lo que él quiere poder mirar.
alter type area_destino add value if not exists 'finanzas';

comment on type area_destino is
  'A dónde va un contacto que entra por Central. «finanzas» se agregó el 31-08 '
  'para los pedidos de factura y cobranza, que no son gestión comercial pero '
  'tampoco se descartan: se derivan y se avisa a Tesorería.';
