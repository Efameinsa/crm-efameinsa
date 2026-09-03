// 03-09-2026, decisiones de Carlos en la reunión de las 11:41-13:05 (docs/historial/19 y memoria).
//   B1  Contador de cierres OPEN a 12: los huecos 007-009 NO se rellenan («todo lo vacío queda anulado»);
//       el próximo cierre de un comercial es el 013.
//   B4  Contador de cotizaciones EFAMEINSA a 2211: los huecos 2186-2190 y 2202-2208 tampoco; próxima 2212.
//   B3  Reserva de los cierres OPEN 030-039 para postventa (serie de Word desde el 30 que luego se sube):
//       el contador los salta, así los comerciales nunca llegan ahí.
//   B11 Se borran los dos borradores «X verif» de la cuenta de práctica de postventa (EFAMEINSA, sin número).
// Uso: node --env-file=.env.local scripts/aplicar-decisiones-03-09.mjs [--aplicar]
import { Client } from "pg";
import { writeFileSync } from "node:fs";
const APLICAR = process.argv.includes("--aplicar");
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const q = async (s, p=[]) => (await bd.query(s, p)).rows;
const foto = async () => {
  console.table(await q(`select clave, ultimo from correlativos where clave in ('INFORME-OPEN-2026','EFAMEINSA-2026') order by 1`));
  console.table(await q(`select clave, numero, reservado_para, motivo, vence_at from correlativos_reservas order by clave, numero`));
  console.log("borradores X verif:", (await q(`select count(*) n from informes_cierre where cliente_nombre='X verif' and emitido_at is null`))[0].n);
};
console.log("== ANTES"); await foto();
const [pv] = await q(`select id from perfiles where codigo_comercial='PV' and activo`);
try {
  await bd.query("begin");
  // respaldo de lo que se borra
  const resp = await q(`select * from informes_cierre where cliente_nombre='X verif' and emitido_at is null and correlativo is null`);
  writeFileSync("scripts/data/respaldo-x-verif-03-09.json", JSON.stringify(resp, null, 1));
  await bd.query(`update correlativos set ultimo = 12 where clave = 'INFORME-OPEN-2026' and ultimo < 12`);
  await bd.query(`update correlativos set ultimo = 2211 where clave = 'EFAMEINSA-2026' and ultimo < 2211`);
  for (let n = 30; n <= 39; n++) {
    await bd.query(`insert into correlativos_reservas (clave, numero, perfil_id, reservado_para, motivo, vence_at)
      values ('INFORME-OPEN-2026', $1, $2, 'Postventa', 'Cierres de postventa numerados en Word desde el 30 (Carlos, reunión 03-09 13:05); se suben al CRM con este número. Sin vencimiento.', null)
      on conflict (clave, numero) do nothing`, [n, pv.id]);
  }
  await bd.query(`select set_config('app.anulando_cierre','si',true)`);
  await bd.query(`delete from informes_cierre where cliente_nombre='X verif' and emitido_at is null and correlativo is null`);
  // Ensayo: ¿qué entregaría cada contador ahora?
  const [{ a }] = await q(`select siguiente_correlativo_informe('OPEN', 2026) a`);
  const [{ b }] = await q(`select siguiente_correlativo_anual('EFAMEINSA') b`);
  console.log(`próximo cierre OPEN: ${String(a).padStart(3,'0')}-2026 · próxima cotización EFAMEINSA: ${b}`);
  await bd.query(`update correlativos set ultimo = 12 where clave = 'INFORME-OPEN-2026'`);
  await bd.query(`update correlativos set ultimo = 2211 where clave = 'EFAMEINSA-2026'`);
  if (!APLICAR) { await bd.query("rollback"); console.log("== ENSAYO (nada cambió)"); }
  else { await bd.query("commit"); console.log("== APLICADO"); }
} catch (e) { await bd.query("rollback"); console.error("ROLLBACK:", e.message); }
await foto();
await bd.end();
