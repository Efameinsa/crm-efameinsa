-- ============================================================
-- CRM EFAMEINSA · Migración 0150 · El pedido arranca por el pago y sale con apertura
-- ============================================================
-- Reunión del 01-09 por la tarde (ing. Carlos, Lesly, Santos), mirando el
-- control de pedidos en vivo. Carlos dictó el circuito completo del pedido,
-- en este orden y con estas reglas:
--
--   «Mi indicador inicial, para mí como postventa, es pago: ¿pagó? (…) Si es
--    cancelado, mi primera función es el checklist de Finanzas. Confirmación
--    de Finanzas. Le doy el check y continúo mi gestión.»
--
--   «Aprobamos y luego envío mi prueba y embalaje (…) yo marco el check que ya
--    está probado y embalado pero con fecha. Ojo, tiene que haber fecha y hora
--    acá. Es muy importante fecha y hora.»
--
--   «En paralelo (…) yo le envío mi correo del plano de preinstalación.»
--
--   «Podemos mandar a probar todos los equipos, pero para el despacho dice
--    falta el saldo o falta confirmación de finanzas. Hasta que no apruebe
--    eso, así le diga un despache, no despacha.»
--
--   «Antes de yo ejecutar el despacho, llamo al cliente y le pregunto para
--    corroborar los datos (…) casi el 90 % de veces la dirección o algún
--    teléfono o la persona que va a recibir.»
--
--   «Para que se despache el equipo generamos un formato que le llamamos
--    APERTURA de despacho. (…) Con eso, sí o sí, tengo que ejecutar mi
--    despacho. No tiene que preguntar a nadie, porque para llegar ahí la
--    condicional es: Finanzas aprobó, check; corroboraste tu dirección, check;
--    pedido embalado, check; plano de preinstalación, check. Despacho.»
--
--   «Esa apertura tenemos que entregarle urgente, porque acá te tiene que
--    dar automáticamente (…) toda la data está en el sistema.»
--
-- LO QUE FALTABA EN LA BASE. El pedido (0087) ya tenía casi todos los sellos.
-- Faltaban dos cosas:
--   1. Que la confirmación de Finanzas diga QUIÉN de Finanzas confirmó y por
--      dónde (correo, WhatsApp, llamada): hoy Finanzas no tiene usuario en el
--      CRM y postventa registra lo que Finanzas le contestó. Sin el nombre y
--      el medio, el check no defiende a nadie cuando el voucher era falso.
--   2. La APERTURA DE DESPACHO como acto con fecha y autor: es el documento
--      con el que almacén despacha sin preguntar. Se emite solo cuando las
--      cuatro condiciones están cumplidas (lo verifica el servidor, no la
--      pantalla), y se imprime desde el sistema con los datos ya verificados.
--
-- El orden del checklist y la regla de bloqueo viven en `bloquesPedido`
-- (src/lib/postventa.ts); acá solo entran los datos que los sostienen.
-- ============================================================

alter table servicios_postventa
  add column if not exists pago_confirmado_detalle text,
  add column if not exists apertura_despacho_at  timestamptz,
  add column if not exists apertura_despacho_por uuid references perfiles(id);

comment on column servicios_postventa.pago_confirmado_detalle is
  'Quién de Finanzas confirmó el pago y por qué medio (correo, WhatsApp, llamada). Lo registra postventa mientras Finanzas no tenga usuario (0150).';
comment on column servicios_postventa.apertura_despacho_at is
  'Cuándo se emitió la apertura de despacho: el documento con el que almacén despacha sin preguntar. Solo se emite con pago confirmado (o despacho autorizado con saldo), dirección verificada, equipo probado y embalado y plano enviado (0150).';
