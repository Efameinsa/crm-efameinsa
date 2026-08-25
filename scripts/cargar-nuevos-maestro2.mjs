// ============================================================
// CRM EFAMEINSA · Los 15 equipos nuevos del maestro2 (25-08)
// ============================================================
// «CODIFICACION DE EQUIPOS2.xlsx» trae 15 códigos que no estaban en el CRM:
// la línea de PLANCHADO (mesas, calderines y prensas SIDI MONDIAL / BLANCA
// PRESS), dos secadoras UNIMAC/PRIMUS y una calandria. La regla del 25-08 es
// que el sistema refleje el Excel de Lesly: se cargan todos.
//
// TABLA A MANO, no deducción: cada código con su ficha verificada una por
// una (la lección SECGIA10 del 25-08). Notas de lo que NO calza:
//   · SECU754 = descripción IDÉNTICA a SECU752 pero precio 11150 vs 10500.
//     Se le presta la ficha del 752 y queda la nota — preguntar a Lesly.
//   · SECNSEN (Primus NSENX apilable 13.5) y CAFCU20 (calandria FCU 2100/50)
//     no tienen Word en ninguna carpeta: van SIN ficha, pedirla a Jean Paul.
//   · CALM23: el maestro lo llama así pero el archivo es CALMI23 (errata).
//   · CALM231: su Word está mal nombrado «CALM18-…2.3 litros» — el contenido
//     dice «Caldera de 2.3 Litros», verificado.
//   · Marca «SIMI MONDIAL» del maestro = SIDI MONDIAL (las fichas dicen
//     «SIDI MONDIAL (Italia)»).
//
// FOTOS: se rechaza cualquier imagen que se repita en 3+ fichas de este lote
// (membrete de la papelería SIDI) y se elige la más grande de las restantes.
//
// Después de correr esto, correr sincronizar-maestro2.mjs --aplicar para que
// estos nuevos reciban descripción/stock/ubicación del maestro como el resto.
//
// Uso: node --env-file=.env.local scripts/cargar-nuevos-maestro2.mjs [--aplicar]

import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const APLICAR = process.argv.includes("--aplicar");
const CONV = "scripts/data/fichas-convertidas";
const ALLI = "V:/LESLY/ALLIANCE ok/ESPECIFICACIONES TECNICAS";
const JP75 = "V:/PROYECTO ASIGNADO - JEAN PAUL/FICHAS TECNICAS/UT075";
const DESTINO_FOTOS = "public/productos";

