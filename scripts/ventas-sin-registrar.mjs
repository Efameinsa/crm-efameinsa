// Lista las ventas que las comerciales marcaron como cerradas en su Excel y
// que NO están registradas en el CRM.
//
// De dónde sale: C5 reportó el 24-08 dos ventas que «no figuran». Buscándolas
// apareció el patrón. El extractor del histórico SALTABA a propósito las filas
// con estado C4_VENTA —las ventas venían del archivo CONSOLIDADO CIERRE
// VENTAS, que era la fuente oficial— pero las que se cerraron DESPUÉS de ese
// consolidado no entraron por ningún lado.
//
// ⚠️ Esto NO se importa solo. Una venta mueve el embudo, los reportes de
// gerencia y las metas del comercial; y el Excel trae la mayoría sin monto.
// El script solo produce la lista para que gerencia la valide.
//
// Uso: node --env-file=.env.local scripts/ventas-sin-registrar.mjs [salida.xlsx]

import XLSX from "xlsx";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const DIR = "C:/Users/diseno/Downloads/ACTUALIZADOS";
const SALIDA = process.argv[2] ?? "C:/Users/diseno/Downloads/ventas-sin-registrar-24-08.xlsx";
const MAPA = { 4: "C4", 5: "C5", 8: "C1" };
const fechaExcel = (n) => {
  const v = Number(n);
  return v > 0 ? new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10) : null;
};

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const candidatas = new Map();
for (const f of readdirSync(DIR).filter((x) => /\.xlsx?$/i.test(x))) {
  const cod = MAPA[Number(/COMERCIAL\s*(\d+)/i.exec(f)?.[1])];
  if (!cod) continue;
  const wb = XLSX.readFile(join(DIR, f));
  for (const hoja of ["PROSP.", "COTIZ."]) {
    if (!wb.SheetNames.includes(hoja)) continue;
    for (const r of XLSX.utils.sheet_to_json(wb.Sheets[hoja], { defval: null })) {
      if (!/C4_VENTA/i.test(String(r.ESTADO ?? ""))) continue;
      const razon = String(r["NOMBRE_RAZON SOCIAL"] ?? "").trim();
      if (!razon) continue;
      const ppto = String(r.Nro_PPTO ?? "").trim();
      candidatas.set(`${cod}|${razon.toUpperCase()}|${ppto}`, {
        comercial: cod,
        cliente: razon,
        doc: String(r.DNI_RUC ?? "").trim(),
        fecha: fechaExcel(r.F_ESTADO),
        presupuesto: ppto,
        monto: r.MONTO ?? null,
        equipo: String(r.EQUIPO ?? "").trim(),
        detalle: String(r["DESCRIPCION ESTADO"] ?? "").trim(),
      });
    }
  }
}

const filas = [];
for (const v of candidatas.values()) {
  // ¿Hay ya una venta de ese cliente con ese Nº de presupuesto?
  const { rows } = await bd.query(
    `select count(*) n from ventas ve
       join oportunidades o on o.id = ve.oportunidad_id
       join cuentas c on c.id = o.cuenta_id
      where upper(btrim(c.razon_social)) like $1
        and ($2 = '' or ve.referencia_historica = $2)`,
    [`%${v.cliente.slice(0, 24).toUpperCase()}%`, v.presupuesto],
  );
  if (Number(rows[0].n) > 0) continue;

  // ¿Existe el presupuesto en el archivo de documentos? Sirve para confirmar
  // la razón social con la que se facturó y el monto real.
  const { rows: ch } = v.presupuesto
    ? await bd.query(
        `select serie, to_char(fecha,'YYYY-MM-DD') fecha, monto_sin_igv
           from cotizaciones_historicas where codigo = $1 order by fecha desc limit 1`,
        [v.presupuesto],
      )
    : { rows: [] };

  filas.push({
    Comercial: v.comercial,
    Cliente: v.cliente,
    "RUC/DNI": v.doc,
    "Fecha del cierre": v.fecha ?? "",
    "N.º presupuesto": v.presupuesto,
    "Monto (Excel)": v.monto ?? "",
    "Serie del presupuesto": ch[0]?.serie ?? "",
    "Monto del archivo": ch[0]?.monto_sin_igv ?? "",
    Equipo: v.equipo,
    "Lo que anotó la comercial": v.detalle,
  });
}

filas.sort((a, b) => String(b["Fecha del cierre"]).localeCompare(String(a["Fecha del cierre"])));

const wb = XLSX.utils.book_new();
const hoja = XLSX.utils.json_to_sheet(filas);
hoja["!cols"] = [{ wch: 10 }, { wch: 46 }, { wch: 13 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 40 }, { wch: 70 }];
XLSX.utils.book_append_sheet(wb, hoja, "Ventas sin registrar");
XLSX.writeFile(wb, SALIDA);

console.log(`Ventas marcadas C4_VENTA en el Excel: ${candidatas.size}`);
console.log(`SIN registrar en el CRM: ${filas.length}`);
const porCom = {};
for (const f of filas) porCom[f.Comercial] = (porCom[f.Comercial] ?? 0) + 1;
console.log("por cartera:", Object.entries(porCom).map(([k, v]) => `${k}=${v}`).join(" · "));
const conMonto = filas.filter((f) => f["Monto (Excel)"] !== "").length;
console.log(`con monto en el Excel: ${conMonto} de ${filas.length} — el resto habría que preguntarlo`);
console.log(`\n✓ ${SALIDA}`);
await bd.end();
