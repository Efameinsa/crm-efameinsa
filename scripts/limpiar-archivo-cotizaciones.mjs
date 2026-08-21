// Limpia el archivo de cotizaciones históricas: quita las filas que no son
// cotizaciones y fusiona las que son el MISMO documento cargado dos veces.
//
// ⚠️ EL CRITERIO NO PUEDE SER EL CÓDIGO. Agrupar por `codigo` mete en la misma
// bolsa dos cosas distintas:
//   · el mismo documento guardado dos veces con el nombre cortado
//     ("…CLEAN SERVICE S" y "…CLEAN SERVICE S.A.C") → duplicado, se fusiona;
//   · dos cotizaciones a CLIENTES DISTINTOS que llevan el mismo número porque
//     el comercial lo tecleó mal dentro del documento ("Presu_1076-26,
//     WESTFALIA" guardado con el código 1072-26) → son reales, NO se tocan.
// Ese segundo caso es justo el problema que describió el ing. Carlos ("cliente
// A la 100, cliente B la 100"): es un hallazgo del negocio, no basura.
//
// Por eso se agrupa por el número del NOMBRE DEL ARCHIVO —que no depende de lo
// que el comercial escribió adentro— y solo se fusiona si además el nombre del
// cliente de una fila es prefijo del de la otra.
//
// Se FUSIONA, no se borra a secas: la copia que se conserva hereda los campos
// que solo tenía la descartada.
//
// Por defecto solo muestra el plan. Para ejecutarlo: --ejecutar
// Uso: node --env-file=.env.local scripts/limpiar-archivo-cotizaciones.mjs [--ejecutar]

import { Client } from "pg";

const EJECUTAR = process.argv.includes("--ejecutar");
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// ── 1. Filas que no son cotizaciones ────────────────────────────────────────
// `~$…` son los archivos de bloqueo que Word deja abiertos mientras se edita
// un documento. Están COMPLETAMENTE vacíos: ni PDF, ni monto, ni asesor, ni
// cuenta, ni ítems, ni teléfono, ni código, ni fecha — el "cliente" es el
// propio nombre del archivo. En 164 de los 186 casos el documento de verdad
// está aparte en el archivo.
//
// ⚠️ NO se tocan los `Presu_xxx-`: parecen plantillas por el nombre, pero son
// 27 COTIZACIONES REALES a clientes reales (MINERA LAS BAMBAS por US$136.800,
// HORTIFRUT, HIALPESA, DIRECCIÓN DE SALUD APURÍMAC II…) que se guardaron sin
// ponerles el correlativo. 21 tienen asesor y 17 cuenta cruzada. Son la
// evidencia de que se emitían presupuestos sin numerar, no basura.
const { rows: basura } = await bd.query(
  `select id, archivo, pdf_path is not null pdf, monto_sin_igv, comercial_id
   from cotizaciones_historicas
   where archivo like '~$%'`);
const lock = basura;

// ── 2. Duplicados de verdad ─────────────────────────────────────────────────
const { rows } = await bd.query(
  `select * from cotizaciones_historicas where archivo not like '~$%'`);

const numeroArchivo = (a) => (a.match(/presu[_\s]*(\d+)\s*-\s*(\d{2})/i) ?? []).slice(1).join("-") || null;
const cliente = (a) =>
  a.replace(/^.*?presu[_\s]*\d+\s*-\s*\d{2}\s*[,;.]?\s*/i, "")
   .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
   .toUpperCase().replace(/[^A-Z0-9]/g, "");

const porNumero = new Map();
for (const r of rows) {
  const n = numeroArchivo(r.archivo);
  if (!n) continue;
  const k = `${r.serie}|${n}`;
  if (!porNumero.has(k)) porNumero.set(k, []);
  porNumero.get(k).push({ ...r, _cliente: cliente(r.archivo) });
}

// Campos que la fila conservada hereda de la descartada cuando le faltan.
const HEREDABLES = ["codigo", "correlativo", "anio", "fecha", "telefono", "correo", "atencion",
  "comercial_id", "asesor_codigo", "asesor_nombre", "monto_sin_igv", "fuente_monto",
  "n_equipos", "validez_dias", "cuenta_id", "pdf_path", "pdf_bytes"];
const ARREGLOS = ["items", "precios_equipos"];

