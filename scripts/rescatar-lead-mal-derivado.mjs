// Devuelve a la cola de triaje comercial un contacto que se registró con el
// área equivocada.
//
// 24-08: Central registró PRO-08927 —«PROSPECTO SE COMUNICA VÍA WHATSAPP A LA
// CENTRAL SOLICITANDO COTIZACIÓN DE EQUIPOS DE LAVANDERÍA PARA UN
// AUTOSERVICIO»— eligiendo área "otros". Al no ser comercial, el lead quedó en
// estado 'derivado_area' y salió de la bandeja de triaje. Y como NINGUNA
// pantalla lee ese estado, el prospecto desapareció sin que nadie se enterara:
// es lo que hizo preguntar a Central «¿cuántos minutos se demora para
// ingreso?» — entraba al instante, pero no se veía.
//
// Uso: node --env-file=.env.local scripts/rescatar-lead-mal-derivado.mjs PRO-08927 [--aplicar]

import { Client } from "pg";

const CODIGO = process.argv[2];
const APLICAR = process.argv.includes("--aplicar");
if (!CODIGO) {
  console.error("Falta el código del lead. Ej: PRO-08927");
  process.exit(1);
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows } = await bd.query(
  `select codigo, estado, area_destino, nombre_contacto, razon_social, mensaje, recibido_at
     from leads where codigo = $1`,
  [CODIGO],
);
if (!rows.length) {
  console.error(`No existe el lead ${CODIGO}`);
  process.exit(1);
}
const l = rows[0];
console.log(`${l.codigo} · ${l.nombre_contacto}${l.razon_social ? " · " + l.razon_social : ""}`);
console.log(`  estado actual : ${l.estado} · área: ${l.area_destino}`);
console.log(`  solicita      : ${String(l.mensaje).replace(/\n/g, " ")}`);
console.log(`  quedaría en   : pendiente_triaje · área comercial (visible en la bandeja)`);

if (l.estado !== "derivado_area") {
  console.log(`\n(No hace falta: no está en 'derivado_area'.)`);
  await bd.end();
  process.exit(0);
}

if (!APLICAR) {
  console.log("\n(Dry-run: no se tocó nada. Correr con --aplicar.)");
  await bd.end();
  process.exit(0);
}

await bd.query(
  `update leads set estado = 'pendiente_triaje', area_destino = 'comercial', updated_at = now() where codigo = $1`,
  [CODIGO],
);
const { rows: fin } = await bd.query(`select estado, area_destino from leads where codigo=$1`, [CODIGO]);
console.log(`\n✓ ${CODIGO} → ${fin[0].estado} · ${fin[0].area_destino}. Ya aparece en la bandeja de Central.`);
await bd.end();