const NUEVOS = [
  { sku: "SECUT55E", marca: "UNIMAC", modelo: "UT055", nombre: "SECADORA INDUSTRIAL ELÉCTRICA", categoria: "secadora", segmento: "industrial", capacidad: "25 kg", calentamiento: "ELÉCTRICO", precio: 8250,
    ficha: `${ALLI}/SECUT55E-SECADORA UT055-DUAL DIGITAL-DOBLE ROTACION-GALVANIZADO-ELECTRICA-220V.docx` },
  { sku: "SECU754", marca: "UNIMAC", modelo: "UT075", nombre: "SECADORA INDUSTRIAL", categoria: "secadora", segmento: "industrial", capacidad: "34 kg", calentamiento: "GAS NATURAL", precio: 11150,
    ficha: `${JP75}/SECU752. SECADORA UT075-UNILINC TOUCH-DOBLE ROTACION-INOX-C. INOX-GN-220V.docx`,
    nota: "Descripción idéntica a SECU752 en el maestro2 pero con otro precio (11150 vs 10500). Ficha prestada del SECU752 — confirmar con Lesly cuál es la diferencia real." },
  { sku: "SECNSEN", marca: "PRIMUS", modelo: "NSENXAGS173NW01", nombre: "SECADORA SEMI INDUSTRIAL APILABLE ELÉCTRICA", categoria: "secadora", segmento: "semi_industrial", capacidad: "13.5 kg", calentamiento: "ELÉCTRICO", precio: 4500,
    ficha: null, nota: "Sin Word en V:\\LESLY ni V:\\PROYECTO ASIGNADO - JEAN PAUL. Pedir la ficha a Jean Paul." },
  { sku: "CAFCU20", marca: "UNIMAC", modelo: "FCU 2100/50", nombre: "CALANDRIA A GAS NATURAL", categoria: "planchador", segmento: "industrial", capacidad: null, calentamiento: "GAS NATURAL", precio: null,
    ficha: null, nota: "No hay Word del FCU 2100/50 (solo del FCU2080). Sin precio en el maestro. Pedir ficha y precio." },
  { sku: "MEFENI1", marca: "SIDI MONDIAL", modelo: "FENIX", nombre: "MESA DE PLANCHADO ASPIRANTE SEMI-INDUSTRIAL", categoria: "planchador", segmento: "semi_industrial", capacidad: null, calentamiento: "ELÉCTRICO", precio: 1400,
    ficha: `${CONV}/MEFENI1-Mesa de planchado Mod Fenix.docx` },
  { sku: "CALM23", marca: "SIDI MONDIAL", modelo: "ARIES", nombre: "CALDERÍN CON PLANCHA", categoria: "planchador", segmento: "semi_industrial", capacidad: "2.3 L", calentamiento: "ELÉCTRICO", precio: 950,
    ficha: `${CONV}/CALMI23-Calderin Aries electrico 2.3 litros.docx`,
    nota: "El maestro lo codifica CALM23 pero el archivo de la ficha dice CALMI23 — avisar la errata a Lesly." },
  { sku: "CALMI18", marca: "SIDI MONDIAL", modelo: "ARIES", nombre: "CALDERÍN CON PLANCHA", categoria: "planchador", segmento: "semi_industrial", capacidad: "1.8 L", calentamiento: "ELÉCTRICO", precio: 850,
    ficha: `${CONV}/CALMI18-Calderin Aries electrico 1.8 litros.docx` },
  { sku: "CALMI4", marca: "SIDI MONDIAL", modelo: "ARIES", nombre: "CALDERÍN CON PLANCHA", categoria: "planchador", segmento: "semi_industrial", capacidad: "4 L", calentamiento: "ELÉCTRICO", precio: 1100,
    ficha: `${CONV}/CALMI4-Calderin Aries electrico 4.0 litros.docx` },
  { sku: "CALBR8", marca: "SIDI MONDIAL", modelo: "BR-8", nombre: "GENERADOR DE VAPOR INDUSTRIAL", categoria: "planchador", segmento: "industrial", capacidad: "5 L", calentamiento: "ELÉCTRICO", precio: 2999,
    ficha: `${CONV}/CALBR8-GENERADOR DE VAPOR BR-8.docx` },
  { sku: "PRN750U", marca: "SIDI MONDIAL", modelo: "CT-750/U", nombre: "PRENSA DE PLANCHADO NEUMÁTICA", categoria: "planchador", segmento: "industrial", capacidad: null, calentamiento: "ELÉCTRICO", precio: 14999,
    ficha: `${CONV}/PRN750U-PRENSA CT-750U.docx` },
  { sku: "PRE702U", marca: "SIDI MONDIAL", modelo: "ST-702/U", nombre: "PRENSA DE PLANCHADO MANUAL", categoria: "planchador", segmento: "industrial", capacidad: null, calentamiento: "ELÉCTRICO", precio: 12999,
    ficha: `${CONV}/PRE702U-PRENSA ST-702U.docx` },
  { sku: "PRPE01", marca: "BLANCA PRESS", modelo: "PCV", nombre: "PRENSA DE PLANCHADO SEMI INDUSTRIAL", categoria: "planchador", segmento: "semi_industrial", capacidad: null, calentamiento: "ELÉCTRICO", precio: null,
    ficha: `${CONV}/PRPE01-PRENSA PCV.docx`,
    nota: "Sin precio en el maestro. Ficha mínima sin sección de características: se transcribió a mano. Sus «Medidas Generales: 85 x 63 x 28 mm» parecen ser cm — confirmar.",
    fichaManual: {
      caracteristicas: [
        "Superficie de planchado: 29 mm x 80 mm",
        "Vapor autogenerado",
        "Estructura de soporte metálico, Norma ASTM A-36 para trabajo pesado",
        "Chasis construido en acero al carbono acabado con imprimación y pintura epóxica de alta temperatura",
      ],
      medidas: ["Medidas generales: 85 x 63 x 28 mm"],
    } },
  { sku: "CALM4", marca: "SIDI MONDIAL", modelo: "FENIX", nombre: "MESA DE PLANCHADO ASPIRANTE CON CALDERÍN", categoria: "planchador", segmento: "semi_industrial", capacidad: "4 L", calentamiento: "ELÉCTRICO", precio: null,
    ficha: `${CONV}/CALM4-Mesa calderin 4L.docx`, nota: "Sin precio en el maestro." },
  { sku: "CALM231", marca: "SIDI MONDIAL", modelo: "FENIX", nombre: "MESA DE PLANCHADO ASPIRANTE CON CALDERÍN", categoria: "planchador", segmento: "semi_industrial", capacidad: "2.3 L", calentamiento: "ELÉCTRICO", precio: null,
    ficha: `${CONV}/CALM231-Mesa calderin 2.3L.docx`,
    nota: "Sin precio en el maestro. Su Word original está mal nombrado «CALM18-…2.3 litros» — el contenido dice 2.3 L, verificado." },
  { sku: "CALM18", marca: "SIDI MONDIAL", modelo: "FENIX", nombre: "MESA DE PLANCHADO ASPIRANTE CON CALDERÍN", categoria: "planchador", segmento: "semi_industrial", capacidad: "1.8 L", calentamiento: "ELÉCTRICO", precio: null,
    ficha: `${CONV}/CALM18-Mesa calderin 1.8L.docx`, nota: "Sin precio en el maestro." },
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
  { clave: "caracteristicas", re: /^AUTOMATIZACI[OÓ]N|^PROGRAMADOR\b|^MONITOREO Y CONTROL|^SEGURIDAD Y ALARMAS/i },
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
    // Rótulos de la tabla de cabecera. CORTOS (≤30): «Calentamiento con
    // termostato regulable» es una característica real de las mesas FENIX y
    // con ≤60 se la comía (visto en el dry run del 25-08).
    if (/^(marca|modelo|capacidad|calentamiento|controles|autom[aá]tico)\b/i.test(linea) && linea !== linea.toUpperCase() && linea.length <= 30) continue;
    bloques[actual].push(linea);
  }
  const cabecera = lineas.slice(0, 12).join(" | ");
  const controles = cabecera.match(/(\d{3}\s*V?\s*\/\s*\d{2}\s*Hz?\s*\/\s*[\d-]+\s*(?:PH|N|Ph)?)/i);
  return {
    caracteristicas: [...new Set(bloques.caracteristicas)],
    dimensiones: [...new Set(bloques.dimensiones)],
    medidas: [...new Set(bloques.medidas)],
    controles: controles ? controles[1].replace(/\s+/g, "") : null,
  };
}

