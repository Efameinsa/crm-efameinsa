-- QUIEN CORRIGE VE SU PROPIA CORRECCIÓN.
--
-- `autorizaciones_supervisor` solo la leía gerencia. Tiene sentido para el
-- registro de autorizaciones —es el control de gerencia— pero deja a Central
-- sin ver lo único que le importa de ahí: que su corrección quedó anotada.
--
-- Salió al probar la corrección del canal (0195): Central corrige, la pantalla
-- dice «queda registrado», y en su ficha no aparecía nada. Gerencia sí lo veía.
-- Una promesa que quien la recibe no puede comprobar es peor que no hacerla:
-- invita a corregir dos veces creyendo que no se guardó.
--
-- Se abre SOLO lo propio: las filas donde uno es quien PIDIÓ la autorización.
-- Las de los demás siguen siendo de gerencia, que es de lo que se trata.

create policy autorizaciones_propias_lectura
  on autorizaciones_supervisor
  for select
  using (solicitante_id = (select auth.uid()));

comment on policy autorizaciones_propias_lectura on autorizaciones_supervisor is
  'Quien pidió la autorización ve su propia corrección: sin esto, la pantalla le promete que queda registrado y no puede comprobarlo (08-09).';
