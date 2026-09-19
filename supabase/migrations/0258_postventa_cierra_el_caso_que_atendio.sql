-- ============================================================
-- CRM EFAMEINSA · Migración 0258 · Postventa cierra el caso que atendió
-- ============================================================
-- Gabriela (postventa), 19-09 a las 9:23, por WhatsApp a Santos: «me aparece
-- este mensaje cuando quiero registrar al cliente, ya que él se equivocó».
-- El cliente es BESO DE SAL (PRO-09468, garantía): el sr. Héctor había dado
-- la placa de una lavadora doméstica; al llamarlo, sus industriales estaban
-- bien. Ella escribió la gestión, marcó «Sin interés / no procede», eligió el
-- motivo y al pulsar «Registrar y rechazar» el CRM le contestó «Solo el dueño
-- de la oportunidad puede cambiarle la etapa». Nada quedó guardado —el cierre
-- va primero a propósito— y ella se quedó con la llamada hecha y sin dónde
-- dejarla.
--
-- POR QUÉ. El expediente es de `postventa@` (PV): ahí aterriza todo lo que
-- Central deriva a postventa. Gabriela entra como PV2. La 0238 (reunión del
-- 15-09, regla de Carlos: «el teléfono lo contesta quien esté, no el dueño del
-- expediente») abrió la GESTIÓN a cualquiera del área, pero la ETAPA siguió
-- con la política de siempre: `oportunidades_comercial_update` exige ser el
-- dueño. Anotar sí, cerrar no. Es una regla a medias, y se nota justo cuando
-- el caso termina.
--
-- Medido antes de escribir esto: 180 de los 244 casos abiertos de postventa
-- son de PV; desde el 15-09 PV2 anotó 11 gestiones y PV1 una en expedientes
-- de PV. Ninguna de ellas podía terminar en un cierre.
--
-- QUÉ HACE. La misma llave que ya abre la gestión (`puede_postventa()` sobre
-- un expediente con `tipo_postventa`) abre también la etapa: quien atendió
-- cierra, reprograma o califica el caso. El `with check` no deja quitarle el
-- `tipo_postventa` al expediente: un caso de postventa no se convierte en
-- venta ajena por esta puerta.
--
-- QUÉ NO HACE. No mueve el expediente ni la cartera: el dueño sigue siendo
-- PV, y «Pedir el expediente» con PIN (0202) sigue siendo el camino para
-- cambiar de manos. No toca los expedientes comerciales (sin `tipo_postventa`).
-- ============================================================

drop policy if exists oportunidades_postventa_update on public.oportunidades;
create policy oportunidades_postventa_update on public.oportunidades for update
  using (
    tipo_postventa is not null
    and (select puede_postventa())
  )
  with check (
    tipo_postventa is not null
    and (select puede_postventa())
  );

comment on policy oportunidades_postventa_update on public.oportunidades is
  'Cualquiera del área cierra, reprograma o califica un expediente de postventa (regla de Carlos, 15-09; 0238 abrió la gestión, esta abre la etapa). No mueve el dueño: para eso está pedir_expediente (0202).';
