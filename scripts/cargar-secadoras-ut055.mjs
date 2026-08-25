// ============================================================
// CRM EFAMEINSA · Cargar las dos secadoras UT055 que faltaban
// ============================================================
// Reportado el 25-08: «este producto no lo encontramos en el sistema: SECU502,
// SECADORA UT055». Es cierto, y son dos: SECU502 y SECU55 están en el maestro
// de Lesly, tienen ficha y tienen stock, pero nunca entraron al CRM. Son 2 de
// los 41 equipos del maestro (de 95) que todavía no están cargados.
//
// ⚠️ LOS DOS CÓDIGOS ESTÁN CRUZADOS EN EL NOMBRE DE LOS ARCHIVOS
//
// El maestro dice:
//   SECU502 · UNILINC TOUCH · cilindro INOXIDABLE · panel inox · US$ 9.500 · stock 1
//   SECU55  · DUAL DIGITAL  · cilindro GALVANIZADO · panel estándar · US$ 7.350 · stock 5
//
// Y las fichas de V:\PROYECTO ASIGNADO - JEAN PAUL\FICHAS TECNICAS\UT055 se
// llaman al revés de lo que dicen por dentro:
//   archivo "SECU502…DUAL DIGITAL…GALVANIZADO"  → por dentro: UT055, DUAL DIGITAL
//   archivo "SECU55…UNILINC TOUCH…OPTIDRY…INOX" → por dentro: UT055L, UNILINC TOUCH
//
// Coinciden en las TRES cosas con el maestro pero con el código contrario:
// control, material del cilindro y hasta la foto (la del archivo SECU55 es una
// máquina de acero inoxidable; la del SECU502 es blanca/galvanizada). Así que
// acá se empareja por CONTENIDO, no por el código del nombre del archivo —
// misma regla que ya salvó el cruce del 22-08: «el nombre miente; el contenido
// no».
//
// POR QUÉ IMPORTA Y NO ES UN DETALLE: si alguien cotiza SECU502 y adjunta la
// ficha que se llama SECU502, le manda al cliente un equipo galvanizado con
// panel estándar mientras le cobra el precio del inoxidable con Unilinc Touch.
// Son 2.150 dólares de diferencia y dos máquinas distintas.
//
// PENDIENTE PARA JEAN PAUL / LESLY: renombrar los dos .docx para que el código
// del archivo coincida con lo que dice adentro. Mientras no se haga, cualquier
// carga futura que se guíe por el nombre volverá a cruzarlos.
//
// Uso: node --env-file=.env.local scripts/cargar-secadoras-ut055.mjs [--aplicar]

import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { renameSync } from "node:fs";
import { join } from "node:path";
import XLSX from "xlsx";

const APLICAR = process.argv.includes("--aplicar");
const DESTINO_FOTOS = "public/productos";
const EXCEL = "V:/LESLY/CODIFICACION DE EQUIPOS  PARA MARKETING.xlsx";
const CARPETA = "V:/PROYECTO ASIGNADO - JEAN PAUL/FICHAS TECNICAS/UT055";