const fusiones = [], numeroReusado = [];
for (const [k, filas] of porNumero) {
  if (filas.length < 2) continue;
  const orden = [...filas].sort((a, b) => a._cliente.length - b._cliente.length);
  const largo = orden[orden.length - 1]._cliente;
  if (!orden.every((f) => largo.startsWith(f._cliente))) { numeroReusado.push([k, filas]); continue; }

  // Se conserva la que tiene PDF; a igualdad, la más completa y con el nombre
  // más largo (el que no quedó cortado).
  const puntaje = (f) => (f.pdf_path ? 1000 : 0) + (f.monto_sin_igv != null ? 100 : 0) +
    (f.cuenta_id ? 50 : 0) + (f.comercial_id ? 25 : 0) + (f.items?.length ?? 0) + f.archivo.length / 1000;
  const [conservar, ...descartar] = [...filas].sort((a, b) => puntaje(b) - puntaje(a));

  const parche = {};
  for (const campo of HEREDABLES)
    if (conservar[campo] == null)
      for (const d of descartar) if (d[campo] != null) { parche[campo] = d[campo]; break; }
  for (const campo of ARREGLOS) {
    const mejor = descartar.reduce((a, d) => ((d[campo]?.length ?? 0) > (a?.length ?? 0) ? d[campo] : a), conservar[campo]);
    if ((mejor?.length ?? 0) > (conservar[campo]?.length ?? 0)) parche[campo] = mejor;
  }
  fusiones.push({ k, conservar, descartar, parche });
}

console.log(EJECUTAR ? "EJECUTANDO\n" : "PLAN (nada se toca; agregue --ejecutar)\n");
console.log(`Archivos de bloqueo de Word (~$)    ${lock.length}   (con PDF: ${lock.filter((b) => b.pdf).length}, con monto: ${lock.filter((b) => b.monto_sin_igv != null).length})`);
console.log(`\nMismo documento cargado dos veces   ${fusiones.length} grupos → ${fusiones.reduce((a, f) => a + f.descartar.length, 0)} filas se van`);
console.log(`   · de ellas rescatan algún dato    ${fusiones.filter((f) => Object.keys(f.parche).length).length}`);
console.log(`   · se quedan sin PDF               ${fusiones.filter((f) => !f.conservar.pdf_path && !f.parche.pdf_path).length}`);
console.log(`\nMismo Nº pero cliente distinto      ${numeroReusado.length} grupos — NO SE TOCAN (número reusado, cotizaciones reales)`);

for (const f of fusiones.slice(0, 4)) {
  console.log(`\n  ${f.k}`);
  console.log(`     se queda : ${f.conservar.archivo}`);
  for (const d of f.descartar) console.log(`     se va    : ${d.archivo}`);
  if (Object.keys(f.parche).length) console.log(`     hereda   : ${Object.keys(f.parche).join(", ")}`);
}

const { rows: antes } = await bd.query("select count(*)::int n, count(*) filter (where pdf_path is not null)::int con_pdf from cotizaciones_historicas");
const seVan = basura.length + fusiones.reduce((a, f) => a + f.descartar.length, 0);
console.log(`\nArchivo: ${antes[0].n} → ${antes[0].n - seVan} cotizaciones`);

if (!EJECUTAR) { await bd.end(); process.exit(0); }

await bd.query("begin");
try {
  let heredados = 0;
  for (const f of fusiones) {
    const campos = Object.keys(f.parche);
    if (!campos.length) continue;
    await bd.query(
      `update cotizaciones_historicas set ${campos.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1`,
      [f.conservar.id, ...campos.map((c) => f.parche[c])]);
    heredados++;
  }
  const idsFuera = [...basura.map((b) => b.id), ...fusiones.flatMap((f) => f.descartar.map((d) => d.id))];
  const { rowCount } = await bd.query("delete from cotizaciones_historicas where id = any($1)", [idsFuera]);
  await bd.query("commit");
  console.log(`\nFilas fusionadas que heredaron datos: ${heredados}`);
  console.log(`Filas eliminadas: ${rowCount}`);
  const { rows: despues } = await bd.query("select count(*)::int n, count(*) filter (where pdf_path is not null)::int con_pdf from cotizaciones_historicas");
  console.log(`Archivo final: ${despues[0].n} cotizaciones, ${despues[0].con_pdf} con PDF.`);
} catch (e) {
  await bd.query("rollback");
  console.error("\nNADA se tocó — la transacción se revirtió:", e.message);
  process.exitCode = 1;
}
await bd.end();
