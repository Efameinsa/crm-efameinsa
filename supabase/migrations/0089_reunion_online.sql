-- ============================================================
-- CRM EFAMEINSA · Migración 0089 · La reunión online es una gestión más
-- ============================================================
-- Pedido de Darwin el 27-08: en «Registrar gestión → ¿Qué hiciste?» faltaba
-- «Reu online». Los comerciales ya hacen reuniones por Meet/Zoom con clientes
-- de provincia —donde una visita no es viable— y hasta ahora tenían que
-- anotarlas como «Llamada» o como «Otro»: en el primer caso se confundían con
-- el teléfono, en el segundo desaparecían de los reportes.
--
-- `tipo_actividad` es un enum, así que no alcanzaba con agregar el chip en la
-- pantalla: el insert habría fallado.
--
-- VA SOLO EN SU PROPIA MIGRACIÓN a propósito. Postgres deja agregar un valor a
-- un enum dentro de una transacción, pero NO usarlo en esa misma transacción, y
-- el runner de migraciones envuelve cada archivo en una. Los filtros de los
-- reportes —que sí nombran el valor nuevo— van en la 0090, que corre en otra.

alter type tipo_actividad add value if not exists 'reunion_online';
