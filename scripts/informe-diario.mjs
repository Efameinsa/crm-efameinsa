// Arma el informe diario de Santos para gerencia, sobre el mismo modelo Word
// que ya se usa (C:\Users\diseno\Downloads\INFORMES SANTOS), cambiando solo la
// fecha, las actividades hora por hora y las observaciones. El membrete, la
// tabla y el formato quedan intactos porque se reescribe únicamente el texto
// dentro del documento original.
//
// HORARIO REAL (define cuántas filas lleva la tabla y a qué hora se entrega):
//   lunes            08:00 → 19:00   (recupera la hora del jueves)
//   martes a viernes 08:00 → 18:00
//   jueves           08:00 → 17:00   (sale una hora antes)
//   sábado           09:00 → 12:00   (sin almuerzo)
//   almuerzo         13:00 → 14:00 de lunes a viernes
// El informe se arma 30 minutos antes de la salida, pero la última fila llega
// hasta la hora de salida: se informa la jornada completa, no hasta la hora en
// que se escribió.
//
// Uso:
//   node scripts/informe-diario.mjs --actividades actividades.json [--fecha 2026-08-20]
// El JSON es { "08:00": "…", "14:00": "…", "observaciones": "…" }; las horas
// que falten se llenan con "Desarrollo del CRM".

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { deflateRawSync } from "node:zlib";

const arg = (n, x = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? process.argv[i + 1] : x;
};

const CARPETA = arg("carpeta", "C:/Users/diseno/Downloads/INFORMES SANTOS");
// El modelo va descomprimido en una carpeta estable, para no ensuciar Descargas
// ni depender de la sesión en la que se creó.
const PLANTILLA = arg("plantilla", "C:/Users/diseno/.claude/plantillas/informe-diario");
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Horario del día: [horaInicio, horaSalida] en horas enteras, o null si no se trabaja. */
export function jornada(fecha) {
  const dia = fecha.getDay(); // 0 domingo … 6 sábado
  if (dia === 0) return null;
  if (dia === 6) return { inicio: 9, salida: 12, almuerzo: null };
  if (dia === 1) return { inicio: 8, salida: 19, almuerzo: 13 }; // lunes recupera
  if (dia === 4) return { inicio: 8, salida: 17, almuerzo: 13 }; // jueves sale antes
  return { inicio: 8, salida: 18, almuerzo: 13 };
}

const hoy = arg("fecha") ? new Date(`${arg("fecha")}T12:00:00`) : new Date();
const turno = jornada(hoy);
if (!turno) {
  console.log("Domingo: no se trabaja, no hay informe.");
  process.exit(0);
}

const actividades = arg("actividades") ? JSON.parse(readFileSync(arg("actividades"), "utf8")) : {};
const dosDigitos = (n) => String(n).padStart(2, "0");
const fechaTexto = `${hoy.getDate()} de ${MESES[hoy.getMonth()]} del ${hoy.getFullYear()}`;
const nombreSalida = `INFORME_SANTOS_VILCACHAGUA_AYALA_${dosDigitos(hoy.getDate())}_${dosDigitos(hoy.getMonth() + 1)}_${String(hoy.getFullYear()).slice(2)}.docx`;

// Las filas de la jornada, con el almuerzo en su sitio.
const filas = [];
for (let h = turno.inicio; h < turno.salida; h++) {
  filas.push({
    desde: `${dosDigitos(h)}:00`,
    hasta: `${dosDigitos(h + 1)}:00`,
    texto: h === turno.almuerzo ? "Almuerzo" : (actividades[`${dosDigitos(h)}:00`] ?? "Desarrollo del CRM"),
  });
}

// ---------- Reescritura del documento ----------
const xmlOriginal = readFileSync(join(PLANTILLA, "word", "document.xml"), "utf8");
const escapar = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const RE_FILA = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;

let xml = xmlOriginal;

// Fecha del encabezado. Word la deja partida en pedazos ('1','9',' de ',
// 'Agosto',' del 2026'), así que no sirve buscar la fecha completa: se ubica
// el párrafo que dice "Fecha", se escribe todo en el primer trozo después de
// los dos puntos y se vacían los demás.
const parrafos = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? [];
const parrafoFecha = parrafos.find((p) => />Fecha</.test(p));
if (parrafoFecha) {
  let despuesDeDosPuntos = false;
  let yaEscrita = false;
  const nuevo = parrafoFecha.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (todo, a, texto, c) => {
    if (!despuesDeDosPuntos) {
      if (texto.includes(":")) despuesDeDosPuntos = true;
      return todo;
    }
    if (!yaEscrita) {
      yaEscrita = true;
      return a + escapar(fechaTexto) + c;
    }
    return a + c;
  });
  xml = xml.split(parrafoFecha).join(nuevo);
}

