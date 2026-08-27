import React from "react";
// Renderiza el PDF del cierre semanal con datos de muestra, para mirar la
// maqueta sin pasar por el navegador ni por la sesión. Mismo oficio que
// render-reporte-diario.tsx.
//
// Uso: npx tsx scripts/render-cierre-semanal.tsx
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { CierreSemanalPdf } from "../src/lib/pdf/cierre-semanal-pdf";
import type { CierreSemanal } from "../src/lib/cierre-semanal";

const dias = ["Lunes 24","Martes 25","Miércoles 26","Jueves 27","Viernes 28","Sábado 29"];
const cierre: CierreSemanal = {
  lunes: "2026-08-24", sabado: "2026-08-29",
  comercial: { nombre: "Katerine Tello", codigo: "C5" },
  proyeccion: {
    lunes: "2026-08-24",
    dias: dias.map((etiqueta, i) => ({
      iso: `2026-08-${24 + i}`, etiqueta,
      total: [30000, 45000, 0, 120000, 0, 12000][i],
      clientes: [[{cliente:"LAVANDERIA SAN MIGUEL S.A.C.",presupuesto:"1549-25",monto:30000}],
                 [{cliente:"HOTEL COSTA DEL SOL",presupuesto:"1551-25",monto:45000}],
                 [], [{cliente:"CLINICA INTERNACIONAL SEDE LIMA NORTE",presupuesto:"1560-25",monto:120000}],
                 [], [{cliente:"TEXTILES DEL PACIFICO",presupuesto:null,monto:12000}]][i],
    })),
    porUbicar: [
      { cliente: "MINERA LAS BAMBAS", presupuesto: "1499-25", monto: 88000 },
      { cliente: "HOSPITAL REGIONAL DE ICA", presupuesto: null, monto: 34000 },
    ],
    totalSemana: 207000, totalPorUbicar: 122000,
  },
  dias: dias.map((etiqueta, i) => ({
    iso: `2026-08-${24 + i}`, etiqueta,
    proyectado: [30000, 45000, 0, 120000, 0, 12000][i],
    vendido: [30000, 0, 0, 0, 0, 0][i],
    gestiones: [12, 8, 0, 15, 9, 4][i],
  })),
  proyectadoUsd: 207000, vendidoUsd: 30000, diferenciaUsd: -177000,
  ventas: [{ fecha: "2026-08-24", cliente: "LAVANDERIA SAN MIGUEL S.A.C.", monto: 30000, moneda: "USD", montoUsd: 30000 }],
  gestiones: 48, cotizacionesEnviadas: 6, cotizadoUsd: 254300,
};

async function main() {
  const logo = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));
  const buffer = await renderToBuffer(<CierreSemanalPdf logoBuffer={logo} rango="Del 24 al 29 de agosto de 2026" cierre={cierre} />);
  writeFileSync("scripts/data/cierre-revision.pdf", buffer);
  console.log(`PDF escrito:  bytes`);
}
main();
