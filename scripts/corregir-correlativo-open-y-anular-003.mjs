// 02-09-2026, después de la reunión de Santos con Lesly y postventa.
//
// 1) La serie OPEN de informes de cierre salta de 005 a 010. No fue por los
//    duplicados: la migración 0145 (01-09 15:10) puso el contador en el MÁXIMO
//    emitido, y el máximo era el 010 reservado para Ariana (0124). Por eso el
//    011 y el 012 salieron después del 010 y los números 006 a 009 quedaron
//    sin usar. Carlos lo había dicho al revés («le damos el 10 y después lo
//    agregamos mientras van sumándose»): el contador vuelve al 5; la función
//    siguiente_correlativo_informe() ya salta los números existentes, así que
//    los próximos cuatro cierres reciben 006-009 y luego sigue en 013.
// 2) El 003-2026 (GRUPO ALIMENTICIO) es duplicado del 004-2026 (GRUPO
//    ALIMENTICIO SAN JOSE S.A.). Central pidió anularlo. La venta ya se movió al
//    004 y su pedido de postventa ya está cerrado (corregir-duplicados-001-003),
//    así que acá solo se marca anulado, con el mismo formato que dejó Central
//    al anular el 001 desde la pantalla.
//
// Uso: node --env-file=.env.local scripts/corregir-correlativo-open-y-anular-003.mjs [--aplicar]
import { Client } from "pg";
const APLICAR = process.argv.includes("--aplicar");
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const q = async (s, p=[]) => (await bd.query(s, p)).rows;
const ADMIN = '7903ef3b-b139-4fa9-aaec-83f172ae7c69';   // admin@efameinsa.com
const SANTOS = '492bced6-10ab-4d0c-8e4b-e430e0510b08';  // Santos Vilcachagua, gerencia
const foto = async () => {
  console.table(await q(`select clave, ultimo from correlativos where clave = 'INFORME-OPEN-2026'`));
  console.table(await q(`select codigo, anulado_at::timestamptz(0) anulado, anulado_motivo, venta_id is not null venta from informes_cierre where serie='OPEN' and anio=2026 and not es_prueba order by correlativo`));
};
console.log("== ANTES"); await foto();
try {
  await bd.query("begin");
  await bd.query(`select set_config('app.anulando_cierre','si',true)`);
  await bd.query(`update correlativos set ultimo = 5 where clave = 'INFORME-OPEN-2026'`);
  await bd.query(`update informes_cierre set anulado_at = now(), anulado_por = $1, anulado_autorizo = $2,
      anulado_motivo = 'Duplicado del 004-2026 (mismo cliente e importe; el comercial adjuntó un código de equipo errado). Anulado a pedido de Central tras la reunión con Lesly del 02-09; la venta y el pedido siguen en el 004-2026.'
    where serie='OPEN' and anio=2026 and correlativo=3 and not es_prueba and anulado_at is null`, [ADMIN, SANTOS]);
  // Ensayo del contador: ¿qué número daría ahora? (se hace dentro de la transacción y se deshace)
  const [{ n }] = await q(`select siguiente_correlativo_informe('OPEN', 2026) n`);
  console.log(`El próximo número que entregaría la serie OPEN: ${String(n).padStart(3,'0')}-2026`);
  await bd.query(`update correlativos set ultimo = 5 where clave = 'INFORME-OPEN-2026'`);
  if (!APLICAR) { await bd.query("rollback"); console.log("== ENSAYO (sin --aplicar, nada cambió)"); }
  else { await bd.query("commit"); console.log("== APLICADO"); }
  await foto();
} catch (e) { await bd.query("rollback"); console.error("ROLLBACK:", e.message); }
await bd.end();