// Membrete: el de la papelería mide exactamente 96.654 bytes (histograma del
// 25-08) y además se repite en casi todas las fichas del lote. El umbral es 6:
// con 3 se mataban las fotos legítimas compartidas entre variantes hermanas
// (los tres calderines Aries usan la misma foto — mismo error que se evitó en
// el histograma general).
const PAPELERIA_BYTES = 96654;
function imagenesDe(docx) {
  const lista = execFileSync("unzip", ["-Z1", docx], { encoding: "utf-8" }).split("\n");
  const out = [];
  for (const l of lista) {
    const interno = l.trim();
    if (!/^word\/media\/.*\.(png|jpe?g)$/i.test(interno)) continue;
    const buf = execFileSync("unzip", ["-p", docx, interno], { maxBuffer: 64e6 });
    out.push({ interno, buf, hash: createHash("sha1").update(buf).digest("hex") });
  }
  return out;
}

const conFicha = NUEVOS.filter((n) => n.ficha && existsSync(n.ficha));
const repeticiones = new Map();
const imagenesPorSku = new Map();
for (const n of conFicha) {
  const imgs = imagenesDe(n.ficha);
  imagenesPorSku.set(n.sku, imgs);
  for (const h of new Set(imgs.map((i) => i.hash))) repeticiones.set(h, (repeticiones.get(h) ?? 0) + 1);
}
function mejorFoto(sku) {
  const candidatas = (imagenesPorSku.get(sku) ?? [])
    .filter((i) => (repeticiones.get(i.hash) ?? 0) < 6 && i.buf.length >= 3000 && i.buf.length !== PAPELERIA_BYTES);
  return candidatas.sort((a, b) => b.buf.length - a.buf.length)[0] ?? null;
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

for (const n of NUEVOS) {
  const tiene = n.ficha && existsSync(n.ficha);
  const extraida = tiene ? fichaDe(n.ficha) : { caracteristicas: [], dimensiones: [], medidas: [], controles: null };
  const f = n.fichaManual ? { ...extraida, ...n.fichaManual } : extraida;
  const foto = tiene ? mejorFoto(n.sku) : null;
  console.log(`\n${n.sku.padEnd(9)} ${n.marca} ${n.modelo} · ${n.nombre}`);
  console.log(`   ficha: ${tiene ? `${f.caracteristicas.length} caract · ${f.dimensiones.length} dim · ${f.medidas.length} med` : "SIN FICHA"}`);
  console.log(`   foto : ${foto ? `${foto.interno} (${Math.round(foto.buf.length / 1024)} KB)` : "ninguna utilizable"}`);
  console.log(`   precio: ${n.precio ?? "SIN PRECIO (pedirá aprobación de gerencia)"} · tier ${n.segmento === "semi_industrial" ? "optimo" : "base"}`);
  if (n.nota) console.log(`   nota : ${n.nota}`);
  if (!APLICAR) continue;

  let fotoPath = null;
  if (foto) {
    const ext = foto.interno.match(/\.(png|jpe?g)$/i)[1].toLowerCase().replace("jpeg", "jpg");
    fotoPath = `/productos/${n.sku.toLowerCase()}.${ext}`;
    writeFileSync(join(DESTINO_FOTOS, `${n.sku.toLowerCase()}.${ext}`), foto.buf);
  }
  const { rows } = await bd.query(
    `insert into productos (sku, marca, modelo, nombre, categoria, segmento, capacidad, foto_path, ficha, activo)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
     on conflict (sku) do update set
       marca = excluded.marca, modelo = excluded.modelo, nombre = excluded.nombre,
       categoria = excluded.categoria, segmento = excluded.segmento, capacidad = excluded.capacidad,
       foto_path = coalesce(excluded.foto_path, productos.foto_path),
       ficha = excluded.ficha, activo = true, updated_at = now()
     returning id`,
    [
      n.sku, n.marca, n.modelo, n.nombre, n.categoria, n.segmento, n.capacidad, fotoPath,
      JSON.stringify({
        caracteristicas: f.caracteristicas,
        dimensiones: f.dimensiones,
        medidas: f.medidas,
        panel: null,
        controles: f.controles,
        calentamiento: n.calentamiento,
        origen: {
          maestro: "V:\\LESLY\\CODIFICACION DE EQUIPOS2.xlsx",
          ficha_tecnica: n.ficha ? n.ficha.split("/").join("\\") : null,
          confianza: n.ficha ? "codigo_verificado" : "sin_ficha",
          nota: n.nota ?? null,
        },
      }),
    ],
  );
  if (n.precio != null) {
    const tier = n.segmento === "semi_industrial" ? "optimo" : "base";
    await bd.query(
      `update precios_producto set vigente_hasta = current_date where producto_id = $1 and vigente_hasta is null`,
      [rows[0].id],
    );
    await bd.query(
      `insert into precios_producto (producto_id, tier, precio, moneda, vigente_desde)
       values ($1, $2, $3, 'USD', current_date)
       on conflict (producto_id, tier, vigente_desde) do update set precio = excluded.precio, vigente_hasta = null`,
      [rows[0].id, tier, n.precio],
    );
  }
  console.log(`   ✓ cargado`);
}
await bd.end();
if (!APLICAR) console.log("\nNada se ha modificado. Agregá --aplicar.\n");
