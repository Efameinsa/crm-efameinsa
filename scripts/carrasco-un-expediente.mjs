/**
 * 23-09-2026 · Brenda (C1): CARRASCO MEDICAL IMPORT E.I.R.L. le salía dos
 * veces en «Mi día» aunque ya lo había llamado. Tenía TRES expedientes
 * abiertos por las mismas secadoras (dos del Excel y uno del CRM) y anotaba
 * en uno distinto cada vez. Un expediente por cliente (Carlos, 0141):
 * queda el de las cotizaciones Presu_748/749/754 con la próxima llamada que
 * ella programó hoy (24-09 10:30); los otros dos se archivan como lo hace el
 * combo de etapas (historico, sin cerrada_at: se pueden retomar). Decisión
 * de Santos. Las llamadas siguen en el historial del cliente.
 *
 * Uso: node --env-file=.env.local scripts/carrasco-un-expediente.mjs [--aplicar]
 */
import pg from "pg";

const QUEDA = "e5b58a49-052d-4a2c-89d3-b9964b6ab713"; // con las 3 cotizaciones
const ARCHIVAR = ["a4925260-381b-4f45-a94e-c5cd63ea2098", "87e2249f-13de-4654-a3ba-8bfa937e19d0"];
const SANTOS = "492bced6-10ab-4d0c-8e4b-e430e0510b08";
const aplicar = process.argv.includes("--aplicar");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = (s, p = []) => c.query(s, p).then((r) => r.rows);
try {
  await q("begin");
  const ops = await q("select id, etapa from oportunidades where id = any($1) for update", [[QUEDA, ...ARCHIVAR]]);
  if (ops.length !== 3 || ops.some((o) => o.etapa !== "seguimiento")) throw new Error(`no están como se revisaron: ${JSON.stringify(ops)}`);

  await q(
    "update oportunidades set etapa = 'historico', motivo_rechazo_id = null, cerrada_at = null, updated_at = now() where id = any($1)",
    [ARCHIVAR],
  );
  for (const id of ARCHIVAR)
    await q("insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at) values ($1, 'nota', $2, $3, now())", [
      id,
      "Archivado el 23-09 a pedido de Brenda: era un expediente repetido del mismo requerimiento (secadoras). El seguimiento sigue en el expediente de las cotizaciones Presu_748/749/754.",
      SANTOS,
    ]);
  await q(
    "update oportunidades set proxima_accion = 'Volver a llamar', proxima_accion_at = '2026-09-24 00:00-05', proxima_accion_hora = '10:30', updated_at = now() where id = $1",
    [QUEDA],
  );
  await q("insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at) values ($1, 'nota', $2, $3, now())", [
    QUEDA,
    "Queda como el único expediente del cliente (23-09): se archivaron los otros dos repetidos. Las llamadas de hoy de Brenda (Ing. Vásquez, en reunión; volver a llamar) están en el historial del cliente. Próxima llamada: 24-09 10:30, la que ella programó.",
    SANTOS,
  ]);
  console.log(await q("select o.id, o.etapa, o.proxima_accion, o.proxima_accion_at, o.proxima_accion_hora from oportunidades o where o.cuenta_id = 'eeaa8247-bef6-42e3-8ff7-d6f124868c4d' order by o.created_at"));
  await q(aplicar ? "commit" : "rollback");
  console.log(aplicar ? "APLICADO" : "ensayo: deshecho (use --aplicar)");
} catch (e) {
  await q("rollback");
  console.error("NO se aplicó:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
