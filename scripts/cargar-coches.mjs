// ============================================================
// CRM EFAMEINSA · Los coches de transporte de ropa (Efamein HM)
// ============================================================
// Orden del 25-08: subir V:\LESLY\COCHES\ESPECIFICACIONES.
//
// ⚠️ NO ESTÁN EN EL MAESTRO DE LESLY, y ese Excel es la única fuente de
// precios (regla del mismo 25-08). Por eso se cargan SIN precio: quedan
// buscables y con su ficha completa, pero cotizarlos pide aprobación de
// gerencia («equipo sin precio cargado», migración 0074) hasta que Lesly los
// agregue al Excel con su precio. Es el comportamiento honesto: mejor que el
// sistema pregunte a que un coche salga con un precio que nadie autorizó —
// exactamente el error que se terminó de limpiar hoy.
//
// FOTOS: los .docx solo traen pantallazos de navegador (Alibaba, 1440x900).
// Las fotos buenas salen del catálogo PDF de la misma carpeta (una página por
// modelo): se recortan con pdftoppm -x/-y/-W/-H — ver el commit del 25-08.
//
// Volumen en vez de kilos: los coches se miden en litros y así lo dice su
// ficha («Volumen: 915 Lts.»). Se guarda en `capacidad`, que es texto libre.
//
// Uso: node --env-file=.env.local scripts/cargar-coches.mjs [--aplicar]

import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const APLICAR = process.argv.includes("--aplicar");
const CARPETA = "V:/LESLY/COCHES/ESPECIFICACIONES";
const DESTINO_FOTOS = "public/productos";
/** El membrete de la papelería, medido en el histograma de hoy (72 fichas). */
const PAPELERIA_BYTES = 96654;

const COCHES = [
  { sku: "CO401", archivo: "CO401-COCHE DE TRANSPORTE DE ROPA  HM 401.docx" },
  { sku: "CO402", archivo: "CO402-COCHE DE TRANSPORTE DE ROPA - HM 402.docx" },
  { sku: "CO408", archivo: "CO408-COCHE DE TRANSPORTE DE ROPA  HM 408.docx" },
];

