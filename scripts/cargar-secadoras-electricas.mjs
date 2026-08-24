// ============================================================
// CRM EFAMEINSA · Cargar las dos secadoras eléctricas que faltaban
// ============================================================
// Brenda, 24-08: buscó «secadoras eléctricas Primus semi industrial modelo FDE
// y NDE» y el CRM no le devolvió nada, así que no pudo cotizar. En la reunión
// se concluyó que la ficha ya estaba subida y que había sido un malentendido.
// No lo fue: los dos equipos no existían en el CRM, ni con ese nombre ni con
// ningún otro.
//
// POR QUÉ FALTABAN. Las fichas sí están, y el cruce del 22-08 las encontró:
//   V:\LESLY\ALLIANCE ok\ESPECIFICACIONES TECNICAS\
//     SECFDEE-SECADORA ELECTRICA FDE SEMI INDUSTRIAL 10.2 KG.docx
//     SECNDE-SECADORA ELECTRICA NDE SEMI INDUSTRIAL 13.5 KG.docx
// Pero las marcó `especificacionConfianza: "sin_candidatos"` (el nombre del
// archivo no se parecía lo bastante a la descripción del maestro) y les dejó
// `catalogos: []`. El paso siguiente del pipeline solo dejó pasar los 58
// productos que tenían foto y catálogo, y estos dos se cayeron ahí en silencio.
// De 95 filas del maestro entraron 58; nadie revisó las 37 que no.
//
// Este script las carga desde su .docx con las mismas reglas de
// extraer-ficha-tecnica.mjs, y toma precio y stock del maestro de Lesly.
//
// OJO, PARA QUE LO REVISE LOGÍSTICA: el nombre del archivo y el maestro NO
// coinciden en la capacidad, y están cruzados.
//     archivo SECFDEE dice 10.2 kg  ·  maestro SECFDEE dice 10.5 kg
//     archivo SECNDE  dice 13.5 kg  ·  maestro SECNDE  dice 10.2 kg
// Manda lo que diga la ficha .docx por dentro, que es el documento técnico;
// el script imprime las tres para que se decida con los números a la vista.
// Tampoco coincide la marca del segundo: el maestro dice UNIMAC, no PRIMUS.
//
// Uso: node --env-file=.env.local scripts/cargar-secadoras-electricas.mjs [--aplicar]

import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { renameSync } from "node:fs";
import { join } from "node:path";
import XLSX from "xlsx";

const APLICAR = process.argv.includes("--aplicar");
const DESTINO_FOTOS = "public/productos";
const EXCEL = "V:/LESLY/CODIFICACION DE EQUIPOS  PARA MARKETING.xlsx";
const CARPETA = "V:/LESLY/ALLIANCE ok/ESPECIFICACIONES TECNICAS";

// La marca y el modelo salen de la FICHA, no del maestro: la ficha es el
// documento que se reproduce en la cotización, y es también lo que el
// comercial tiene en la cabeza cuando busca ("secadoras eléctricas Primus …
// modelo FDE y NDE"). El maestro dice otra cosa en el SECNDE — marca UNIMAC y
// 10.2 kg — y el script lo grita más abajo para que logística lo confirme.
// `modeloMaestro` se guarda en la ficha para no perder el código largo.
const EQUIPOS = [
  {
    sku: "SECFDEE",
    archivo: `${CARPETA}/SECFDEE-SECADORA ELECTRICA FDE SEMI INDUSTRIAL 10.2 KG.docx`,
    marca: "PRIMUS",
    modelo: "FDE",
    modeloMaestro: "FDEE5BG8543MW01",
    marcaMaestro: "PRIMUS",
    nombre: "SECADORA ELECTRICA FDE SEMI INDUSTRIAL",
    imagen: "word/media/image1.png",
    foto: "secfdee.png",
  },
  {
    sku: "SECNDE",
    archivo: `${CARPETA}/SECNDE-SECADORA ELECTRICA NDE SEMI INDUSTRIAL 13.5 KG.docx`,
    marca: "PRIMUS",
    modelo: "NDE",
    modeloMaestro: "NDENXAGS543MW01",
    marcaMaestro: "UNIMAC",
    nombre: "SECADORA ELECTRICA NDE SEMI INDUSTRIAL",
    imagen: "word/media/image1.jpeg",
    foto: "secnde.jpg",
  },
];

// ── Extracción, calcada de extraer-ficha-tecnica.mjs ────────────────────────
function textoConParrafos(docx) {
  const xml = execFileSync("unzip", ["-p", docx, "word/document.xml"], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: "latin1",
  });
  return Buffer.from(xml, "latin1")
    .toString("utf-8")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, " ")
    .replace(/<[^>]*>/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean);
}

function unirDigitos(s) {
  let previo;
  let out = s;
  do {
    previo = out;
    out = out.replace(/(\d) (\d)/g, "$1$2");
  } while (out !== previo);
  return out;
}

