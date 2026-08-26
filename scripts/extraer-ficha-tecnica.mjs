// Extrae de cada ficha .docx los datos técnicos que el PDF de cotización
// necesita, y los deja junto a la foto en un solo mapeo por producto.
//
// El PDF (src/lib/pdf/cotizacion-pdf.tsx) espera en `productos.ficha`:
//   caracteristicas[]  — las viñetas de la ficha
//   dimensiones[]      — "Volumen del tambor: 135 litros", …
//   medidas[]          — "Altura: 1225 mm", …
// más capacidad, calentamiento, panel y controles como campos sueltos.
//
// Las fichas siguen todas la misma plantilla, y de ahí sale la segmentación:
//   ITEM I.- <TIPO> | Marca Modelo Capacidad [Calentamiento] Panel Controles
//   DISEÑO DE CONSTRUCCION        → características
//   AUTOMATIZACIÓN, SEGURIDAD…    → características (siguen siendo viñetas)
//   ESPECIFICACIONES TECNICAS     → dimensiones (lo que el PDF llama así)
//   DIMENSIONES                   → medidas generales
//   Precio / Garantía / Forma de pago → se descarta: eso lo pone la cotización
//
// No se reusa el texto cacheado de extraer-texto-fichas.mjs a propósito: ese
// colapsa los saltos de línea (le servía para buscar, no para listar), y acá
// hacen falta los párrafos para separar una viñeta de la siguiente.
//
// Uso: node scripts/extraer-ficha-tecnica.mjs [--aplicar]

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");
const ENTRADA = "scripts/data/fotos-productos-2026-08-22.json";
const SALIDA = "scripts/data/productos-listos-2026-08-22.json";