const filasXml = xml.match(RE_FILA) ?? [];
const deHoras = filasXml.filter((f) => /\d{2}:00/.test(f));
const observacionesXml = filasXml.find((f) => f.includes("Observaciones"));

/** Reemplaza el texto de la última celda de la fila (la columna ACTIVIDAD). */
function conActividad(filaXml, texto) {
  const marcas = [...filaXml.matchAll(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g)];
  const ultima = marcas[marcas.length - 1];
  return filaXml.slice(0, ultima.index) + ultima[1] + escapar(texto) + ultima[3] + filaXml.slice(ultima.index + ultima[0].length);
}
/** Reemplaza el número y las horas de una fila (por si la jornada es más corta o más larga). */
function conHorario(filaXml, n, desde, hasta) {
  const marcas = [...filaXml.matchAll(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g)];
  // La primera marca con contenido es el número; las del medio, las horas.
  let usadas = 0;
  return filaXml.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (todo, a, texto, c) => {
    if (marcas.length - 1 === usadas++) return todo; // la última es la actividad
    if (/^\s*\d+\s*$/.test(texto)) return a + n + c;
    // El orden importa: en el modelo la hora viene partida en dos trozos
    // ("08:00 " y "-  09:00"). Si se mira primero si contiene una hora, el
    // segundo trozo también la contiene y termina escribiéndose el rango dos
    // veces en la misma fila.
    if (/^\s*-/.test(texto)) return a + `-  ${hasta}` + c;
    if (/\d{2}:00/.test(texto)) return /-/.test(texto) ? a + `${desde} - ${hasta}` + c : a + `${desde} ` + c;
    return todo;
  });
}

let nuevasFilas = "";
filas.forEach((f, i) => {
  const molde = deHoras[Math.min(i, deHoras.length - 1)];
  nuevasFilas += conActividad(conHorario(molde, i + 1, f.desde, f.hasta), f.texto);
});

// Se reemplaza el bloque completo de filas de horas por el nuevo.
const inicio = xml.indexOf(deHoras[0]);
const fin = xml.indexOf(deHoras[deHoras.length - 1]) + deHoras[deHoras.length - 1].length;
xml = xml.slice(0, inicio) + nuevasFilas + xml.slice(fin);

if (actividades.observaciones && observacionesXml) {
  const marcas = [...observacionesXml.matchAll(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g)];
  const ultima = marcas[marcas.length - 1];
  const nueva =
    observacionesXml.slice(0, ultima.index) + ultima[1] + escapar(actividades.observaciones) + ultima[3] +
    observacionesXml.slice(ultima.index + ultima[0].length);
  xml = xml.split(observacionesXml).join(nueva);
}

// ---------- Empaquetado (mismo escritor de ZIP que el resto de los Word) ----------
const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };

function armarZip(entradas) {
  const partes = [], central = [];
  let off = 0;
  const fecha = ((hoy.getFullYear() - 1980) << 9) | ((hoy.getMonth() + 1) << 5) | hoy.getDate();
  for (const e of entradas) {
    const comp = deflateRawSync(e.datos, { level: 9 }), crc = crc32(e.datos), nom = Buffer.from(e.nombre, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(fecha, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.datos.length, 22); lh.writeUInt16LE(nom.length, 26);
    partes.push(lh, nom, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(fecha, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(e.datos.length, 24); ch.writeUInt16LE(nom.length, 28);
    ch.writeUInt32LE(off, 42);
    central.push(ch, nom);
    off += lh.length + nom.length + comp.length;
  }
  const cd = Buffer.concat(central), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(off, 16);
  return Buffer.concat([...partes, cd, fin]);
}

const dirModelo = PLANTILLA;
const entradas = [];
(function recorrer(dir) {
  for (const n of readdirSync(dir)) {
    const r = join(dir, n);
    if (statSync(r).isDirectory()) recorrer(r);
    else {
      const rel = relative(dirModelo, r).split("\\").join("/");
      entradas.push({ nombre: rel, datos: rel === "word/document.xml" ? Buffer.from(xml, "utf8") : readFileSync(r) });
    }
  }
})(dirModelo);
entradas.sort((a, b) => (a.nombre === "[Content_Types].xml" ? -1 : b.nombre === "[Content_Types].xml" ? 1 : 0));

if (!existsSync(CARPETA)) mkdirSync(CARPETA, { recursive: true });
const salida = join(CARPETA, nombreSalida);
writeFileSync(salida, armarZip(entradas));

console.log(`${nombreSalida}`);
console.log(`${fechaTexto} · jornada ${dosDigitos(turno.inicio)}:00 a ${dosDigitos(turno.salida)}:00 · ${filas.length} filas`);
for (const f of filas) console.log(`  ${f.desde}-${f.hasta}  ${f.texto}`);
