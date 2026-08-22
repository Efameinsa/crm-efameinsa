// Asigna a cada equipo su catálogo comercial, y aplica lo que confirmó
// logística.
//
// El cruce anterior buscaba el modelo dentro del NOMBRE del PDF, y así se
// perdía la mayoría de los catálogos: un catálogo cubre una línea entera y
// se nombra por rango ("SECADORA UNIMAC_UT030-055"), de modo que buscar
// "UT055" en "UT030055" no encuentra nada. Logística lo señaló con tres
// casos concretos (SECU55, SECU502, SECG501) el 22-08.
//
// Ahora se usan cuatro criterios, en orden de autoridad:
//   1. Lo que confirmó logística (asignaciones-logistica.json). Manda.
//   2. El modelo aparece en el TEXTO del catálogo. Es el más fuerte de los
//      automáticos: el PDF de UU050-075 nombra "UU050, UU055, UT075".
//   3. El nombre del archivo declara un rango que contiene al modelo
//      ("UT030-055" cubre UT055; "RX80-RX105-RX135" cubre los tres).
//   4. Es el brochure de la línea a la que pertenece el modelo. Los de línea
//      no nombran modelos —"BROCHURE - LINE- E2" no dice E2 160.30— así que
//      se declaran a mano; logística confirmó que ese brochure vale para
//      toda la línea E2.
//
// Uso: node scripts/asignar-catalogos.mjs [--aplicar]

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");
const CRUCE = "scripts/data/cruce-definitivo-2026-08-22.json";
const CACHE = "scripts/data/texto-fichas-2026-08-22.json";
const LOGISTICA = "scripts/data/asignaciones-logistica.json";

