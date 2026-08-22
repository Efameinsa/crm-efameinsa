// Cruce por CONTENIDO de la ficha, no por nombre de archivo.
//
// Por qué existe: el nombre miente. Caso real que lo destapó (Darwin,
// 22-08): "LAVGIA13-LavadoraSecadora giant c max 13-10.2 kg OPL A GAS.docx"
// lleva el código LAVGIA13 (la lavadora sola apilable) pero su contenido
// dice "LAVADORA – SECADORA SEMI INDUSTRIAL ... A Gas", que es el producto
// LAVTGIA13 (la torre). Además había DOS archivos con el prefijo LAVGIA13 y
// el cruce anterior se quedaba con el primero en silencio (usaba .find()).
//
// Cómo decide: extrae las mismas señales del texto del Excel y del texto de
// la ficha (tipo de equipo, modelo, calentamiento, control, fuerza G,
// voltaje, fases, material, configuración, código de fábrica) y las compara.
// Las CONTRADICCIONES pesan más que las coincidencias: sin eso, los 9
// documentos de UT075 puntúan igual y no se puede elegir. Un archivo cuyo
// modelo no coincide queda descartado de entrada.
//
// No inventa: lo que queda empatado o con poca evidencia se reporta como
// ambiguo, con los candidatos y su evidencia, para que lo decida una persona.
//
// Uso: node scripts/cruzar-por-contenido.mjs [--json salida.json]

import XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";

const EXCEL = "V:/LESLY/CODIFICACION DE EQUIPOS  PARA MARKETING.xlsx";
const CACHE_TEXTO = "scripts/data/texto-fichas-2026-08-22.json";

