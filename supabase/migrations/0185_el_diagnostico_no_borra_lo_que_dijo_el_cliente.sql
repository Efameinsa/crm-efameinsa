-- Lo que reportó el cliente y lo que diagnosticó el técnico son DOS cosas.
--
-- QUÉ PASABA. La atención tenía un solo campo, `detalle`. Ahí entraba lo que
-- el cliente dijo al llamar —«la lavadora no centrifuga y muestra error
-- E-07»— y ahí mismo escribía después el técnico su diagnóstico. Guardar el
-- diagnóstico BORRABA el texto original, sin aviso y sin forma de volver
-- atrás. Lo encontró el tester de UI/UX el 08-09-2026 y es el hallazgo más
-- grave de su informe.
--
-- POR QUÉ IMPORTA MÁS DE LO QUE PARECE. Lo que dice el cliente es prueba. En
-- un reclamo de garantía, la diferencia entre «no centrifuga» y «se le metió
-- una moneda en la bomba» decide quién paga. Perder la versión del cliente
-- deja al área sin el único registro de lo que se prometió atender.
--
-- Se agrega el campo propio. No se migra nada hacia atrás a propósito: en las
-- atenciones ya diagnosticadas el texto original NO existe —lo pisó el
-- diagnóstico— y adivinar cuál de los dos era sería inventar prueba. Lo que
-- hay en `detalle` se queda donde está; de acá en adelante los dos conviven.

alter table atenciones
  add column if not exists diagnostico text;

comment on column atenciones.detalle is
  'Lo que reportó el CLIENTE, con sus palabras. Es prueba: no se edita al diagnosticar.';
comment on column atenciones.diagnostico is
  'Lo que encontró el técnico. Campo propio desde la 0185: antes pisaba `detalle`.';
