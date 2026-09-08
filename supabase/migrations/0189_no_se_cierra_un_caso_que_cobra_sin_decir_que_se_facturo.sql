-- Un caso que se cobra no se cierra sin decir qué se facturó.
--
-- QUÉ PASABA. El informe de UX del 08-09 recorrió las nueve etapas de un caso
-- marcado «Mantenimiento correctivo · se cobra» y lo cerró con la conformidad
-- firmada por el cliente sin que el sistema pidiera —ni ofreciera— una
-- cotización en ningún momento. La etiqueta «se cobra» quedaba decorativa en
-- la cabecera hasta el final.
--
-- POR QUÉ IMPORTA. Es el hallazgo de más plata de todo el informe: el área
-- ejecuta el trabajo, el cliente firma conforme, y no queda registro de que
-- había algo que facturar. Se pierde la venta sin que nadie se entere, que es
-- exactamente lo contrario de lo que un CRM tiene que evitar.
--
-- Se agrega el campo donde queda escrito POR QUÉ no se facturó, cuando no se
-- facturó. No es burocracia: «lo cubrió la garantía», «cortesía autorizada por
-- gerencia» o «el cliente desistió» son respuestas legítimas y distintas, y
-- hoy no había dónde ponerlas — así que no se ponían.
--
-- El candado en sí vive en `cerrarAtencion`, del lado del servidor: acá solo
-- va el lugar donde guardar la respuesta.

alter table atenciones
  add column if not exists no_facturado_motivo text;

comment on column atenciones.no_facturado_motivo is
  'Por qué un caso que se cobraba se cerró sin cotización (0189). Nulo cuando sí se facturó o cuando no correspondía cobrar.';
