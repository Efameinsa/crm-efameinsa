-- ============================================================
-- CRM EFAMEINSA · Migración 0057 · DNI del contacto que recibe
-- ============================================================
-- docs/11-plan-correcciones-prueba-23-08.md · ítem B4.
--
-- En el informe de cierre, "¿Quién recibe?" solo dejaba elegir entre los
-- contactos que ya tenía la cuenta. Probándolo el 23-08 Darwin señaló el caso
-- real: la entrega la puede recibir otra persona —«debería de haber una opción
-- de poner a otros y registrar ese otros… y obviamente ese otros, con DNI, con
-- lo que sea, debería irse guardando como un contacto dentro de este negocio»—.
--
-- El DNI importa porque es lo que el transportista pide al entregar; hasta hoy
-- se escribía a mano en el Word y se perdía. `contactos` no tenía dónde
-- guardarlo: `cargo` es el área y meterlo ahí lo habría vuelto inbuscable.

alter table contactos
  add column if not exists documento text;

comment on column contactos.documento is
  'DNI/CE de la persona, cuando hace falta identificarla en la entrega (migración 0057). Nullable: la mayoría de contactos comerciales no lo necesitan.';