const normalizar = (s) => (s ?? "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const compacto = (s) => normalizar(s).replace(/[^A-Z0-9]/g, "");

// Brochures que cubren una línea entera sin nombrar sus modelos. Cada
// entrada se confirmó abriendo el PDF.
const BROCHURES_DE_LINEA = [
  { archivo: "BROCHURE - LINE- E2", cubre: (modelo, marca) => marca === "GMP" && /^E2/.test(compacto(modelo)) },
  { archivo: "Catalogo_equipos_semiindustriales_LG", cubre: (modelo, marca) => marca === "LG" },
  // Los catálogos de SAILSTAR son escaneos sin texto, así que no hay forma
  // de buscar el modelo adentro; se identifican por lo que cubren.
  { archivo: "LAVADORA_AL_SECO", cubre: (modelo, marca, equipo) => marca === "SAILSTAR" && /AL\s*SECO/i.test(equipo) },
];

function modeloDelExcel(equipo) {
  const t = normalizar(equipo);
  const m = t.match(/MOD\.?\s*:?\s*([A-Z0-9][^,]*?)(?:,|$)/);
  if (m) {
    const esVoltaje = (x) => x.includes("/") || /^\d+(V|HZ|PH|N)$/.test(x);
    const corta = /^(APILABLE|SINGLE|TORRE|CAP|CAPACIDAD|FUERZA|CONTROL|PANEL|CON|COD)$/;
    const palabras = m[1].trim().split(/\s+/);
    const i = palabras.findIndex((x) => esVoltaje(x) || corta.test(x.replace(/[.:]/g, "")));
    const modelo = (i === -1 ? palabras : palabras.slice(0, i)).slice(0, 3).join(" ");
    if (compacto(modelo).length >= 3) return modelo;
  }
  for (const fam of ["GIANT C MAX", "GIANT-C MAX", "GIANT C +", "GIAN C +", "GIANT C", "GIAN C", "TITAN MAX", "TITAN LIGHT", "TITAN"]) {
    if (t.includes(normalizar(fam))) return fam;
  }
  return null;
}

/** Familia y número de un modelo: "UT055L" → {familia:"UT", numero:55}. */
function familiaYNumero(modelo) {
  const m = compacto(modelo).match(/^([A-Z]+?)(\d+)/);
  return m ? { familia: m[1], numero: Number(m[2]) } : null;
}

/** Rangos declarados en el nombre del archivo: "UT030-055" → UT 30..55.
 *  El segundo número hereda la familia del primero cuando no la repite. */
function rangosDelNombre(nombre) {
  const limpio = normalizar(nombre).replace(/\.PDF$/, "").replace(/([A-Z])[\s_]+(\d)/g, "$1$2");
  const tokens = limpio.match(/[A-Z]+\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g) ?? [];
  const rangos = [];
  let familia = null;
  for (const t of tokens) {
    const m = t.match(/^([A-Z]+)(\d+)/);
    const n = m ? Number(m[2]) : Number(t);
    if (m) familia = m[1];
    if (!familia || Number.isNaN(n)) continue;
    const r = rangos.find((x) => x.familia === familia);
    if (r) {
      r.min = Math.min(r.min, n);
      r.max = Math.max(r.max, n);
    } else rangos.push({ familia, min: n, max: n });
  }
  return rangos;
}

// Dentro de una marca no hay dos familias que compartan las primeras dos
// letras (RX/FX/UY/UW/UC/UG/UT/UU/US), así que comparar ese prefijo alcanza
// y evita mantener una tabla de qué letra es "de control" en cada modelo.
const mismaFamilia = (a, b) => a.slice(0, 2) === b.slice(0, 2);

/** Cuando el mismo documento está copiado en varias carpetas, se prefiere la
 *  de LESLY (curada) y después la de Jean Paul; las numeradas viejas al final. */
function prioridadRuta(ruta) {
  if (ruta.includes("\\LESLY\\") || ruta.includes("/LESLY/")) return 0;
  if (ruta.includes("PROYECTO ASIGNADO")) return 1;
  return 2;
}

const cruce = JSON.parse(readFileSync(CRUCE, "utf-8"));
const cache = JSON.parse(readFileSync(CACHE, "utf-8"));
const logistica = JSON.parse(readFileSync(LOGISTICA, "utf-8"));

// Se incluyen TAMBIÉN los catálogos escaneados (texto vacío). Excluirlos
// dejaba a SAILSTAR sin ningún catálogo: los suyos son todos imágenes sin
// OCR, pero su nombre sí declara el rango ("SS_17_23"), que es justamente
// uno de los criterios.
const catalogos = Object.entries(cache)
  .filter(([ruta]) => /\.pdf$/i.test(ruta))
  .map(([ruta, v]) => ({
    ruta,
    nombre: ruta.split(/[\\/]/).pop(),
    textoCompacto: compacto(v.texto ?? ""),
    escaneado: (v.texto?.length ?? 0) < 50,
  }));

// Las rutas confirmadas por logística se validan contra el disco: si alguien
// mueve o renombra un archivo, hay que enterarse, no seguir en silencio.
const problemas = [];
for (const [tipo, mapa] of [["catalogo", logistica.catalogo], ["especificacion", logistica.especificacion]]) {
  for (const [codigo, ruta] of Object.entries(mapa ?? {})) {
    if (!existsSync(ruta)) problemas.push(`${tipo} de ${codigo}: no existe ${ruta}`);
  }
}
if (problemas.length) {
  console.log("⚠️  Rutas de asignaciones-logistica.json que no existen en el disco:");
  for (const p of problemas) console.log("   " + p);
  console.log();
}

let porLogistica = 0, porTexto = 0, porRango = 0, porLinea = 0, yaTenian = 0;
const sinCatalogo = [];

for (const p of cruce.productos) {
  const modelo = modeloDelExcel(p.equipo);
  // La ficha técnica ya confirmada suele nombrar el modelo REAL de fábrica,
  // que no siempre es el que usa el maestro: para LAVW17 el Excel dice
  // "WET 17" pero su ficha se llama "Lavador Centrifuga SS17 WET", y el
  // catálogo está archivado como "SS_17_23". Sin este segundo modelo no hay
  // forma de unirlos.
  const modelosFicha = p.especificacion
    ? [...new Set(normalizar(p.especificacion.split(/[\\/]/).pop()).match(/\b[A-Z]{2,4}\s?-?\s?\d{2,4}(?:[.,]\d{2})?\b/g) ?? [])].map((x) => x.replace(/[\s-]/g, ""))
    : [];
  const modelos = [...new Set([modelo, ...modelosFicha].filter(Boolean))];

  // 1. Logística manda.
  const deLogistica = logistica.catalogo?.[p.codigo];
  if (deLogistica && existsSync(deLogistica)) {
    if (!(p.catalogos ?? []).includes(deLogistica)) {
      p.catalogos = [...(p.catalogos ?? []), deLogistica];
      porLogistica++;
    }
    p.catalogoConfirmadoPorLogistica = true;
  }
  const specLogistica = logistica.especificacion?.[p.codigo];
  if (specLogistica && existsSync(specLogistica)) {
    p.especificacion = specLogistica;
    p.especificacionConfianza = "confirmada_por_logistica";
    p.especificacionEvidencia = ["confirmada por logística"];
    p.revisar = (p.revisar ?? []).filter((r) => r.tipo !== "especificacion");
  }

  if (modelos.length) {
    for (const c of catalogos) {
      if ((p.catalogos ?? []).includes(c.ruta)) continue;
      let motivo = null;

      // 2. El catálogo nombra alguno de los modelos en su texto.
      const variantes = new Set();
      for (const m of modelos) {
        variantes.add(compacto(m));
        const sinSufijo = compacto(m).match(/^(.*\d)[A-Z]$/)?.[1];
        if (sinSufijo?.length >= 4) variantes.add(sinSufijo);
      }
      if ([...variantes].some((v) => v.length >= 4 && c.textoCompacto.includes(v))) motivo = "texto";

      // 3. El nombre declara un rango que lo contiene.
      if (!motivo) {
        const rangos = rangosDelNombre(c.nombre);
        const enRango = modelos
          .map(familiaYNumero)
          .filter(Boolean)
          .some((x) => rangos.some((r) => mismaFamilia(r.familia, x.familia) && x.numero >= r.min && x.numero <= r.max));
        if (enRango) motivo = "rango";
      }

      // 4. Brochure de la línea.
      if (!motivo) {
        const linea = BROCHURES_DE_LINEA.find((b) => c.nombre.includes(b.archivo));
        if (linea?.cubre(modelo, p.marca, p.equipo)) motivo = "linea";
      }

      if (motivo) {
        p.catalogos = [...(p.catalogos ?? []), c.ruta];
        if (motivo === "texto") porTexto++;
        else if (motivo === "rango") porRango++;
        else porLinea++;
      }
    }
  }

  // El mismo catálogo suele estar copiado en varias carpetas ("BROCHURE
  // UT120-200.pdf" en la de Jean Paul y "BROCHURE_UT120-200.pdf" en la
  // numerada vieja). Son rutas distintas pero un solo documento: se deja una
  // sola copia, la de mejor procedencia, o quien lo lea creerá que hay tres
  // catálogos para el mismo equipo.
  if (p.catalogos?.length) {
    const porHuella = new Map();
    for (const ruta of p.catalogos) {
      // Una misma ruta puede venir con "/" (asignaciones-logistica.json) o
      // con "\" (índice del caché): sin normalizar, el mismo archivo cuenta
      // como dos catálogos distintos.
      const texto = cache[ruta]?.texto ?? cache[ruta.replace(/\//g, "\\")]?.texto ?? cache[ruta.replace(/\\/g, "/")]?.texto;
      const huella = texto ? compacto(texto.slice(0, 1500)) : compacto(ruta.split(/[\\/]/).pop());
      const previo = porHuella.get(huella);
      if (!previo || prioridadRuta(ruta) < prioridadRuta(previo)) porHuella.set(huella, ruta);
    }
    p.catalogos = [...porHuella.values()];
  }

  if (p.catalogos?.length) yaTenian++;
  else sinCatalogo.push(p);
}

if (APLICAR) writeFileSync(CRUCE, JSON.stringify(cruce, null, 1));

console.log(`Catálogos agregados:`);
console.log(`  confirmados por logística     : ${porLogistica}`);
console.log(`  el catálogo nombra el modelo  : ${porTexto}`);
console.log(`  el nombre declara un rango    : ${porRango}`);
console.log(`  brochure de la línea          : ${porLinea}`);
console.log(`\nEquipos con catálogo: ${yaTenian}/${cruce.productos.length}   ·   sin catálogo: ${sinCatalogo.length}`);
if (sinCatalogo.length) {
  for (const p of sinCatalogo) console.log(`  ${p.codigo.padEnd(11)} ${p.marca.padEnd(9)} ${p.equipo.slice(0, 56)}`);
}
console.log(APLICAR ? `\nActualizado: ${CRUCE}` : `\n(Simulación: no se escribió nada. Correr con --aplicar.)`);