const EQUIPOS = [
  {
    sku: "SECU502",
    // El archivo se llama SECU55 pero por dentro es el UNILINC TOUCH, que es
    // lo que el maestro llama SECU502.
    archivo: `${CARPETA}/SECU55. SECADORA UT055L-UNILINC TOUCH-OPTIDRY-DOBLE ROTACION-INOX-GLP-220V.1-3PH.docx`,
    archivoDiceSku: "SECU55",
    marca: "UNIMAC",
    modelo: "UT055L",
    nombre: "SECADORA INDUSTRIAL",
    panelEsperado: "UNILINC TOUCH",
    imagen: "word/media/image2.png",
    foto: "secu502.png",
  },
  {
    sku: "SECU55",
    archivo: `${CARPETA}/SECU502. SECADORA UT055-DUAL DIGITAL-DOBLE ROTACION-GALVANIZADO-GLP-220V.docx`,
    archivoDiceSku: "SECU502",
    marca: "UNIMAC",
    modelo: "UT055",
    nombre: "SECADORA INDUSTRIAL",
    panelEsperado: "DUAL DIGITAL",
    // Su única imagen de producto es un pantallazo de navegador (1440x900).
    // Se carga igual y queda marcada: scripts/rescatar-fotos-de-pantallazos.mjs
    // recorta la máquina de adentro, como se hizo con los otros 8 el 24-08.
    imagen: "word/media/image2.png",
    foto: "secu55.png",
    fotoEsPantallazo: true,
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

function datosDeCabecera(lineas) {
  const cabecera = lineas.slice(0, 16).map(unirDigitos).join(" | ");
  const capacidad = cabecera.match(/(\d+(?:[.,]\d+)?)\s*(kg|lb|libras)\b/i);
  const controles = cabecera.match(/(\d{3}\s*V?\s*\/\s*\d{2}\s*Hz?\s*\/\s*[\d-]+\s*(?:PH|N|Ph)?)/i);
  const calentamiento = cabecera.match(/\b(GAS\s*(?:GLP|NATURAL)?|EL[EÉ]CTRICO|EL[EÉ]CTRICA|VAPOR)\b/i);
  const panel = cabecera.match(
    /\b(UNILI\w*\s*C?\s*TOUCH|DUAL\s*DIGITAL|QUANTUM[\w\s-]*|X\s*CONTROL(?:\s*(?:PLUS|FLEX))?|M\s?30|M\s?0?9|MICROPROCES\w+)\b/i,
  );
  const kg = capacidad ? parseFloat(capacidad[1].replace(",", ".")) : null;
  const valida = kg != null && kg >= 3 && kg <= 250;
  return {
    capacidad: valida ? `${capacidad[1]} ${capacidad[2].toLowerCase()}` : null,
    calentamiento: calentamiento ? calentamiento[1].toUpperCase().replace(/\s+/g, " ") : null,
    panel: panel ? panel[1].replace(/\s+/g, " ").trim().toUpperCase() : null,
    controles: controles ? controles[1].replace(/\s+/g, "") : null,
  };
}

function fichaDe(archivo) {
  const lineas = textoConParrafos(archivo);
  const bloques = { caracteristicas: [], dimensiones: [], medidas: [] };
  let actual = null;
  for (const linea of lineas) {
    const sec = SECCIONES.find((s) => s.re.test(linea));
    if (sec !== undefined) {
      actual = sec.clave;
      continue;
    }
    if (!actual) continue;
    const limpia = actual === "caracteristicas" ? linea : unirDigitos(linea);
    if (limpia.length < 6 || limpia.length > 320) continue;
    if (/^item\b/i.test(limpia)) continue;
    // Mismo criterio que la corrección del 25-08: el rótulo de tabla va en
    // minúsculas y es corto; el subtítulo (PANELES) va en mayúsculas y la
    // viñeta es una frase larga.
    if (
      /^(marca|modelo|capacidad|panel|controles|autom[aá]tico)\b/i.test(limpia) &&
      limpia !== limpia.toUpperCase() &&
      limpia.length <= 60
    ) {
      continue;
    }
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
    console.error(`✗ ${eq.sku}: no está en el maestro. Se salta.`);
    continue;
  }

  console.log(`\n${eq.sku} — ${eq.marca} ${eq.modelo}`);
  console.log(`  ficha usada     : ${eq.archivo.split("/").pop()}`);
  console.log(`  el archivo dice : ${eq.archivoDiceSku}  ← código cruzado, se empareja por contenido`);
  console.log(`  panel · ficha ${cabecera.panel ?? "—"} | maestro ${eq.panelEsperado}`);
  console.log(`  capacidad ${cabecera.capacidad ?? "—"} · ${cabecera.calentamiento ?? "—"} · ${cabecera.controles ?? "—"}`);
  console.log(`  características ${ficha.caracteristicas.length} · dimensiones ${ficha.dimensiones.length} · medidas ${ficha.medidas.length}`);
  console.log(`  maestro: US$ ${m.precio} · stock ${m.stock}`);

  // El emparejamiento tiene que sostenerse solo: si el panel de la ficha no es
  // el que el maestro le atribuye a este código, no se carga nada. Es la única
  // prueba objetiva de que la ficha elegida es la correcta.
  if ((cabecera.panel ?? "").replace(/\s+/g, " ") !== eq.panelEsperado) {
    console.error(`  ✗ El panel de la ficha (${cabecera.panel}) no es el que el maestro le da a ${eq.sku} (${eq.panelEsperado}). NO se carga.`);
    continue;
  }
  if (ficha.caracteristicas.length === 0) {
    console.error(`  ✗ Sin características legibles: saldría con la ficha vacía delante del cliente. NO se carga.`);
    continue;
  }
  if (eq.fotoEsPantallazo) {
    console.log(`  ⚠ Su foto es un pantallazo de navegador. Después de aplicar, correr:`);
    console.log(`      node --env-file=.env.local scripts/rescatar-fotos-de-pantallazos.mjs --aplicar`);
  }
  if (!APLICAR) continue;

  execFileSync("unzip", ["-o", "-j", eq.archivo, eq.imagen, "-d", DESTINO_FOTOS], { stdio: "ignore" });
  renameSync(join(DESTINO_FOTOS, eq.imagen.split("/").pop()), join(DESTINO_FOTOS, eq.foto));

  const { rows } = await bd.query(
    `insert into productos (sku, marca, modelo, nombre, categoria, segmento, capacidad, foto_path, ficha, activo)
     values ($1,$2,$3,$4,'secadora','industrial',$5,$6,$7,true)
     on conflict (sku) do update set
       marca = excluded.marca, modelo = excluded.modelo, nombre = excluded.nombre,
       capacidad = excluded.capacidad, foto_path = excluded.foto_path,
       ficha = excluded.ficha, activo = true, updated_at = now()
     returning id`,
    [
      eq.sku,
      eq.marca,
      eq.modelo,
      eq.nombre,
      cabecera.capacidad,
      `/productos/${eq.foto}`,
      JSON.stringify({
        ...ficha,
        calentamiento: cabecera.calentamiento,
        panel: cabecera.panel,
        controles: cabecera.controles,
        stock_referencia: m.stock,
        origen: {
          maestro: "CODIFICACION DE EQUIPOS PARA MARKETING.xlsx",
          ficha_tecnica: eq.archivo.replace(/\//g, "\\"),
          confianza: "alta",
          nombre_de_archivo_cruzado: eq.archivoDiceSku,
          catalogos: [],
          foto_prestada_de: null,
          codigo_duplicado_en_maestro: false,
        },
      }),
    ],
  );

  // Industrial: un solo nivel de precio, el del maestro (regla confirmada por
  // gerencia el 25-08). Se cierra el anterior si lo hubiera, en vez de
  // acumular dos precios vigentes.
  await bd.query(
    `update precios_producto set vigente_hasta = current_date
      where producto_id = $1 and tier = 'base' and vigente_hasta is null and precio <> $2`,
    [rows[0].id, m.precio],
  );
  await bd.query(
    `insert into precios_producto (producto_id, tier, precio, moneda, vigente_desde)
     values ($1, 'base', $2, 'USD', current_date)
     on conflict (producto_id, tier, vigente_desde) do update set precio = excluded.precio`,
    [rows[0].id, m.precio],
  );
  console.log(`  ✓ cargado con precio US$ ${m.precio}`);
}

await bd.end();
if (!APLICAR) console.log("\nNada se ha modificado. Agregá --aplicar para cargarlos.\n");
