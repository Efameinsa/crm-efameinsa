// Ensayo de la 0198 dentro de una transacción que SIEMPRE se revierte.
import { readFileSync } from "node:fs";
import { Client } from "pg";
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const sql = readFileSync("supabase/migrations/0198_una_etapa_que_no_aplica_se_saltea.sql", "utf8");
let ok = 0, mal = 0;
const afirmar = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };
await bd.query("begin");
try {
  await bd.query(sql);
  await bd.query(sql); // idempotente
  afirmar("la migración corre entera, y dos veces", true);
  const { rows: [a] } = await bd.query(`select id, etapa from atenciones where es_prueba order by id limit 1`);
  // Se deja el caso de práctica como si recién se hubiera diagnosticado: sin
  // los sellos de más adelante, que es lo que la prueba quiere mirar.
  await bd.query(`update atenciones set etapa='diagnostico', etapas_omitidas='{}'::jsonb,
      programada_at=null, atendido_at=null, pruebas_at=null, conformidad_at=null where id=$1`, [a.id]);
  // Una excepción aborta la transacción entera, así que cada intento va en su
  // propio punto de retorno: si no, la primera prueba que DEBE fallar tumba
  // todas las demás y el ensayo miente.
  let n = 0;
  const intenta = async (etapa, motivo) => {
    const punto = "p" + ++n;
    await bd.query("savepoint " + punto);
    try {
      await bd.query("select omitir_etapa_atencion($1,$2,$3)", [a.id, etapa, motivo]);
      await bd.query("release savepoint " + punto);
      return null;
    } catch (e) {
      await bd.query("rollback to savepoint " + punto);
      return String(e.message).split("|")[0];
    }
  };

  afirmar("no deja saltear el diagnóstico", (await intenta("diagnostico", "no aplica acá")) !== null);
  afirmar("no deja saltear una etapa lejana", (await intenta("conformidad", "no aplica acá")) !== null);
  afirmar("exige escribir el motivo", (await intenta("planificacion", "no")) !== null);
  const err1 = await intenta("planificacion", "se resolvió por videollamada, no hay visita");
  afirmar("saltea la que toca", err1 === null, err1 ?? "");
  const { rows: [d] } = await bd.query(`select etapa, programada_at, etapas_omitidas from atenciones where id=$1`, [a.id]);
  afirmar("la atención avanzó a planificación", d.etapa === "planificacion");
  afirmar("y NO se selló como cumplida", d.programada_at === null, "programada_at sigue vacía");
  afirmar("queda escrito el motivo", String(d.etapas_omitidas?.planificacion?.motivo ?? "").includes("videollamada"));
  afirmar("y se puede saltear la siguiente (el «check, check»)", (await intenta("atencion", "el técnico no tiene que ir")) === null);
  const { rows: [e] } = await bd.query(`select etapa, jsonb_object_keys(etapas_omitidas) k from atenciones where id=$1 limit 1`, [a.id]);
  afirmar("la atención llegó a atención sin pasar por la visita", e.etapa === "atencion");
} catch (e) {
  afirmar("la migración corre entera", false, e.message.split("\n")[0]);
} finally {
  await bd.query("rollback");
  const { rows: [c] } = await bd.query(`select count(*) n from information_schema.columns where table_name='atenciones' and column_name='etapas_omitidas'`);
  console.log(`\n(revertido — la columna existe en la base: ${c.n === "1" ? "sí" : "no"})`);
  await bd.end();
}
console.log(`${ok} ok, ${mal} mal.`);
process.exit(mal ? 1 : 0);
