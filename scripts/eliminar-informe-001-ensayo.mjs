// ============================================================
// CRM EFAMEINSA · Eliminar el informe EFAMEINSA 001-2026, que fue un ensayo
// ============================================================
// Santos, 02-09: «eliminar ahora ese porque fue de prueba y que no aparezca
// en las vistas de los usuarios, sobre todo Central».
//
// Katerine lo emitió el 24-08 a las 9:49, el día antes del arranque, mientras
// se capacitaba: un ítem «ssaasdads» a US$ 10.000, condiciones «5050»,
// presupuesto 100-25 que no existe, sin venta ni documentos. Gastó el número
// 001 de la serie EFAMEINSA. Ayer a las 16:37 Central le marcó «liquidación»
// en vivo y eso creó un pedido en postventa. Nunca salió a un cliente, así
// que acá NO aplica «anular, no borrar» (docs/19 §3, regla 2: esa es para lo
// que ya salió). Se borra con respaldo, y como es el ÚNICO informe EFAMEINSA
// y el contador está en 1, el contador vuelve a 0: el próximo cierre real de
// la serie será 001-2026 y no queda hueco.
//
// Uso: node --env-file=.env.local scripts/eliminar-informe-001-ensayo.mjs
import { writeFileSync } from "node:fs";
import { Client } from "pg";
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const q = async (s, p=[]) => (await bd.query(s, p)).rows;

const [inf] = await q(`select * from informes_cierre where codigo='001-2026' and serie='EFAMEINSA' and not es_prueba`);
if (!inf) { console.log("Ya no existe."); await bd.end(); process.exit(0); }
if (!(inf.items ?? []).some(i => /ssaasdads/.test(i.descripcion ?? ""))) throw new Error("Este no parece el ensayo (no tiene el ítem «ssaasdads»); no se toca.");
const pedidos = await q(`select * from servicios_postventa where informe_cierre_id=$1`, [inf.id]);
const otros = await q(`select codigo from informes_cierre where serie='EFAMEINSA' and not es_prueba and id<>$1`, [inf.id]);
const refs = {};
for (const [t, c] of [["informes_cierre_versiones","informe_id"],["correcciones_informe","informe_id"],["equipos_instalados","informe_cierre_id"],["atenciones","informe_cierre_id"]]) {
  refs[t] = (await q(`select count(*)::int n from ${t} where ${c}=$1`, [inf.id]).catch(() => [{ n: "sin columna" }]))[0].n;
}
console.log("referencias:", refs, "· pedidos postventa:", pedidos.length, "· otros informes EFAMEINSA reales:", otros.length);

const RESPALDO = "backups/informe-efameinsa-001-2026-ensayo-02-09.json";
writeFileSync(RESPALDO, JSON.stringify({ que_es: "Informe EFAMEINSA 001-2026 (ensayo de capacitación del 24-08) y su pedido de postventa, eliminados el 02-09-2026 a pedido de Santos.", informe: inf, servicios_postventa: pedidos }, null, 1));

await bd.query("begin");
try {
  await bd.query(`set local app.corrigiendo_cierre = 'si'`);
  await bd.query(`set local app.anulando_cierre = 'si'`);
  const p = await bd.query(`delete from servicios_postventa where informe_cierre_id=$1`, [inf.id]);
  const v = await bd.query(`delete from informes_cierre_versiones where informe_id=$1`, [inf.id]).catch(() => ({ rowCount: 0 }));
  const c = await bd.query(`delete from correcciones_informe where informe_id=$1`, [inf.id]).catch(() => ({ rowCount: 0 }));
  const i = await bd.query(`delete from informes_cierre where id=$1`, [inf.id]);
  if (i.rowCount !== 1) throw new Error("no se borró el informe");
  let contador = "sin tocar";
  if (otros.length === 0) {
    const r = await bd.query(`update correlativos set ultimo = 0 where clave='INFORME-EFAMEINSA-2026' and ultimo = 1`);
    contador = r.rowCount === 1 ? "INFORME-EFAMEINSA-2026 vuelve a 0 (el próximo cierre real será 001-2026)" : "no estaba en 1; se deja como está";
  }
  await bd.query("commit");
  console.log(`✓ eliminado el informe 001-2026 (${p.rowCount} pedido(s) de postventa, ${v.rowCount} versiones, ${c.rowCount} ventanas) · contador: ${contador} · respaldo → ${RESPALDO}`);
} catch (e) {
  await bd.query("rollback");
  console.error("✗ nada se tocó:", e.message);
  process.exit(1);
}
console.log("contadores ahora:", await q(`select clave, ultimo from correlativos where clave in ('INFORME-EFAMEINSA-2026','INFORME-OPEN-2026')`));
await bd.end();
