-- ============================================================
-- CRM EFAMEINSA · Migración 0128 · Un borrador sin enviar se mide con el precio de hoy
-- ============================================================
-- Reportado por gerencia el 29-08: en /gerencia/aprobaciones el precio de
-- referencia no cuadra con lo que muestra el buscador del cotizador. En la
-- cotización el precio está bien; en la pantalla de aprobar, no.
--
-- ------------------------------------------------------------
-- QUÉ PASÓ
-- ------------------------------------------------------------
-- Al agregar un equipo, `crear_cotizacion` guarda en el ítem una FOTO de la
-- referencia (`cotizacion_items.precio_lista = precio_referencia_producto()`).
-- El buscador, en cambio, lee el precio VIGENTE. Mientras nadie toque el
-- catálogo los dos coinciden; cuando operaciones corrige un precio después de
-- que el comercial armó el borrador, la pantalla de gerencia se queda con el
-- precio viejo.
--
-- Hoy 29-08 operaciones corrigió el catálogo y dos secadoras que tenían los
-- precios CRUZADOS volvieron a su sitio:
--
--     SECU502 · UNIMAC UT055    9,500 → 7,350
--     SECU55  · UNIMAC UT055L   7,350 → 9,500
--
-- El borrador de Brenda Taboada para MODAS DIVERSAS DEL PERU SAC (29-08 15:11)
-- se armó antes de esa corrección y se quedó con la foto vieja adentro.
--
-- ------------------------------------------------------------
-- POR QUÉ NO ES COSMÉTICO
-- ------------------------------------------------------------
-- Junto a `precio_lista` quedan congelados `bajo_lista` y `requiere_aprobacion`,
-- que son la decisión misma. En ese borrador quedó al revés por los dos lados:
--
--   · UT055  a 7,999 pide aprobación contra una referencia de 9,500 que ya no
--     existe. Contra los 7,350 de hoy está POR ENCIMA: no hay descuento que
--     aprobar, y gerencia está firmando aire.
--   · UT055L a 8,999 pasa como «al precio de referencia o por encima» contra
--     los 7,350 viejos. Contra los 9,500 de hoy es una rebaja real de USD 501
--     que se iba al cliente sin que nadie la mire.
--
-- Es el mismo circuito roto por los dos extremos que ya describió la 0091, pero
-- disparado por un cambio de precio en vez de una regresión de código.
--
-- ------------------------------------------------------------
-- LA CORRECCIÓN
-- ------------------------------------------------------------
-- Un borrador que todavía no salió se vuelve a medir con el precio de hoy. Un
-- documento ENVIADO no se toca: su referencia es la del día en que se emitió y
-- así debe quedar (trigger de inmutabilidad, 0062). Hoy hay 46 ítems enviados
-- con referencia distinta a la vigente y ninguno se reabre.
--
-- Esto destraba lo de hoy; que el borrador se re-mida SOLO cuando operaciones
-- cambia un precio queda pendiente y se decide aparte.
update cotizacion_items i
   set precio_lista        = precio_referencia_producto(i.producto_id),
       bajo_lista          = precio_referencia_producto(i.producto_id) is not null
                             and i.precio_unitario < precio_referencia_producto(i.producto_id),
       requiere_aprobacion = exige_aprobacion_gerencia(
                               i.producto_id,
                               precio_referencia_producto(i.producto_id) is not null
                               and i.precio_unitario < precio_referencia_producto(i.producto_id)
                             )
  from cotizaciones c
 where c.id = i.cotizacion_id
   and c.estado = 'borrador'
   and c.enviada_at is null
   and i.producto_id is not null
   and i.precio_lista is distinct from precio_referencia_producto(i.producto_id);

-- El borrador que se quedó sin nada que decidir deja de esperar a gerencia, y
-- el que sí tiene una rebaja real pasa a esperarla.
update cotizaciones c
   set estado_aprobacion = 'auto_aprobada'
 where c.estado_aprobacion = 'pendiente_gerencia'
   and c.estado = 'borrador'
   and c.enviada_at is null
   and not exists (
     select 1 from cotizacion_items i
      where i.cotizacion_id = c.id and i.requiere_aprobacion
   );

update cotizaciones c
   set estado_aprobacion = 'pendiente_gerencia'
 where c.estado_aprobacion = 'auto_aprobada'
   and c.estado = 'borrador'
   and c.enviada_at is null
   and exists (
     select 1 from cotizacion_items i
      where i.cotizacion_id = c.id and i.requiere_aprobacion
   );
