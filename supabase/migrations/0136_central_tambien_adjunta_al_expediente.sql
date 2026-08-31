-- ============================================================
-- CRM EFAMEINSA · Migración 0136 · Central también adjunta al expediente
-- ============================================================
-- EL HUECO, encontrado el 31-08 cuando Santos preguntó «¿me confirmas que
-- Central puede subir el expediente?». No podía. El diseño del expediente
-- (0099) lo dice textual —«la comercial manda la OC, Central pega el
-- voucher»— y la pantalla de cierres de Central OFRECE el botón de agregar…
-- pero la política de edición (0049) solo dejaba escribir a gerencia/admin y
-- al comercial dueño de la cuenta. Central apretaba «Agregar» y la base lo
-- filtraba en silencio: cero filas, cero aviso. Un botón que no hace nada es
-- peor que no tener el botón.
--
-- POR QUÉ ES SEGURO ABRIRLE LA EDICIÓN A CENTRAL. Central ya lo ve todo
-- (informes_lectura, 0049) y ya puede anular con el código del supervisor
-- (0110). Lo que protege al expediente no es esta política sino las reglas
-- que ya existen para todos: emitido, los documentos solo se AGREGAN (0099)
-- y el informe no se reemplaza — se anula con código y queda en la historia.
-- La separación práctica/real va incluida, como en toda política desde 0088.

drop policy if exists informes_edita_central on informes_cierre;
create policy informes_edita_central on informes_cierre for update to authenticated
  using (
    (select rol_actual()) = 'central'
    and es_prueba = es_cuenta_prueba()
  )
  with check (
    (select rol_actual()) = 'central'
    and es_prueba = es_cuenta_prueba()
  );
