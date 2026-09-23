-- OPEN PRIMERO: EFAMEINSA SOLO CON MOTIVO (23-09-2026).
--
-- Decisión de gerencia del 23-09-2026: «Clientes nuevos: la facturación debe
-- realizarse inicialmente a través de Open Investments, con el objetivo de
-- comenzar a fidelizar al cliente y posicionar a Open como su proveedor
-- habitual. Clientes antiguos: … si el cliente solicita expresamente que la
-- facturación se realice a nombre de Efameinsa, inicialmente debemos intentar
-- mantener la facturación con Open y explicar el motivo del cambio.
-- Excepción: si, pese a la explicación, el cliente persiste en su solicitud de
-- facturar con Efameinsa, se podrá realizar la facturación a través de
-- Efameinsa. La idea es que Open Investments sea la primera opción.»
--
-- Santos decidió no bloquear Efameinsa (tampoco para clientes nuevos) sino
-- pedir el motivo por escrito. El cotizador y el informe de cierre arrancan en
-- OPEN; elegir EFAMEINSA pide una frase de por qué, que queda aquí para que
-- gerencia la vea (indicador del Panel comercial).
--
-- No se tocan funciones: el motivo se escribe con un UPDATE desde la acción del
-- servidor mientras la cotización es borrador (política cotizaciones_update:
-- el comercial dueño de la oportunidad; el trigger de inmutabilidad solo
-- congela serie, número, cliente e importes). En el informe viaja en la misma
-- fila que el resto del borrador (insert/update directo, políticas
-- informes_crea/informes_edita), y se congela al emitir como todo lo demás.

alter table public.cotizaciones add column if not exists motivo_serie text;
alter table public.informes_cierre add column if not exists motivo_serie text;

comment on column public.cotizaciones.motivo_serie is
  'Por qué esta cotización va con EFAMEINSA y no con OPEN (decisión de gerencia del 23-09-2026: Open es la primera opción; Efameinsa solo si el cliente insiste después de explicarle). NULL en las OPEN y en las anteriores al 23-09.';
comment on column public.informes_cierre.motivo_serie is
  'Por qué este cierre factura con EFAMEINSA y no con OPEN (decisión de gerencia del 23-09-2026). Si no se escribió en el cierre, se copia el de la cotización de la que sale. NULL en los OPEN y en los anteriores al 23-09.';
