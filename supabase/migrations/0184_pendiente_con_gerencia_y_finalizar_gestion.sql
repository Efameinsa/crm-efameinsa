-- Dos opciones que pidió el área comercial por correo (07-09-2026).
--
-- 1. «Pendiente — revisar con gerencia». Cuando el que pregunta es un
--    revendedor, el comercial no puede seguir hasta que gerencia revise la
--    ficha. Hasta hoy no había dónde registrar esa espera: quedaba como «Quedó
--    en responder», que dice otra cosa.
--
--    EL RELOJ NO SE PAUSA. Santos lo decidió expresamente: la oportunidad
--    sigue corriendo su tiempo aunque esté esperando a gerencia. Por eso este
--    resultado NO lleva efecto —no mueve la etapa— y sí lleva acción sugerida
--    a dos días: el sistema le va a seguir recordando al comercial que eso
--    está esperando, que es justamente lo que se quiere.
--
-- 2. «Finalizar gestión». No es una próxima acción, es el final de la
--    gestión, así que va acá y no en «¿Qué sigue?». Si fuera una acción
--    agendada, el sistema le pondría al comercial una tarea llamada
--    «Finalizar gestión» para dentro de unos días y la oportunidad quedaría
--    abierta para siempre — exactamente lo contrario de lo que se pidió.
--
--    Lleva efecto 'rechazo', el mismo de «Sin interés / no procede», así que
--    la oportunidad se cierra y queda contada como NO PROCEDE. Es lo que pidió
--    Santos: «que figure como No procede por algún lado». La diferencia con
--    «Sin interés» es el motivo, no el resultado: una gestión que se agota sin
--    que el cliente rechace nada tampoco es una venta.

insert into catalogo_resultados_gestion (codigo, nombre, activo, accion_sugerida, dias_sugeridos, efecto)
values
  ('PENDIENTE_GERENCIA', 'Pendiente — revisar con gerencia', true, 'Revisar la ficha con gerencia', 2, null),
  ('FINALIZAR_GESTION',  'Finalizar gestión (no procede)',   true, null,                            null, 'rechazo')
on conflict (codigo) do update
   set nombre          = excluded.nombre,
       activo          = excluded.activo,
       accion_sugerida = excluded.accion_sugerida,
       dias_sugeridos  = excluded.dias_sugeridos,
       efecto          = excluded.efecto;
