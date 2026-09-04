-- ============================================================
-- CRM EFAMEINSA · Migración 0166 · Los rangos de postventa que definió Carlos el 04-09
-- ============================================================
-- Reunión de Santos, el ing. Carlos y Ariana del 04-09 (grabaciones 09:20,
-- 09:47 y 10:10). Cierra lo que el 03-09 había quedado «pendiente de
-- confirmar» (rangos 650/2300) y lo reemplaza por estos números:
--
--   «En Open tendríamos que darle a postventa un rango también. Si estamos en
--    el 551, podríamos darle el 600. Todos los comerciales pueden cotizar
--    hasta el 599; si te toca el 600 no puede, porque ya postventa lo está
--    haciendo manual. En Efameinsa estamos en el 2211: te voy a dar el 2250.
--    El primer número que vas a ejecutar manualmente en el servidor va a ser
--    2250.»
--
-- Y sobre los cierres, corrigiendo el 34 que se había conversado el 03-09:
--
--   «¿Qué tienes pendiente para numerar en septiembre? Esos tres. Ok,
--    entonces comencemos en el 30. Y hacia adelante. Ese rango no lo puede
--    tocar: el 30 hasta lo que llegue, el 40, digamos.»
--
-- Y sobre el único duplicado real de la serie Open (dos Presu_454-26 del
-- 21-08: Asociación Vidawasi y Ingeniería y Servicios Asociados):
--
--   «En uno de los números antes del 600 tendríamos que calzarlo y cerrar
--    ese punto.»
--
-- Cómo funciona: `siguiente_correlativo_anual` y `siguiente_correlativo_informe`
-- saltan todo número reservado vigente (0138). Con esto los comerciales
-- numeran 553…598 y siguen en 650; el 599 queda apartado para reemitir uno de
-- los dos 454; y postventa trabaja su bloque en el Word hasta que el cotizador
-- tenga línea de texto libre y deje de necesitarlo.
-- ============================================================

do $$
declare
  v_pv uuid := (select id from perfiles where codigo_comercial = 'PV' and activo limit 1);
  n integer;
begin
  -- Cotizaciones de postventa en Word: Open 600-649.
  for n in 600..649 loop
    insert into correlativos_reservas (clave, numero, perfil_id, reservado_para, motivo, vence_at)
    values ('OPEN-2026', n, v_pv, 'Postventa',
            'Cotizaciones de mantenimiento y repuestos numeradas a mano en el servidor desde el 600 (Carlos, reunión 04-09 09:47). Sin vencimiento: se liberan cuando postventa cotice en el CRM.', null)
    on conflict (clave, numero) do nothing;
  end loop;

  -- Cotizaciones de postventa en Word: Efameinsa 2250-2299 (solo por urgencia:
  -- «si vas a hacer mantenimiento como Efameinsa, que no deberíamos, pero por
  -- si acaso»).
  for n in 2250..2299 loop
    insert into correlativos_reservas (clave, numero, perfil_id, reservado_para, motivo, vence_at)
    values ('EFAMEINSA-2026', n, v_pv, 'Postventa',
            'Cotizaciones de postventa en el servidor desde el 2250, solo para urgencias (Carlos, reunión 04-09 09:47). Sin vencimiento.', null)
    on conflict (clave, numero) do nothing;
  end loop;

  -- Cierres de postventa: el bloque llega hasta el 40.
  for n in 30..40 loop
    insert into correlativos_reservas (clave, numero, perfil_id, reservado_para, motivo, vence_at)
    values ('INFORME-OPEN-2026', n, v_pv, 'Postventa',
            'Cierres de postventa numerados en Word desde el 30 (Carlos, reuniones 03-09 13:05 y 04-09 09:20); se suben al CRM con ese número.', null)
    on conflict (clave, numero) do nothing;
  end loop;

  -- El 599 se aparta para reemitir uno de los dos Presu_454-26.
  insert into correlativos_reservas (clave, numero, perfil_id, reservado_para, motivo, vence_at)
  values ('OPEN-2026', 599, null, 'Corrección',
          'Apartado para reemitir uno de los dos Presu_454-26 del 21-08 (Asociación Vidawasi / Ingeniería y Servicios Asociados): «en uno de los números antes del 600 tendríamos que calzarlo» (Carlos, 04-09 10:10). Falta que gerencia diga cuál de los dos se renumera.', null)
  on conflict (clave, numero) do nothing;
end $$;
