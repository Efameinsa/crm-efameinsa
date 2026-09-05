-- ============================================================
-- CRM EFAMEINSA · Migración 0175 · La apertura de servicio, en sus tres formatos
-- ============================================================
-- Pedido por Lesly a través de Santos (05-09), con tres correos reales de
-- ejemplo (Mercedarias Misioneras, Peru Vacation Rentals y Motorgas):
--
--   «Una vez que postventa hace todos los pasos —confirmación de finanzas,
--    prueba de embalaje, coordinar con el cliente— y llena datos como
--    dirección a dónde llega, con qué agencia, la persona que recibe,
--    teléfono y DNI, todo eso va plasmado en una APERTURA DE SERVICIO donde
--    se va a detallar todo lo que se va a hacer (…) aquí se tienen los tres
--    formatos y todo se debe llenar en automático con todos los datos que ya
--    se tienen.»
--
-- LOS TRES FORMATOS SON EL MISMO. Solo cambia el encabezado de la fila 1:
--   ENTREGA DE:                    el equipo va a la agencia
--   ENTREGA Y PUESTA EN MARCHA DE: el técnico lo lleva y lo instala
--   SERVICIO DE MANTENIMIENTO:     el técnico va a hacer mantenimiento
--                                  preventivo o correctivo
--
-- QUÉ YA TENÍAMOS Y QUÉ NO. El CRM ya emite una «apertura de despacho»
-- (0150): el documento interno con el que almacén despacha sin preguntar a
-- nadie. Lo que faltaba es el formato que SALE al equipo por correo, con sus
-- nueve filas numeradas. De sus datos ya estaban en el sistema el cliente y su
-- RUC, la dirección verificada, quién recibe con su teléfono y DNI, y la
-- descripción del equipo con su serie. Faltaban cinco cosas que hoy no las
-- guarda nadie y viajan en la cabeza de quien arma el correo:
--
--   · a qué hora es el servicio (los correos dicen «08:00 AM», «11:00 AM»),
--   · qué día,
--   · qué técnico va,
--   · cómo se mueve ese técnico («TRANSPORTE CONTRATADO», «CONTRATADO POR EL
--     CLIENTE»),
--   · y las guías que se piden («se solicita 01 guía para la entrega»).
--
-- Y una sexta, que aparece en el caso Motorgas: cuando la entrega es EN
-- NUESTRAS INSTALACIONES, el correo agrega una DIRECCIÓN FINAL —a dónde
-- termina yendo el equipo después—, que no es la dirección de entrega.
--
-- Las filas 8 y 9 del formato (requisición por movilidad y monto de viáticos)
-- dicen siempre «Gestión de Contabilidad»: son constantes del formato, no
-- datos, y no se guardan.
-- ============================================================

alter table public.servicios_postventa
  -- Cuál de los tres formatos. Se propone solo a partir del tipo de servicio
  -- y de la modalidad, y postventa lo corrige si hace falta.
  add column if not exists apertura_tipo      text,
  -- Día y hora del servicio, tal como van en el correo.
  add column if not exists apertura_fecha     date,
  add column if not exists apertura_hora      time,
  -- Quién va. Es texto y no un uuid a propósito: los técnicos que van a campo
  -- —Cristian Dolorier y los que vengan— no tienen cuenta en el CRM.
  add column if not exists tecnico_asignado   text,
  -- Cómo se mueve el técnico. Texto libre porque los correos usan frases, no
  -- un catálogo: «TRANSPORTE CONTRATADO», «TRANSPORTE CONTRATADO POR EL
  -- CLIENTE», y mañana habrá otra.
  add column if not exists transporte         text,
  -- Lo que va entre paréntesis en la fila 1: las guías que se solicitan y
  -- cualquier aviso para quien despacha.
  add column if not exists apertura_nota      text,
  -- Solo para el caso «EN NUESTRAS INSTALACIONES»: a dónde va después.
  add column if not exists direccion_final    text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'servicios_postventa_apertura_tipo_check') then
    alter table public.servicios_postventa
      add constraint servicios_postventa_apertura_tipo_check
      check (apertura_tipo is null or apertura_tipo in ('entrega', 'entrega_puesta_marcha', 'mantenimiento'));
  end if;
end $$;

comment on column public.servicios_postventa.apertura_tipo is
  'Cuál de los tres formatos de apertura de servicio: entrega (va a la agencia), entrega_puesta_marcha (el técnico lo lleva e instala) o mantenimiento. Es lo único que distingue a los tres (Lesly, 05-09).';
comment on column public.servicios_postventa.apertura_hora is
  'Hora del servicio, la que va en la columna de observaciones de la fila 1 del formato.';
comment on column public.servicios_postventa.tecnico_asignado is
  'Nombre del técnico que va. Texto y no uuid: los técnicos de campo no tienen cuenta en el CRM.';
comment on column public.servicios_postventa.transporte is
  'Medio de transporte del personal técnico, tal como se escribe en el correo.';
comment on column public.servicios_postventa.apertura_nota is
  'Lo que va entre paréntesis en la fila 1 del formato: las guías que se solicitan y avisos para quien despacha.';
comment on column public.servicios_postventa.direccion_final is
  'Cuando la entrega es en nuestras instalaciones, a dónde va el equipo después (caso Motorgas, 25-08).';
