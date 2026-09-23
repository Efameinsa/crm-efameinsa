/**
 * 23-09-2026 · Katerine (C5): el cliente de INVERSIONES CRISOLITO S.A.C.
 * compra dos lavadoras y quiere la segunda a nombre de otra de sus empresas,
 * KARINA SAAVEDRA HOSPEDAJE E.I.R.L. (RUC 20616280717). Se crea su ficha en
 * la cartera de Katerine, COLGADA de Crisolito como grupo económico (0052):
 * son contribuyentes distintos —cada cotización sale a uno—, pero el mismo
 * cliente para todos (Santos: «que postventa también lo considere»).
 *
 * Uso: node --env-file=.env.local scripts/karina-saavedra-hospedaje.mjs [--aplicar]
 */
import pg from "pg";

const MADRE = "b33d04df-fa51-47bd-aa67-60e495aee9d7"; // INVERSIONES CRISOLITO S.A.C.
const KATERINE = "4379b0d4-1d15-419a-9090-a22686f5eef8";
const SANTOS = "492bced6-10ab-4d0c-8e4b-e430e0510b08";
const RUC = "20616280717";
const NOTA = "Misma dueña y mismo cliente que INVERSIONES CRISOLITO S.A.C. (RUC 20600300645): la segunda lavadora se cotiza a esta razón social a pedido del cliente. Creada el 23-09 a pedido de Katerine.";

const aplicar = process.argv.includes("--aplicar");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = (s, p = []) => c.query(s, p).then((r) => r.rows);
try {
  await q("begin");
  if ((await q("select 1 from cuentas where num_doc = $1", [RUC])).length) throw new Error("ese RUC ya tiene ficha");
  const [madre] = await q("select * from cuentas where id = $1", [MADRE]);
  if (madre.comercial_id !== KATERINE || madre.cuenta_padre_id) throw new Error("Crisolito ya no está como se revisó");

  const [cuenta] = await q(
    `insert into cuentas (tipo_doc, num_doc, razon_social, rubro_id, departamento, provincia, distrito, direccion, comercial_id, cartera_desde, cuenta_padre_id, notas)
     values ('RUC', $1, 'KARINA SAAVEDRA HOSPEDAJE E.I.R.L.', $2, 'LIMA', 'LIMA', 'LIMA', 'JR. CAMANA NRO. 828 LIMA - LIMA - LIMA', $3, hoy_lima(), $4, $5)
     returning id`,
    [RUC, madre.rubro_id, KATERINE, MADRE, NOTA],
  );
  await q(
    "insert into contactos (cuenta_id, nombre, telefono, email, es_principal, direccion) values ($1, 'KARINA SAAVEDRA', '943 261 767', 'ksaave@gmail.com', true, 'JR. CAMANA 828 - CERCADO - LIMA')",
    [cuenta.id],
  );
  // Un expediente abierto para que pueda cotizar desde la ficha nueva.
  const [op] = await q(
    `insert into oportunidades (cuenta_id, comercial_id, etapa, intencion, proxima_accion, proxima_accion_at, origen)
     values ($1, $2, 'seguimiento', 'medio', 'Enviar la cotización de la segunda lavadora', hoy_lima(), 'crm') returning id`,
    [cuenta.id, KATERINE],
  );
  await q("insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at) values ($1, 'nota', $2, $3, now())", [op.id, NOTA, SANTOS]);
  await q("insert into asignaciones (cuenta_id, de_comercial, a_comercial, motivo, decidida_por, notas) values ($1, null, $2, 'cartera_existente', $3, $4)", [cuenta.id, KATERINE, SANTOS, NOTA]);

  console.log({ cuenta: cuenta.id, oportunidad: op.id });
  console.log(await q("select razon_social, num_doc, es_madre, es_esta, comercial from grupo_economico($1)", [cuenta.id]));
  await q(aplicar ? "commit" : "rollback");
  console.log(aplicar ? "APLICADO" : "ensayo: deshecho (use --aplicar)");
} catch (e) {
  await q("rollback");
  console.error("NO se aplicó:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
