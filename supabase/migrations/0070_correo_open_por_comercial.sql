-- ============================================================
-- CRM EFAMEINSA · Migración 0070 · El correo en OPEN es un dato, no una deducción
-- ============================================================
-- Reportado el 24-08: «la firma de C4 no se actualizó para Open Investments».
--
-- Al buscar la causa aparecieron dos cosas.
--
-- 1) C4 NO TENÍA NINGÚN DATO DE FIRMA. Ni cargo, ni teléfono, ni celular, ni
--    correo — ni siquiera su nombre: el perfil decía "Comercial C4". Sus
--    cotizaciones salían firmadas con eso y nada más. La firma real la había
--    enviado ella misma (Downloads/observaciones de comerciales 2/c4): es
--    Ariana Flores, Área Comercial, celular 946 372 890.
--
-- 2) Y ALGO QUE CAMBIA UNA REGLA. `correoEnSerie()` deducía el correo de la
--    serie OPEN cambiándole el dominio al de Efameinsa. Eso se estableció
--    mirando la firma de Katerine (C5), donde efectivamente cambia:
--
--        C5 en EFAMEINSA : comercial5@efameinsa.com
--        C5 en OPEN      : comercial5@openinvestments.com.pe   ← cambia
--
--    Pero la firma de Ariana en OPEN, que mandó ella misma con el logo de OPEN
--    INVESTMENTS S.A.C, dice:
--
--        C4 en OPEN      : comercial4@efameinsa.com            ← NO cambia
--
--    O sea que la regla no es general. Deducirla le imprimía a Ariana un
--    correo que puede no existir, y la respuesta del cliente rebotaría sin que
--    nadie se entere — que es la peor forma de fallar en una cotización.
--
-- Por eso el correo de OPEN pasa a ser un dato guardado por persona. Cuando
-- está vacío se sigue deduciendo como hasta ahora, así que nadie se queda sin
-- correo; pero quien lo tenga distinto, lo tiene escrito.

alter table perfiles
  add column if not exists email_open text;

comment on column perfiles.email_open is
  'Correo con el que esta persona firma las cotizaciones de la serie OPEN. NULL = se deduce cambiando el dominio del correo de Efameinsa, que es lo que hacen la mayoría. Existe porque no todos lo cambian: Ariana (C4) firma con @efameinsa.com también en OPEN (migración 0070).';