function normalizar(s) {
  return (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}
/** Sin espacios ni puntuación: "UT 075" y "UT075" tienen que verse iguales.
 *  Word parte los runs de texto y produce cosas como "1 5 kg" por "15 kg". */
function compacto(s) {
  return normalizar(s).replace(/[^A-Z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// Señales. Cada una: cómo detectarla, cuánto suma si coincide, cuánto resta
// si el Excel dice una cosa y la ficha dice otra distinta.
// ---------------------------------------------------------------------------

const TIPOS = [
  // El orden importa: "LAVADORA SECADORA" (torre) contiene ambas palabras,
  // así que se prueba antes que lavadora y secadora sueltas.
  ["lavadora_secadora", /LAVADORA\s*[–\-—/]?\s*SECADORA|SECADORA\s*[–\-—/]?\s*LAVADORA|TORRE/],
  ["lavadora", /LAVADORA/],
  ["secadora", /SECADORA/],
  ["rodillo", /RODILLO|CALANDRIA|PLANCHADOR/],
  ["prensa", /PRENSA/],
];

const CALENTAMIENTOS = [
  ["gas", /\bA?\s?GAS\b|GLP|GAS NATURAL|\bGN\b/],
  ["electrico", /ELECTRIC[OA]|ELECTRICA/],
  ["vapor", /VAPOR/],
];

const CONTROLES = [
  ["unilinc_touch", /UNILI[CN]?H?\s*C?\s*TOUCH|UNILINC/],
  ["dual_digital", /DUAL\s*DIGITAL/],
  ["x_control_plus", /X\s*CONTROL\s*(\+|PLUS|FLEX)/],
  ["x_control", /X\s*CONTROL/],
  ["m30", /\bM\s?30\b/],
  ["m9", /\bM\s?0?9\b/],
  ["microprocessor", /MICROPROCESS?OR|MICROPROCESADOR/],
  ["sharp", /SHARP/],
];

const CONFIGS = [
  ["apilable", /APILABLE|STACK/],
  ["single", /\bSINGLE\b/],
];

const MATERIALES = [
  ["inox", /INOX|INOXIDABLE/],
  ["galvanizado", /GALVANIZAD[OA]/],
  ["gris", /\bGRIS\b|ANTRACITA/],
];

function primerMatch(tabla, texto) {
  for (const [valor, re] of tabla) if (re.test(texto)) return valor;
  return null;
}

/** Fuerza G del centrifugado: "200G", "FUERZA 100G", "400 G". */
function fuerzaG(texto) {
  const m = texto.match(/\b(\d{3})\s*G\b/);
  return m ? m[1] : null;
}
/** Voltaje principal: 220 o 380. */
function voltaje(texto) {
  if (/\b380\s*V?\b/.test(texto)) return "380";
  if (/\b220\s*V?\b/.test(texto)) return "220";
  return null;
}
function fases(texto) {
  if (/\b3\s*(PH|N)\b/.test(texto)) return "3";
  if (/\b1\s*(PH|N)\b/.test(texto)) return "1";
  return null;
}
/** Código de fábrica LG: "CWG27MDCRS", "CDT29MUCPS". Llave más fuerte. */
function codigosFabrica(texto) {
  return [...new Set(normalizar(texto).match(/\b[CN][WDG][A-Z0-9]{6,10}\b/g) ?? [])];
}

function señales(texto, { soloCabecera = false } = {}) {
  const t = normalizar(texto);
  // El TIPO y el MODELO se leen de la cabecera: el cuerpo de una ficha de
  // torre dice "LAVADORA CARACTERISTICAS ... SECADORA CARACTERISTICAS", y
  // buscarlos en todo el texto haría que toda torre parezca lavadora.
  const cabecera = soloCabecera ? t : t.slice(0, 400);
  return {
    tipo: primerMatch(TIPOS, cabecera),
    calentamiento: primerMatch(CALENTAMIENTOS, t.slice(0, 900)),
    control: primerMatch(CONTROLES, t.slice(0, 900)),
    config: primerMatch(CONFIGS, cabecera),
    material: primerMatch(MATERIALES, t.slice(0, 900)),
    fuerzaG: fuerzaG(t.slice(0, 900)),
    voltaje: voltaje(t.slice(0, 900)),
    fases: fases(t.slice(0, 900)),
    dobleRotacion: /DOBLE\s*ROTACION/.test(t),
    codigos: codigosFabrica(t.slice(0, 1200)),
  };
}

// Palabras que el Excel mete dentro del "MOD.:" pero que NO son parte del
// modelo: son otra dimensión del producto (configuración) o el comienzo del
// siguiente campo cuando falta la coma separadora.
const CORTA_MODELO = /^(APILABLE|SINGLE|TORRE|CAP|CAPACIDAD|FUERZA|CONTROL|PANEL|C\/SIS|CON|COD)$/;

/** Modelo del equipo, tal como lo escribe el Excel ("MOD: RX180", "MOD. UT075"). */
function modeloDelExcel(equipo) {
  const t = normalizar(equipo);
  const m = t.match(/MOD\.?\s*:?\s*([A-Z0-9][^,]*?)(?:,|$)/);
  if (m) {
    const esVoltajeOFrecuencia = (x) => x.includes("/") || /^\d+(V|HZ|PH|N)$/.test(x);
    const palabras = m[1].trim().split(/\s+/);
    const corte = palabras.findIndex((x) => esVoltajeOFrecuencia(x) || CORTA_MODELO.test(x.replace(/[.:]/g, "")));
    const modelo = (corte === -1 ? palabras : palabras.slice(0, corte)).slice(0, 3).join(" ");
    if (compacto(modelo).length >= 3) return modelo;
  }
  // Sin "MOD:" explícito (pasa en las filas LG semi industriales): se busca
  // una familia comercial conocida dentro de la descripción. "GIAN C" no es
  // un error de tipeo mío: así está escrito en el Excel de Lesly.
  for (const fam of ["GIANT C MAX", "GIANT-C MAX", "GIANT C +", "GIAN C +", "GIANT C", "GIAN C", "TITAN MAX", "TITAN LIGHT", "TITAN"]) {
    if (t.includes(normalizar(fam))) return fam;
  }
  return null;
}

/** Variantes con las que un mismo modelo aparece escrito en el archivo.
 *  Cada una nace de un caso real visto en estas carpetas. */
function variantesModelo(modelo, marca) {
  const c = compacto(modelo);
  const v = new Set([c]);
  // "GMP 160.30A" (Excel) vs "GMP160.30" (ficha): la letra de revisión final
  // no siempre se repite.
  const sinSufijo = c.match(/^(.*\d)[A-Z]$/)?.[1];
  if (sinSufijo?.length >= 4) v.add(sinSufijo);
  // "UWT130"/"UCT080" (Excel) vs "UW 130"/"UC080" (ficha): la T de la línea
  // aparece en el maestro pero no siempre en la ficha del fabricante.
  const sinT = c.replace(/^([A-Z])T(\d)/, "$1$2").replace(/^([A-Z]{2})T(\d)/, "$1$2");
  if (sinT !== c) v.add(sinT);
  // "GIAN C" es un typo del Excel de Lesly; la ficha dice "GIANT C".
  if (c.startsWith("GIANC")) v.add(c.replace(/^GIANC/, "GIANTC"));
  // "MOD: G120.25" (Excel, sin la marca) vs "GMP120.25" (ficha, con marca).
  if (marca && !c.startsWith(compacto(marca))) v.add(compacto(marca) + c.replace(/^[A-Z]+/, ""));
  return [...v].filter((x) => x.length >= 3);
}

/**
 * ¿Este archivo corresponde a ese modelo? Devuelve de DÓNDE salió la
 * evidencia, que no es un detalle: en muchos .doc antiword no renderiza la
 * tabla anidada y la fila "Marca | Modelo | Capacidad" sale VACÍA (problema
 * ya conocido en este proyecto). Ahí el contenido no puede confirmar nada y
 * lo único que queda es el nombre del archivo — hay que decirlo, no
 * disfrazarlo de verificado.
 */
function ubicarModelo(ficha, modelo, marca) {
  const vs = variantesModelo(modelo, marca);
  if (vs.some((v) => ficha.textoCompacto.includes(v))) return "contenido";
  if (vs.some((v) => ficha.nombreCompacto.includes(v))) return "solo_nombre";
  return null;
}

const PESOS = {
  calentamiento: { si: 18, no: -35 },
  control: { si: 16, no: -22 },
  config: { si: 14, no: -28 },
  fuerzaG: { si: 12, no: -22 },
  material: { si: 8, no: -12 },
  voltaje: { si: 10, no: -16 },
  fases: { si: 5, no: -8 },
};

/**
 * El tipo de equipo DESCALIFICA, no puntúa. Una lavadora no es una torre
 * lavadora-secadora, por más señales que compartan.
 *
 * Esto salió de un caso real: la ficha de la torre GIANT C MAX contiene los
 * códigos de fábrica de sus DOS componentes (CWG27MDCRS de la lavadora y
 * CDG27MUCPS de la secadora), así que ese +100 por "código de fábrica" la
 * hacía ganar como ficha de la lavadora sola Y de la secadora sola, tapando
 * la contradicción de tipo. En una torre el código no identifica al
 * producto: identifica a sus partes.
 */
function tipoIncompatible(sExcel, sFicha) {
  return sExcel.tipo != null && sFicha.tipo != null && sExcel.tipo !== sFicha.tipo;
}

function puntuar(sExcel, sFicha) {
  let score = 0;
  const evidencia = [];
  const conflictos = [];

  if (sExcel.tipo && sFicha.tipo && sExcel.tipo === sFicha.tipo) {
    score += 25;
    evidencia.push(`tipo=${sExcel.tipo}`);
  }

  for (const [campo, peso] of Object.entries(PESOS)) {
    const a = sExcel[campo];
    const b = sFicha[campo];
    if (a == null || b == null) continue; // sin dato de un lado: no suma ni resta
    if (a === b) {
      score += peso.si;
      evidencia.push(`${campo}=${a}`);
    } else {
      score += peso.no;
      conflictos.push(`${campo}: excel=${a} ficha=${b}`);
    }
  }

  if (sExcel.dobleRotacion && sFicha.dobleRotacion) {
    score += 5;
    evidencia.push("doble rotación");
  }

  // Código de fábrica: si ambos lo traen y coincide, es concluyente.
  const codigoComun = sExcel.codigos.find((c) => sFicha.codigos.includes(c));
  if (codigoComun) {
    score += 100;
    evidencia.push(`COD. de fábrica ${codigoComun}`);
  } else if (sExcel.codigos.length && sFicha.codigos.length) {
    score -= 25;
    conflictos.push(`COD. de fábrica distinto: excel=${sExcel.codigos.join("/")} ficha=${sFicha.codigos.join("/")}`);
  }

  return { score, evidencia, conflictos, codigoComun: Boolean(codigoComun) };
}

// ---------------------------------------------------------------------------

const cache = JSON.parse(readFileSync(CACHE_TEXTO, "utf-8"));

/** Prioridad de procedencia cuando el MISMO documento está en varias
 *  carpetas: la copia curada por Lesly manda, después la de Jean Paul (ambas
 *  llevan el código en el nombre), y al final las carpetas numeradas viejas. */
function prioridadRuta(ruta) {
  if (ruta.includes("\\LESLY\\")) return 0;
  if (ruta.includes("PROYECTO ASIGNADO")) return 1;
  return 2;
}

const fichas = Object.entries(cache)
  .filter(([, v]) => v.texto && v.texto.length >= 50)
  .map(([ruta, v]) => ({
    ruta,
    texto: v.texto,
    textoCompacto: compacto(v.texto.slice(0, 1200)),
    // Huella del documento: mismo contenido = mismo documento, aunque esté
    // guardado con otro nombre en otra carpeta. Sin esto, cada duplicado se
    // reporta como una "ambigüedad" que en realidad no existe.
    huella: compacto(v.texto.slice(0, 2000)),
    nombreCompacto: compacto(ruta.split(/[\\/]/).pop().replace(/\.[^.]+$/, "")),
    // El nombre del archivo también aporta señales (a veces más limpias que
    // el cuerpo), así que se concatena a la cabecera para leerlas.
    señales: señales(ruta.split(/[\\/]/).pop().replace(/\.[^.]+$/, "") + " . " + v.texto),
    esPdf: /\.pdf$/i.test(ruta),
    // Código con el que fue nombrado el archivo (Lesly y Jean Paul los
    // nombran "<CODIGO>-desc" / "<CODIGO>. desc"). Es una pista, NO la
    // verdad: hay archivos mal nombrados (ver cabecera de este script).
    codigoDelNombre: normalizar(
      ruta.split(/[\\/]/).pop().replace(/\.[^.]+$/, "").split(/\.\s+|[-\s]/)[0].replace(/\.$/, ""),
    ).trim(),
  }));

const wb = XLSX.readFile(EXCEL);
const filas = XLSX.utils.sheet_to_json(wb.Sheets["Hoja1"], { header: 1, defval: "" });
const productos = filas
  .slice(3)
  .filter((f) => f[1] && String(f[1]).trim())
  .map((f) => ({
    codigo: normalizar(f[1]).trim(),
    equipo: String(f[2] ?? "").trim(),
    marca: normalizar(f[4]).trim(),
  }));

const UMBRAL_ALTA = 45;
const UMBRAL_MEDIA = 20;

const codigosConocidos = new Set(productos.map((p) => p.codigo));

const resultado = productos.map((p) => {
  const modelo = modeloDelExcel(p.equipo);
  const sExcel = señales(p.equipo, { soloCabecera: true });

  const bruto = fichas
    .map((f) => ({ f, origen: modelo ? ubicarModelo(f, modelo, p.marca) : null }))
    .filter((x) => x.origen && !tipoIncompatible(sExcel, x.f.señales))
    .map(({ f, origen }) => {
      const r = puntuar(sExcel, f.señales);
      // Si el modelo solo aparece en el nombre (tabla vacía por antiword),
      // el contenido no confirmó nada: se marca y se le baja el puntaje para
      // que nunca gane por sobre una ficha realmente verificada.
      if (origen === "solo_nombre") {
        r.score -= 15;
        r.conflictos.push("el contenido no menciona el modelo (tabla vacía en .doc): match por nombre");
      }
      // El nombre del archivo desempata, pero NUNCA manda sobre el
      // contenido: si el archivo se llama con este código suma poco; si se
      // llama con el código de OTRO producto de la lista, resta poco. El
      // caso LAVGIA13/LAVTGIA13 existe justamente porque un archivo estaba
      // mal nombrado y su contenido era de otro producto.
      if (f.codigoDelNombre === p.codigo) {
        r.score += 12;
        r.evidencia.push("el archivo lleva este código");
      } else if (codigosConocidos.has(f.codigoDelNombre)) {
        r.score -= 6;
        r.conflictos.push(`el archivo lleva el código ${f.codigoDelNombre}`);
      }
      return { ruta: f.ruta, esPdf: f.esPdf, huella: f.huella, prioridad: prioridadRuta(f.ruta), origenModelo: origen, ...r };
    })
    .sort((a, b) => b.score - a.score || a.prioridad - b.prioridad);

  // Deduplicar por contenido: el mismo documento guardado en dos carpetas no
  // es una ambigüedad. Se conserva la copia de mejor procedencia y se anota
  // dónde más está.
  const porHuella = new Map();
  for (const c of bruto) {
    const previo = porHuella.get(c.huella);
    if (!previo) porHuella.set(c.huella, { ...c, copias: [] });
    else previo.copias.push(c.ruta);
  }
  const candidatos = [...porHuella.values()].sort((a, b) => b.score - a.score || a.prioridad - b.prioridad);

  const specs = candidatos.filter((c) => !c.esPdf);
  const cats = candidatos.filter((c) => c.esPdf);

  function elegir(lista) {
    if (lista.length === 0) return { elegido: null, confianza: "sin_candidatos", alternativas: [], todos: [] };
    const mejor = lista[0];
    const segundo = lista[1];
    if (mejor.score < UMBRAL_MEDIA) {
      return { elegido: null, confianza: "evidencia_insuficiente", alternativas: lista.slice(0, 4), todos: lista.slice(0, 5) };
    }
    // Empate: si los dos candidatos aportan EXACTAMENTE la misma evidencia y
    // los mismos conflictos, no es una ambigüedad de verdad — es el mismo
    // documento guardado dos veces con nombres distintos (pasa mucho entre
    // V:\LESLY y las carpetas numeradas viejas, donde una copia lleva el
    // código en el nombre y la otra no). Se queda la de mejor procedencia.
    const mismaEvidencia =
      segundo &&
      segundo.evidencia.join("|") === mejor.evidencia.join("|") &&
      segundo.conflictos.join("|") === mejor.conflictos.join("|");
    const margen = segundo ? mejor.score - segundo.score : Infinity;
    if (margen < 10 && !mejor.codigoComun && !mismaEvidencia) {
      return { elegido: null, confianza: "ambiguo", alternativas: lista.slice(0, 4), todos: lista.slice(0, 5) };
    }
    // "alta" exige que el contenido lo respalde: un match cuyo modelo solo
    // aparece en el nombre del archivo nunca pasa de "media".
    const verificadoEnContenido = mejor.origenModelo === "contenido";
    const confianza =
      verificadoEnContenido && (mejor.codigoComun || (mejor.score >= UMBRAL_ALTA && mejor.conflictos.length === 0))
        ? "alta"
        : "media";
    return { elegido: mejor, confianza, alternativas: lista.slice(1, 3), todos: lista.slice(0, 5) };
  }

  return { ...p, modelo, señalesExcel: sExcel, especificacion: elegir(specs), catalogo: elegir(cats) };
});

// ---------------------------------------------------------------------------

const cuenta = (sel, conf) => resultado.filter((r) => r[sel].confianza === conf).length;
console.log(`Productos: ${resultado.length}   ·   Fichas con texto: ${fichas.length}\n`);
console.log("ESPECIFICACIÓN TÉCNICA");
for (const c of ["alta", "media", "ambiguo", "evidencia_insuficiente", "sin_candidatos"]) {
  console.log(`  ${c.padEnd(24)} ${cuenta("especificacion", c)}`);
}
console.log("CATÁLOGO");
for (const c of ["alta", "media", "ambiguo", "evidencia_insuficiente", "sin_candidatos"]) {
  console.log(`  ${c.padEnd(24)} ${cuenta("catalogo", c)}`);
}

console.log("\n=== AMBIGUOS / SIN RESOLVER (especificación) ===");
for (const r of resultado.filter((x) => ["ambiguo", "evidencia_insuficiente", "sin_candidatos"].includes(x.especificacion.confianza))) {
  console.log(`\n${r.codigo} (${r.marca}, modelo=${r.modelo ?? "?"}) — ${r.equipo.slice(0, 65)}`);
  console.log(`   → ${r.especificacion.confianza}`);
  for (const a of r.especificacion.alternativas ?? []) {
    console.log(`     [${a.score}] ${a.ruta.split(/[\\/]/).pop()}`);
    if (a.evidencia.length) console.log(`         a favor: ${a.evidencia.join(", ")}`);
    if (a.conflictos.length) console.log(`         en contra: ${a.conflictos.join(" | ")}`);
  }
}

// ---------------------------------------------------------------------------
// Archivos MAL NOMBRADOS: el contenido dice que la ficha es del producto X,
// pero el archivo está nombrado con el código del producto Y. Es lo más útil
// que sale de leer el contenido — un cruce por nombre jamás lo habría visto,
// y son errores que hay que corregir en origen (los arrastra cualquiera que
// busque por código).
// ---------------------------------------------------------------------------
// Se mira desde el ARCHIVO, no desde el producto: para cada ficha que lleva
// un código conocido en el nombre, se compara cuánto puntúa su contenido
// contra ESE producto y contra todos los demás. Si otro producto le gana por
// un margen claro, el archivo está guardado con el código equivocado.
//
// (El primer intento miraba desde el producto y comparaba "candidatos con la
// misma evidencia", lo que producía falsos positivos: daba por mal nombrada
// la ficha de SECU303, que en realidad está correcta.)
// Un código puede aparecer en VARIAS filas del maestro (LAV180 es a la vez
// la RX180 rígida y la FX180 flotante). El archivo se considera bien
// nombrado si corresponde a cualquiera de ellas.
const porProducto = new Map();
for (const p of productos) porProducto.set(p.codigo, [...(porProducto.get(p.codigo) ?? []), p]);
const MARGEN_MAL_NOMBRADO = 15;

const malNombrados = [];
const discrepanciasDeModelo = [];

for (const f of fichas) {
  if (f.esPdf) continue; // los catálogos agrupan varios modelos: no aplica
  const codigoArchivo = f.codigoDelNombre;
  const propios = porProducto.get(codigoArchivo);
  if (!propios) continue; // el archivo no está nombrado con un código del maestro

  const puntajeContra = (p) => {
    const sExcel = señales(p.equipo, { soloCabecera: true });
    const modelo = modeloDelExcel(p.equipo);
    if (!modelo || ubicarModelo(f, modelo, p.marca) !== "contenido") return null;
    if (tipoIncompatible(sExcel, f.señales)) return null;
    return puntuar(sExcel, f.señales);
  };

  const propioScore = propios.map(puntajeContra).filter(Boolean).sort((a, b) => b.score - a.score)[0] ?? null;
  const rivales = productos
    .filter((p) => p.codigo !== codigoArchivo)
    .map((p) => ({ p, r: puntajeContra(p) }))
    .filter((x) => x.r)
    .sort((a, b) => b.r.score - a.r.score);
  const mejorRival = rivales[0];

  if (!propioScore) {
    // El modelo que el maestro le asigna a este código NO aparece en la
    // ficha guardada con ese mismo código. No se puede saber de qué lado
    // está el error (el maestro pudo copiar mal la fila, o el archivo pudo
    // guardarse con el código equivocado): se reporta la discrepancia y la
    // resuelve quien conoce el producto.
    if (mejorRival) {
      discrepanciasDeModelo.push({
        codigo: codigoArchivo,
        ruta: f.ruta,
        modeloSegunMaestro: propios.map((p) => modeloDelExcel(p.equipo)).join(" / "),
        equipoSegunMaestro: propios[0].equipo,
        pareceSer: mejorRival.p.codigo,
        equipoQueParece: mejorRival.p.equipo,
      });
    }
    continue;
  }

  // Si el producto "rival" YA tiene su propia ficha (nombrada con su código
  // y al menos igual de buena), este archivo no puede ser también suyo: lo
  // que hay es un dato inconsistente dentro del documento, no un archivo mal
  // guardado. Caso real: la ficha de SECMAX152 (single) tiene "APILABLE" en
  // el encabezado porque se copió de la plantilla del apilable, pero la
  // ficha del apilable existe aparte y se confirma por código de fábrica.
  const rivalYaTieneFicha =
    mejorRival &&
    fichas.some((otra) => {
      if (otra.ruta === f.ruta || otra.esPdf) return false;
      if (otra.codigoDelNombre !== mejorRival.p.codigo) return false;
      const sExcel = señales(mejorRival.p.equipo, { soloCabecera: true });
      const modelo = modeloDelExcel(mejorRival.p.equipo);
      if (!modelo || ubicarModelo(otra, modelo, mejorRival.p.marca) !== "contenido") return false;
      if (tipoIncompatible(sExcel, otra.señales)) return false;
      return puntuar(sExcel, otra.señales).score >= mejorRival.r.score;
    });

  if (mejorRival && !rivalYaTieneFicha && mejorRival.r.score - propioScore.score >= MARGEN_MAL_NOMBRADO) {
    malNombrados.push({
      codigoReal: mejorRival.p.codigo,
      codigoEnElArchivo: codigoArchivo,
      ruta: f.ruta,
      equipo: mejorRival.p.equipo,
      evidencia: mejorRival.r.evidencia,
      motivo: `contra ${codigoArchivo} puntúa ${propioScore.score} (${propioScore.conflictos.join("; ") || "sin conflictos"}) y contra ${mejorRival.p.codigo} puntúa ${mejorRival.r.score}`,
    });
  }
}

// Intercambios: A está guardado con el código de B y B con el de A. Es el
// error más traicionero, porque cada archivo por separado parece correcto.
const intercambios = [];
const vistos = new Set();
for (const m of malNombrados) {
  const par = malNombrados.find((o) => o.codigoReal === m.codigoEnElArchivo && o.codigoEnElArchivo === m.codigoReal);
  const clave = [m.codigoReal, m.codigoEnElArchivo].sort().join("↔");
  if (par && !vistos.has(clave)) {
    vistos.add(clave);
    intercambios.push([m, par]);
  }
}

console.log(`\n\n=== ⚠️  FICHAS MAL NOMBRADAS (${malNombrados.length}) ===`);
console.log("El contenido corresponde a un producto distinto del código con el que está guardado el archivo.\n");
for (const m of malNombrados) {
  console.log(`${m.ruta.split(/[\\/]/).pop()}`);
  console.log(`   guardada como : ${m.codigoEnElArchivo}`);
  console.log(`   pero es de    : ${m.codigoReal} — ${m.equipo.slice(0, 60)}`);
  console.log(`   evidencia     : ${m.evidencia.join(", ")}`);
  console.log(`   por qué       : ${m.motivo}\n`);
}

console.log(`=== ❓ DISCREPANCIA MAESTRO ↔ FICHA (${discrepanciasDeModelo.length}) ===`);
console.log("El modelo que el Excel le asigna al código no aparece en la ficha guardada con ese código.");
console.log("Puede ser un error del Excel o del nombre del archivo: lo decide quien conoce el producto.\n");
for (const d of discrepanciasDeModelo) {
  console.log(`${d.ruta.split(/[\\/]/).pop()}`);
  console.log(`   código        : ${d.codigo}`);
  console.log(`   el Excel dice : modelo ${d.modeloSegunMaestro} — ${d.equipoSegunMaestro.slice(0, 60)}`);
  console.log(`   la ficha pareceria ser de: ${d.pareceSer} — ${d.equipoQueParece.slice(0, 55)}\n`);
}

console.log(`=== 🔁 CÓDIGOS INTERCAMBIADOS ENTRE SÍ (${intercambios.length}) ===`);
for (const [a, b] of intercambios) {
  console.log(`\n${a.codigoReal} ↔ ${b.codigoReal}`);
  console.log(`   "${a.ruta.split(/[\\/]/).pop()}"`);
  console.log(`      está guardado como ${a.codigoEnElArchivo} pero su contenido es el de ${a.codigoReal}`);
  console.log(`   "${b.ruta.split(/[\\/]/).pop()}"`);
  console.log(`      está guardado como ${b.codigoEnElArchivo} pero su contenido es el de ${b.codigoReal}`);
}

const idx = process.argv.indexOf("--json");
if (idx !== -1) {
  writeFileSync(process.argv[idx + 1], JSON.stringify({ resultado, malNombrados, intercambios, discrepanciasDeModelo }, null, 1));
  console.log(`\nEscrito: ${process.argv[idx + 1]}`);
}
