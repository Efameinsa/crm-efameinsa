// Deshace lo que las pruebas del fin de semana (22/23-08) dejaron ENCIMA de
// oportunidades HISTÓRICAS. `limpiar-pruebas-fin-de-semana.mjs` no las alcanza
// porque solo cascadea desde oportunidades con origen='crm', y Darwin probó
// sobre oportunidades ya existentes (origen='historico_excel').
//
// Estado previo reconstruido cruzando:
//   · scripts/data/oportunidades-historicas.json  (baseline del import 21-08)
//   · scripts/data/cambios-comercial-22-08.json   (sync del viernes 18:31Z)
//   · las filas hermanas del mismo cliente que NADIE tocó el finde
//
// Uso: node --env-file=.env.local scripts/restaurar-oportunidades-pruebas-finde.mjs [--aplicar]
import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const SNAP = "2026-08-22T18:44:27.374Z";

// id -> estado previo + por qué se sabe
const RESTAURAR = [
  { id: "a9881ffb-2476-41be-b923-15a5fa14bc28", cliente: "HOTEL SAN MARTIN DE MARCONA",
    set: { etapa: "filtrada", monto_estimado: null, cerrada_at: null },
    porque: "el sync del 22-08 la dejó en 'filtrada' (procedencia F_PROSREF + su actividad [Actualización 22-08 COTIZ.]); la prueba la cerró como venta" },
  { id: "f028860e-aaa1-404b-a42c-2ccf717f2cf0", cliente: "NIETO GAMBOA FREDY",
    set: { monto_estimado: null, proxima_accion: "Llamar al cliente", proxima_accion_at: "2026-07-22" },
    porque: "baseline C5 (fechaEstado 2026-07-20); el sync del viernes solo tocó la fila de C4" },
  { id: "594e1047-fde0-47e1-aae7-3d44181b42a2", cliente: "MODAS DIVERSAS DEL PERU SAC",
    set: { monto_estimado: null },
    porque: "etapa y próxima acción ya son las que dejó el sync (seguimiento / 2026-08-22); solo sobra el monto del presupuesto de prueba" },
  { id: "cdeba132-39cc-4e10-b227-4f945d44300b", cliente: "YARINGAÑO MENDOZA - LAVANDERIA BUENOS AIRES",
    set: { proxima_accion: "Llamar al cliente", proxima_accion_at: "2023-03-03" },
    porque: "baseline C5 'potencial'; el sync del viernes no la tocó y la prueba borró su próxima acción" },
];

async function main() {
  const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await bd.connect();

  const act = await bd.query(
    `select a.id, a.tipo, a.nota, a.realizada_at, cu.razon_social
       from actividades a
       left join oportunidades o on o.id = a.oportunidad_id
       left join cuentas cu on cu.id = o.cuenta_id
      where a.realizada_at > $1 and a.realizada_at < now()`, [SNAP]);

  console.log("=== OPORTUNIDADES A RESTAURAR ===");
  for (const r of RESTAURAR) {
    const antes = await bd.query(
      `select etapa, monto_estimado, proxima_accion, proxima_accion_at, cerrada_at from oportunidades where id=$1`, [r.id]);
    if (!antes.rows.length) { console.log(`  ⚠ ${r.cliente}: no existe ${r.id}`); continue; }
    console.log(`\n  ${r.cliente}`);
    console.log(`    ahora:  ${JSON.stringify(antes.rows[0])}`);
    console.log(`    queda:  ${JSON.stringify(r.set)}`);
    console.log(`    por qué: ${r.porque}`);
  }

  console.log(`\n=== ACTIVIDADES DE PRUEBA A BORRAR (${act.rows.length}) ===`);
  for (const a of act.rows) console.log(`  ${a.realizada_at.toISOString()} | ${a.tipo} | ${a.razon_social} | ${String(a.nota).slice(0, 60)}`);

  if (!APLICAR) {
    console.log("\n(Dry-run: no se tocó nada. Correr con --aplicar.)");
    await bd.end();
    return;
  }

  await bd.query("begin");
  try {
    for (const r of RESTAURAR) {
      const campos = Object.keys(r.set);
      const sets = campos.map((c, i) => `${c} = $${i + 2}`).join(", ");
      await bd.query(`update oportunidades set ${sets} where id = $1`, [r.id, ...campos.map(c => r.set[c])]);
    }
    const del = await bd.query(`delete from actividades where realizada_at > $1 and realizada_at < now()`, [SNAP]);
    await bd.query("commit");
    console.log(`\n✓ ${RESTAURAR.length} oportunidades restauradas · ${del.rowCount} actividades de prueba borradas.`);
  } catch (e) {
    await bd.query("rollback");
    console.error("\n✗ Rollback:", e.message);
    process.exitCode = 1;
  }
  await bd.end();
}
main();