const SECCIONES = [
  { clave: "dimensiones", re: /^DIMENSIONES\s+DE\s+LA\s+M[AÁ]QUINA/i },
  { clave: "dimensiones", re: /^ESPECIFICACIONES?\s+T[EÉ]CNICAS?/i },
  { clave: "medidas", re: /^MEDIDAS\s+GENERALES/i },
  { clave: "medidas", re: /^DIMENSIONES\b/i },
  { clave: "caracteristicas", re: /^DISE[NÑ]O DE CONSTRUCCI[OÓ]N/i },
  { clave: "caracteristicas", re: /^CARACTER[IÍ]STICAS\b/i },
  { clave: "caracteristicas", re: /^AUTOMATIZACI[OÓ]N|^PROGRAMADOR\b/i },
  { clave: "caracteristicas", re: /^MONITOREO Y CONTROL|^SEGURIDAD Y ALARMAS/i },
  { clave: null, re: /^PRECIO\b|^TIEMPO DE ENTREGA|^GARANT[IÍ]A\b|^FORMA DE PAGO|^SALDO\b/i },
];

function seccionDe(linea) {
  return SECCIONES.find((s) => s.re.test(linea));
}

function datosDeCabecera(lineas) {
  // 16 y no 12 como el extractor general: en estas dos fichas los rótulos y los
  // valores van en párrafos separados (7 rótulos y luego 7 valores), así que el
  // voltaje cae en la línea 13 y con la ventana corta se perdía.
  const cabecera = lineas.slice(0, 16).map(unirDigitos).join(" | ");
  const capacidad = cabecera.match(/(\d+(?:[.,]\d+)?)\s*(kg|lb|libras)\b/i);
  const controles = cabecera.match(/(\d{3}\s*V?\s*\/\s*\d{2}\s*Hz?\s*\/\s*[\d-]+\s*(?:PH|N|Ph)?)/i);
  const calentamiento = cabecera.match(/\b(GAS\s*(?:GLP|NATURAL)?|EL[EÉ]CTRICO|EL[EÉ]CTRICA|VAPOR)\b/i);
  const panel = cabecera.match(
    /\b(UNILI\w*\s*C?\s*TOUCH|QUANTUM[\w\s-]*|HEC\s*ELECTRONIC|DUAL\s*DIGITAL|X\s*CONTROL(?:\s*(?:PLUS|FLEX))?|M\s?30|M\s?0?9|DIGITAL[- ]?MULTIFUNCI[OÓ]N|MICROPROCES\w+)\b/i,
  );
  const kg = capacidad ? parseFloat(capacidad[1].replace(",", ".")) : null;
  const valida = kg != null && kg >= 3 && kg <= 250;
  return {
    capacidad: valida ? `${capacidad[1]} ${capacidad[2].toLowerCase()}` : null,
    calentamiento: calentamiento ? calentamiento[1].toUpperCase().replace(/\s+/g, " ") : null,
    panel: panel ? panel[1].replace(/\s+/g, " ").trim() : null,
    controles: controles ? controles[1].replace(/\s+/g, "") : null,
  };
}

function fichaDe(archivo) {
  const lineas = textoConParrafos(archivo);
  const bloques = { caracteristicas: [], dimensiones: [], medidas: [] };
  let actual = null;
  for (const linea of lineas) {
    const sec = seccionDe(linea);
    if (sec !== undefined) {
      actual = sec.clave;
      continue;
    }
    if (!actual) continue;
    const limpia = actual === "caracteristicas" ? linea : unirDigitos(linea);
    if (limpia.length < 6 || limpia.length > 320) continue;
    if (/^(marca|modelo|capacidad|panel|controles|autom[aá]tico|item\b)/i.test(limpia)) continue;
    bloques[actual].push(limpia);
  }
  const parear = (xs) =>
    xs.map((x) =>
      x
        .replace(/\s*:\s*:\s*/, ": ")
        .replace(/\s*:\s*/, ": ")
        .replace(/(\d)(litros|mm|kg|rpm|cm|m)\b/gi, "$1 $2")
        .replace(/\s+/g, " ")
        .trim(),
    );
  return {
    cabecera: datosDeCabecera(lineas),
    ficha: {
      caracteristicas: [...new Set(bloques.caracteristicas)],
      dimensiones: [...new Set(parear(bloques.dimensiones))],
      medidas: [...new Set(parear(bloques.medidas))],
    },
  };
}

// ── Precio y stock del maestro ──────────────────────────────────────────────
const filas = XLSX.utils
  .sheet_to_json(XLSX.readFile(EXCEL).Sheets["Hoja1"], { header: 1, defval: "" })
  .slice(3)
  .filter((f) => f[1] && String(f[1]).trim());
