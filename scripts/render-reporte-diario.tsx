// Renderiza el PDF del reporte diario de un comercial con el mismo componente
// que usa /api/reportes/diario, para mirarlo sin navegador ni sesión.
// Nació el 25-08 para corregir la maquetación que reportó Darwin (barra de la
// meta tapando el texto y notas de seguimiento cortadas).
//
// Uso: npx tsx scripts/render-reporte-diario.tsx <nombre-o-codigo> [fecha] [salida.pdf]

import { readFileSync, writeFileSync } from "node:fs";
import { renderToBuffer } from "@react-pdf/renderer";
import { Client } from "pg";
import React from "react";
import { ReporteDiarioPdf } from "../src/lib/pdf/reporte-diario-pdf";

if (!process.env.DATABASE_URL) {
  for (const linea of readFileSync(".env.local", "utf-8").split("\n")) {
    const i = linea.indexOf("=");
    if (i > 0 && !linea.trimStart().startsWith("#")) process.env[linea.slice(0, i).trim()] ??= linea.slice(i + 1).trim();
  }
}

const QUIEN = process.argv[2] ?? "kater";
const FECHA = process.argv[3] ?? null;
const SALIDA = process.argv[4] ?? "scripts/data/reporte-revision.pdf";

async function main() {
  const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await bd.connect();
  const { rows } = await bd.query(
    `select id, nombre from perfiles where nombre ilike '%' || $1 || '%' or codigo_comercial = upper($1) limit 1`,
    [QUIEN],
  );
  if (!rows[0]) throw new Error(`No hay comercial que diga «${QUIEN}»`);
  const r = (await bd.query(`select reporte_diario_comercial($1, $2) rep`, [rows[0].id, FECHA])).rows[0].rep;
  await bd.end();

  const logo = readFileSync("public/logo-efameinsa.png");
  const fechaLarga = new Date(`${r.fecha}T12:00:00`).toLocaleDateString("es-PE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const buffer = await renderToBuffer(
    <ReporteDiarioPdf
      logoBuffer={logo}
      fecha={fechaLarga}
      comercial={r.comercial}
      resumen={r.resumen}
      seguimientos={r.seguimientos}
      cotizaciones={r.cotizaciones}
      ventas={r.ventas}
      leads={r.leads}
      complementarias={r.complementarias}
      agenda={r.agenda}
      planificacion_manana={r.planificacion_manana}
    />,
  );
  writeFileSync(SALIDA, buffer);
  console.log(`✓ ${rows[0].nombre} · ${r.fecha} → ${SALIDA} (${Math.round(buffer.length / 1024)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