/** Texto del .docx CON los saltos de párrafo, que es lo que separa viñetas. */
function textoConParrafos(docx) {
  try {
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
      .map((l) => l.replace(/[ \t ]+/g, " ").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Word parte los dígitos en runs separados: "1 35 litros" es 135, "9 0 0" es
 *  900. Solo se unen dígitos pegados entre sí por espacios, nunca un número
 *  con una palabra, así "20 programas" queda intacto. */
function unirDigitos(s) {
  let previo;
  let out = s;
  do {
    previo = out;
    out = out.replace(/(\d) (\d)/g, "$1$2");
  } while (out !== previo);
  return out;
}

// Hay dos plantillas de ficha conviviendo. La de Alliance (Primus/Unimac)
// titula "DISEÑO DE CONSTRUCCION" + "ESPECIFICACIONES TECNICAS" +
// "DIMENSIONES GENERALES"; la de LG y GMP usa "CARACTERISTICAS" +
// "DIMENSIONES DE LA MAQUINA" + "MEDIDAS GENERALES". El orden importa:
// "DIMENSIONES DE LA MAQUINA" tiene que probarse antes que "DIMENSIONES" a
// secas, o se la lleva la regla corta.
//
// "DISEÑO DE CONSTRUCCION" (TAMBOR, PUERTA, PANELES…) va a SU PROPIA clave,
// no a "caracteristicas": hasta el 26-08 se mezclaban y esa sección entera
// desaparecía del PDF, que solo sabía imprimir un bloque de viñetas
// (detectado comparando el PDF de la SECU1202 contra su Word).
const SECCIONES = [
  { clave: "dimensiones", re: /^DIMENSIONES\s+DE\s+LA\s+M[AÁ]QUINA/i },
  { clave: "dimensiones", re: /^ESPECIFICACIONES?\s+T[EÉ]CNICAS?/i },
  { clave: "medidas", re: /^MEDIDAS\s+GENERALES/i },
  { clave: "medidas", re: /^DIMENSIONES\b/i },
  { clave: "disenoConstruccion", re: /^DISE[NÑ]O DE CONSTRUCCI[OÓ]N/i },
  { clave: "caracteristicas", re: /^CARACTER[IÍ]STICAS\b/i },
  { clave: "caracteristicas", re: /^AUTOMATIZACI[OÓ]N|^PROGRAMADOR\b/i },
  { clave: "caracteristicas", re: /^MONITOREO Y CONTROL|^SEGURIDAD Y ALARMAS/i },
  { clave: null, re: /^PRECIO\b|^TIEMPO DE ENTREGA|^GARANT[IÍ]A\b|^FORMA DE PAGO|^SALDO\b/i },
];

// El Word no siempre lleva la tilde en MAYÚSCULAS ("ESPECIFICACIONES
// TECNICAS", "DISEÑO DE CONSTRUCCION"), pero el PDF sí debe llevarla (pedido
// 26-08: «respeta las tildes aunque sea mayúscula»). Se corrige el rótulo
// capturado en vez de copiarlo tal cual.
function conTildes(titulo) {
  return titulo
    .replace(/\bTECNICAS?\b/gi, (m) => (m.length === 8 ? "TÉCNICAS" : "TÉCNICA"))
    .replace(/\bMAQUINA\b/gi, "MÁQUINA")
    .replace(/\bCONSTRUCCION\b/gi, "CONSTRUCCIÓN")
    .replace(/\bAUTOMATIZACION\b/gi, "AUTOMATIZACIÓN");
}

function seccionDe(linea) {
  for (const s of SECCIONES) if (s.re.test(linea)) return s;
  return undefined;
}

/** Cabecera: "PRIMUS RX 135 15 kg X Control 220V/60Hz/1Ph". Los rótulos y
 *  los valores vienen en párrafos distintos y en orden, así que se leen las
 *  primeras líneas y se buscan los patrones por forma, no por posición. */
function datosDeCabecera(lineas) {
  // Los dígitos se unen DENTRO de cada párrafo, nunca a través de ellos: el
  // modelo y la capacidad viven en celdas distintas de la tabla ("UWT045" |
  // "20 kg") y unirlos después de juntar las líneas producía capacidades
  // como "04520 kg". Se pierde algún número partido entre párrafos, que es
  // mejor que inventar uno.
  const cabecera = lineas.slice(0, 12).map(unirDigitos).join(" | ");
  // Con rango: «14-16 kg» es una capacidad real (los UT030, 25-08). El patrón
  // de un solo número la aplanaba a «16 kg».
  const capacidad = cabecera.match(/(\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?)\s*(kg|lb|libras)\b/i);
  const controles = cabecera.match(/(\d{3}\s*V?\s*\/\s*\d{2}\s*Hz?\s*\/\s*[\d-]+\s*(?:PH|N|Ph)?)/i);
  const calentamiento = cabecera.match(/\b(GAS\s*(?:GLP|NATURAL|GLP\s*\/\s*NATURAL)?|EL[EÉ]CTRICO|EL[EÉ]CTRICA|VAPOR)\b/i);
  const panel = cabecera.match(/\b(UNILI\w*\s*C?\s*TOUCH|DUAL\s*DIGITAL|X\s*CONTROL(?:\s*(?:PLUS|FLEX|\+))?|M\s?30|M\s?0?9|DIGITAL[- ]?MULTIFUNCI[OÓ]N|MICROPROCES\w+|SHARP)\b/i);
  // Red de seguridad: estos equipos van de ~8 a ~90 kg. Un valor fuera de
  // rango es un número mal recompuesto, y es preferible dejarlo vacío antes
  // que imprimir "13515 kg" en una cotización.
  const kg = capacidad ? parseFloat(capacidad[1].replace(",", ".")) : null;
  const capacidadValida = kg != null && kg >= 3 && kg <= 250;

  return {
    capacidad: capacidadValida ? `${capacidad[1]} ${capacidad[2].toLowerCase()}` : null,
    capacidadDudosa: capacidad && !capacidadValida ? `${capacidad[1]} ${capacidad[2]}` : undefined,
    calentamiento: calentamiento ? calentamiento[1].toUpperCase().replace(/\s+/g, " ") : null,
    panel: panel ? panel[1].replace(/\s+/g, " ").trim() : null,
    controles: controles ? controles[1].replace(/\s+/g, "") : null,
  };
}

const productos = JSON.parse(readFileSync(ENTRADA, "utf-8"));
const salida = [];
let sinTexto = 0;

for (const p of productos) {
  // Alguna ficha no es un .docx sino un PDF de brochure (CALE2160 usa el de
  // la línea E2, confirmado por logística). De ahí no se extraen viñetas con
  // esta plantilla: se deja sin ficha estructurada y se avisa.
  const esDocx = /\.docx$/i.test(p.especificacion ?? "");
  const lineas = esDocx ? textoConParrafos(p.especificacion) : [];
  if (lineas.length === 0) {
    sinTexto++;
    salida.push({ ...p, ficha: null });
    continue;
  }

  const bloques = { caracteristicas: [], disenoConstruccion: [], dimensiones: [], medidas: [] };
  // El rótulo REAL de "caracteristicas"/"dimensiones"/"medidas" no es fijo
  // entre plantillas (ver el comentario de SECCIONES): se guarda la primera
  // cabecera que encendió cada clave, tal como la escribió la ficha, para que
  // el PDF imprima el rótulo correcto en vez de uno inventado.
  const titulos = { caracteristicas: null, dimensiones: null, medidas: null };
  let actual = null;
  for (const linea of lineas) {
    const sec = seccionDe(linea);
    // Un match de SECCIONES solo cuenta como encabezado nuevo si CAMBIA de
    // bloque. Si ya estábamos en esa misma clave, no es un encabezado — es
    // una viñeta o subtítulo que por casualidad empieza con la misma palabra
    // del patrón. Pasó con «PROGRAMADOR UNILINC TOUCH»: el patrón que
    // detecta el encabezado «AUTOMATIZACIÓN, SEGURIDAD Y CONTROL» también
    // acepta líneas que empiezan con «PROGRAMADOR» sueltas, y esa viñeta
    // — la primera de la sección, un subtítulo real — se descartaba entera.
    // Detectado el 26-08 comparando el PDF de la SECU1701 contra su Word.
    if (sec !== undefined && sec.clave !== actual) {
      actual = sec.clave; // null corta la captura (bloque de precio/garantía)
      if (actual && titulos[actual] === null) {
        titulos[actual] = conTildes(linea.replace(/\s+/g, " ").trim());
      }
      continue;
    }
    if (!actual) continue;
    // Las viñetas útiles tienen algo de sustancia; los restos de tabla y los
    // rótulos sueltos no.
    const esTextoLibre = actual === "caracteristicas" || actual === "disenoConstruccion";
    const limpia = esTextoLibre ? linea : unirDigitos(linea);
    if (limpia.length < 6 || limpia.length > 320) continue;
    // Los rótulos de la tabla de cabecera ("Marca", "Panel computarizado") se
    // repiten dentro del cuerpo y no son características.
    //
    // OJO CON "panel": este filtro se comía además el SUBTÍTULO de sección
    // «PANELES» / «PANEL FRONTAL» y la viñeta «Panel superior e inferior en
    // acero estructural…», y así se perdieron en 24 fichas de secadora —
    // detectado el 25-08 comparando el PDF de la SECA758 contra su Word.
    // Un rótulo de tabla va en minúsculas y es corto; el subtítulo va en
    // MAYÚSCULAS y la viñeta es una frase larga. Esas dos excepciones lo
    // separan sin tocar el resto.
    //
    // OJO CON "capacidad": el mismo filtro se comía «Capacidad : 55 kg», la
    // primera línea de ESPECIFICACIONES TÉCNICAS en la plantilla Alliance —
    // detectado el 26-08 comparando el PDF de la SECU1202 contra su Word. Un
    // rótulo repetido no lleva dos puntos; un dato sí, así que se excluye
    // cualquier línea con ":" del filtro.
    const esRotuloDeTabla =
      /^(marca|modelo|capacidad|panel|controles|autom[aá]tico|item\b)/i.test(limpia) &&
      limpia !== limpia.toUpperCase() &&
      limpia.length <= 60 &&
      !limpia.includes(":");
    if (esRotuloDeTabla) continue;
    bloques[actual].push(limpia);
  }

  // Las dimensiones y medidas vienen como "Clave : valor"; se normaliza el
  // espaciado antes de los dos puntos, que Word deja irregular.
  // "Volumen del tambor: : 254litros" — la plantilla LG deja dos veces los
  // dos puntos y pega el número a la unidad.
  const parear = (xs) =>
    xs.map((x) =>
      x
        .replace(/\s*:\s*:\s*/, ": ")
        .replace(/\s*:\s*/, ": ")
        .replace(/(\d)(litros|mm|kg|rpm|cm|m)\b/gi, "$1 $2")
        .replace(/\s+/g, " ")
        .trim(),
    );

  salida.push({
    ...p,
    ...datosDeCabecera(lineas),
    ficha: {
      caracteristicas: [...new Set(bloques.caracteristicas)],
      caracteristicasTitulo: titulos.caracteristicas,
      disenoConstruccion: [...new Set(bloques.disenoConstruccion)],
      dimensiones: [...new Set(parear(bloques.dimensiones))],
      dimensionesTitulo: titulos.dimensiones,
      medidas: [...new Set(parear(bloques.medidas))],
      medidasTitulo: titulos.medidas,
    },
  });
}

if (APLICAR) writeFileSync(SALIDA, JSON.stringify(salida, null, 1));

const con = (f) => salida.filter((s) => s.ficha?.[f]?.length).length;
console.log(`Productos procesados        : ${salida.length}`);
console.log(`  con características       : ${con("caracteristicas")}`);
console.log(`  con diseño de construcción: ${con("disenoConstruccion")}`);
console.log(`  con dimensiones técnicas  : ${con("dimensiones")}`);
console.log(`  con medidas generales     : ${con("medidas")}`);
console.log(`  con capacidad detectada   : ${salida.filter((s) => s.capacidad).length}`);
console.log(`  con controles (voltaje)   : ${salida.filter((s) => s.controles).length}`);
console.log(`  sin texto legible         : ${sinTexto}`);

const flojos = salida.filter((s) => (s.ficha?.caracteristicas?.length ?? 0) < 3);
if (flojos.length) {
  console.log(`\nCon menos de 3 características (revisar):`);
  for (const f of flojos) console.log(`  ${f.codigo.padEnd(11)} ${f.equipo.slice(0, 55)}`);
}

console.log(APLICAR ? `\nEscrito: ${SALIDA}` : `\n(Simulación: no se escribió nada. Correr con --aplicar.)`);