const maestro = new Map();
for (const f of filas) {
  const c = String(f[1]).trim().toUpperCase();
  if (!maestro.has(c)) {
    maestro.set(c, { equipo: String(f[2]).trim(), stock: Number(f[3]) || 0, precio: Number(f[6]) || 0 });
  }
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

for (const eq of EQUIPOS) {
  const { cabecera, ficha } = fichaDe(eq.archivo);
  const m = maestro.get(eq.sku);
  if (!m) {
    console.error(`✗ ${eq.sku}: no está en el maestro de Lesly. Se salta.`);
    continue;
  }

  const capMaestro = m.equipo.match(/CAP:?\s*([\d.,]+)\s*KG/i)?.[1] ?? "?";
  const capArchivo = eq.archivo.match(/([\d.,]+)\s*KG/i)?.[1] ?? "?";

  console.log(`\n${eq.sku} — ${eq.marca} ${eq.modelo}`);
  console.log(`  capacidad · ficha ${cabecera.capacidad ?? "—"} | archivo ${capArchivo} kg | maestro ${capMaestro} kg`);
  console.log(`  calentamiento ${cabecera.calentamiento ?? "—"} · panel ${cabecera.panel ?? "—"} · ${cabecera.controles ?? "—"}`);
  console.log(`  características ${ficha.caracteristicas.length} · dimensiones ${ficha.dimensiones.length} · medidas ${ficha.medidas.length}`);
  console.log(`  precio ${m.precio} · stock ${m.stock}`);

  // Se dice en voz alta cada campo donde la ficha y el maestro no coinciden.
  // No se elige en silencio: la ficha manda porque es lo que ve el cliente,
  // pero alguien de logística tiene que confirmarlo.
  const conflictos = [];
  if (eq.marcaMaestro !== eq.marca) conflictos.push(`marca: ficha ${eq.marca} vs maestro ${eq.marcaMaestro}`);
  if (capMaestro !== "?" && cabecera.capacidad && !cabecera.capacidad.startsWith(capMaestro)) {
    conflictos.push(`capacidad: ficha ${cabecera.capacidad} vs maestro ${capMaestro} kg`);
  }
  if (conflictos.length) {
    console.log(`  ⚠ POR CONFIRMAR CON LOGÍSTICA — se cargó lo que dice la ficha:`);
    for (const c of conflictos) console.log(`      ${c}`);
  }

  if (ficha.caracteristicas.length === 0) {
    console.error(`  ✗ Sin características legibles: no se carga, saldría con la ficha vacía como la LG TITAN-18.`);
    continue;
  }
  if (!APLICAR) continue;

  // La foto del equipo es la primera imagen incrustada en la ficha (la segunda
  // es el pie de página, idéntica en las dos). Se copia a public/productos/,
  // que es de donde el PDF de cotización las lee.
  execFileSync("unzip", ["-o", "-j", eq.archivo, eq.imagen, "-d", DESTINO_FOTOS], { stdio: "ignore" });
  renameSync(join(DESTINO_FOTOS, eq.imagen.split("/").pop()), join(DESTINO_FOTOS, eq.foto));

  // El SKU es la llave: correr esto dos veces actualiza, no duplica.
  const { rows } = await bd.query(
    `insert into productos (sku, marca, modelo, nombre, categoria, segmento, capacidad, foto_path, ficha, activo)
     values ($1,$2,$3,$4,'secadora','semi_industrial',$5,$6,$7,true)
     on conflict (sku) do update set
       marca = excluded.marca, modelo = excluded.modelo, nombre = excluded.nombre,
       capacidad = excluded.capacidad, foto_path = excluded.foto_path,
       ficha = excluded.ficha, activo = true, updated_at = now()
     returning id`,
    [
      eq.sku,
      eq.marca,
      eq.modelo,
      `${eq.nombre} ${cabecera.capacidad ?? ""}`.trim(),
      cabecera.capacidad,
      `/productos/${eq.foto}`,
      JSON.stringify({
        ...ficha,
        calentamiento: cabecera.calentamiento,
        panel: cabecera.panel,
        controles: cabecera.controles,
        stock_referencia: m.stock,
        origen: eq.archivo,
        // El código largo del maestro no se pierde: es el que usa logística.
        modelo_maestro: eq.modeloMaestro,
        marca_maestro: eq.marcaMaestro,
      }),
    ],
  );
  const id = rows[0].id;

  // Un solo tier, igual que cargar-productos-catalogo.mjs: el maestro trae una
  // sola columna de precio y los tres niveles los define gerencia.
  if (m.precio > 0) {
    await bd.query(`update precios_producto set vigente_hasta = now() where producto_id = $1 and vigente_hasta is null`, [id]);
    await bd.query(
      `insert into precios_producto (producto_id, tier, precio, vigente_desde) values ($1, 'optimo', $2, now())`,
      [id, m.precio],
    );
  }
  console.log(`  ✓ cargado`);
}

console.log(APLICAR ? "\nListo." : "\n(Simulación: no se escribió nada. Correr con --aplicar.)");
await bd.end();
