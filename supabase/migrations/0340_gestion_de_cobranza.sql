-- «Gestión de cobranza» como desenlace de una gestión (Santos, 30-09-2026).
--
-- POR QUÉ: cuando el comercial llama a un cliente para cobrar un saldo, hoy
-- no tiene dónde anotarlo en «¿En qué quedó?»: termina como «Quedó en
-- responder» o sin resultado, y las llamadas de cobranza no se pueden contar
-- aparte de las de venta.
--
-- SIN EFECTO, A PROPÓSITO: cobrar no mueve la oportunidad de etapa (la venta
-- ya ocurrió o se está cerrando). Lleva acción sugerida a dos días, igual que
-- «Pendiente — revisar con gerencia», para que el sistema le recuerde al
-- comercial confirmar que el pago entró.
--
-- Va después de «Quiere comprar» (110) y antes de «Compra a futuro» (120):
-- es lo que sigue a la venta en el recorrido real.

insert into catalogo_resultados_gestion (codigo, nombre, activo, accion_sugerida, dias_sugeridos, efecto, orden)
values ('COBRANZA', 'Gestión de cobranza', true, 'Confirmar que el pago entró', 2, null, 115)
on conflict (codigo) do update
   set nombre          = excluded.nombre,
       activo          = true,
       accion_sugerida = excluded.accion_sugerida,
       dias_sugeridos  = excluded.dias_sugeridos,
       orden           = excluded.orden;