function textoConParrafos(docx) {
  const xml = execFileSync("unzip", ["-p", docx, "word/document.xml"], { maxBuffer: 64e6, encoding: "latin1" });
  return Buffer.from(xml, "latin1").toString("utf-8")
    .replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, " ").replace(/<[^>]*>/g, "")
    .split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean);
}
const SECCIONES = [
  { clave: "dimensiones", re: /^DIMENSIONES\s+DE\s+LA\s+M[AÁ]QUINA/i },
  { clave: "dimensiones", re: /^ESPECIFICACIONES?\s+T[EÉ]CNICAS?/i },
  { clave: "medidas", re: /^MEDIDAS\s+GENERALES/i },
  { clave: "medidas", re: /^DIMENSIONES\b/i },
  { clave: "caracteristicas", re: /^DISE[NÑ]O DE CONSTRUCCI[OÓ]N/i },
  { clave: "caracteristicas", re: /^CARACTER[IÍ]STICAS\b/i },
  { clave: null, re: /^PRECIO\b|^TIEMPO DE ENTREGA|^GARANT[IÍ]A\b|^FORMA DE PAGO|^SALDO\b/i },
];
function fichaDe(docx) {
  const lineas = textoConParrafos(docx);
  const bloques = { caracteristicas: [], dimensiones: [], medidas: [] };
  let actual = null;
  for (const linea of lineas) {
    const sec = SECCIONES.find((s) => s.re.test(linea));
    if (sec !== undefined) { actual = sec.clave; continue; }
    if (!actual) continue;
    if (linea.length < 6 || linea.length > 320) continue;
    if (/^item\b/i.test(linea)) continue;
    if (/^(marca|modelo|capacidad|volumen|stock)\b/i.test(linea) && linea !== linea.toUpperCase() && linea.length <= 60) continue;
    bloques[actual].push(linea);
  }
  const cab = lineas.slice(0, 12).join(" | ");
  return {
    modelo: cab.match(/HM[-\s]?(\d{3})/i) ? `HM-${cab.match(/HM[-\s]?(\d{3})/i)[1]}` : null,
    volumen: cab.match(/([\d.,]+)\s*Lts/i)?.[1] ?? null,
    caracteristicas: [...new Set(bloques.caracteristicas)],
    dimensiones: [...new Set(bloques.dimensiones)],
    medidas: [...new Set(bloques.medidas)],
  };
}
function mejorFoto(docx) {
  const lista = execFileSync("unzip", ["-Z1", docx], { encoding: "utf-8" }).split("\n");
  let mejor = null;
  for (const l of lista) {
    const interno = l.trim();
    if (!/^word\/media\/.*\.(png|jpe?g)$/i.test(interno)) continue;
    const buf = execFileSync("unzip", ["-p", docx, interno], { maxBuffer: 64e6 });
    if (buf.length === PAPELERIA_BYTES || buf.length < 3000) continue;
    if (!mejor || buf.length > mejor.buf.length) mejor = { interno, buf };
  }
  return mejor;
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

for (const co of COCHES) {
  const ruta = `${CARPETA}/${co.archivo}`;
  const f = fichaDe(ruta);
  const foto = mejorFoto(ruta);
  console.log(`\n${co.sku} — Efamein ${f.modelo ?? "?"} · ${f.volumen ?? "?"} L`);
  console.log(`   características ${f.caracteristicas.length} · dimensiones ${f.dimensiones.length} · medidas ${f.medidas.length}`);
  console.log(`   foto: ${foto ? `${foto.interno} (${Math.round(foto.buf.length / 1024)} KB)` : "solo papelería"}`);
  console.log(`   precio: SIN PRECIO — no está en el maestro; cotizará solo con aprobación de gerencia`);
  if (!APLICAR) continue;

  let fotoPath = null;
  if (foto) {
    const ext = foto.interno.match(/\.(png|jpe?g)$/i)[1].toLowerCase().replace("jpeg", "jpg");
    fotoPath = `/productos/${co.sku.toLowerCase()}.${ext}`;
    writeFileSync(join(DESTINO_FOTOS, `${co.sku.toLowerCase()}.${ext}`), foto.buf);
  }
  await bd.query(
    `insert into productos (sku, marca, modelo, nombre, categoria, segmento, capacidad, foto_path, ficha, activo)
     values ($1, 'EFAMEIN', $2, 'COCHE DE TRANSPORTE DE ROPA', 'coche', 'industrial', $3, $4, $5, true)
     on conflict (sku) do update set
       marca = excluded.marca, modelo = excluded.modelo, nombre = excluded.nombre,
       categoria = excluded.categoria, capacidad = excluded.capacidad,
       foto_path = coalesce(excluded.foto_path, productos.foto_path),
       ficha = excluded.ficha, activo = true, updated_at = now()`,
    [
      co.sku, f.modelo ?? co.sku, f.volumen ? `${f.volumen} L` : null, fotoPath,
      JSON.stringify({
        caracteristicas: f.caracteristicas,
        dimensiones: f.dimensiones,
        medidas: f.medidas,
        panel: null, controles: null, calentamiento: null,
        origen: {
          maestro: null,
          ficha_tecnica: ruta.split("/").join("\\"),
          confianza: "nombre_archivo",
          nota: "No está en el Excel de Lesly: se cargó por orden del 25-08, SIN precio. Pedirle a Lesly que lo agregue al maestro con su precio.",
          catalogos: ["V:\\LESLY\\COCHES\\CATALOGO\\Efamein-Coches de lavanderia- 2026.pdf"],
          foto_prestada_de: null, codigo_duplicado_en_maestro: false,
        },
      }),
    ],
  );
  console.log(`   ✓ cargado`);
}
await bd.end();
if (!APLICAR) console.log("\nNada se ha modificado. Agregá --aplicar.\n");
