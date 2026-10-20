# Diseño: viáticos del técnico y solicitud de stock de repuesto

Pedido de Brenda (postventa 2) en la reunión de gerencia del 20-10-2026. Gerencia: «primero corrijamos esto… los otros dos, después». Este documento deja el diseño listo. **No está construido**: se hace con la orden de Santos.

## 1. Viáticos del técnico

**Para qué.** Hoy los viáticos de un viaje (provincia, puesta en marcha, revisión) no se piden por el CRM. No queda quién los pidió, cuánto, ni si se rindieron.

**Circuito.**
1. Postventa los pide desde el caso o el pedido: técnico, destino, fechas de ida y vuelta, monto estimado por concepto (pasajes, hospedaje, alimentación, movilidad) y motivo.
2. Gerencia aprueba, ajusta el monto o rechaza con motivo.
3. Finanzas registra la entrega (monto, medio, constancia).
4. Al volver, el técnico (o postventa por él) rinde: comprobantes y monto gastado. Finanzas cierra con la diferencia (devuelve o se le paga).

**Datos.** Tabla `viaticos` (caso o pedido, técnico, destino, fechas, conceptos en JSON, estimado, aprobado, entregado, rendido, diferencia, y cada paso con `_at/_por`). Al registro de acciones.

**Pantallas.** Botón «Pedir viáticos» en el caso y en el pedido; lista «Viáticos por aprobar» en gerencia; «Viáticos por entregar / por rendir» en Finanzas. Avisos de campana en cada paso.

## 2. Solicitud de stock de repuesto al almacén

**Para qué.** Reunión del 16-10: «la consulta de stock al almacén NO queda registrada en el CRM». Postventa pregunta por WhatsApp si hay un repuesto y la respuesta se pierde.

**Circuito.**
1. Postventa pregunta desde el caso: repuesto (código o descripción), cantidad, para qué cliente y equipo.
2. El almacén responde: hay / no hay / hay que importar, con foto y plazo.
3. La respuesta queda en el caso y cuenta en el reporte de repuestos (abierto = consultado y cotizándose; cerrado = vendido o no corresponde).

**Datos.** Reusar `pedidos_catalogo` (0523): ya admite `tipo = 'stock'`, estados y adjuntos. Falta: `atencion_id`, `cantidad`, que `atiende_catalogo()` incluya al almacén, y la respuesta con plazo.

**Pantallas.** Botón «Consultar stock» en el caso; tarjeta en «Mi día» del almacén; la respuesta vuelve a la campana de quien preguntó.
