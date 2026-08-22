// Extrae la FOTO del equipo de cada ficha técnica y la deja lista para
// maquetar cotizaciones, junto con el enlace a su especificación técnica.
//
// Por qué no se puede tomar cualquier imagen del .docx: de las 68 imágenes
// distintas que hay dentro de las fichas, la mayoría NO son el equipo. Hay
// membrete de la papelería de Efameinsa (aparece en 52 fichas), logos de
// marca (UniMac, LG, GMP), pantallas del panel de control ("Dryer Ready") y
// —sobre todo— capturas de pantalla completas del navegador, con pestañas y
// barra de tareas incluidas, que alguien pegó en vez de la foto.
//
// Las fotos buenas se identificaron viéndolas una por una en una hoja de
// contactos (scripts/inventario-imagenes-fichas.mjs la genera) y quedan
// fijadas acá por huella del archivo, no por posición ni por nombre: así la
// lista no se desordena si mañana se agrega una ficha.
//
// Solo se procesan productos cuya ficha está CONFIRMADA POR CONTENIDO
// (confianza alta o media con archivo asignado). Los ambiguos esperan a que
// Lesly confirme — no se les inventa una foto.
//
// Uso: node scripts/extraer-fotos-productos.mjs [--aplicar]
//   sin --aplicar solo informa; con --aplicar escribe en public/productos/.
//
// OJO al re-generar: NO vaciar public/productos/ con un `rm *.png`. Ahí
// conviven las fotos de los 3 productos de demo cargados a mano en B4
// (lg-lavadora-frontal.png y las dos lg-secadora-*.png), que están
// versionadas y referenciadas desde la base. Este script solo sobrescribe
// los archivos nombrados con un código del maestro.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const APLICAR = process.argv.includes("--aplicar");
const CRUCE = "scripts/data/cruce-definitivo-2026-08-22.json";
const DESTINO = "public/productos";
const MAPEO = "scripts/data/fotos-productos-2026-08-22.json";

// Fotos limpias del equipo, verificadas visualmente una por una.
// (28 imágenes distintas; varias las comparten las variantes de un mismo
// modelo, que es correcto: la UT075 eléctrica y la de gas son el mismo
// equipo por fuera.)
const HUELLAS_FOTO = new Set([
  "5f14b1a54d03c707", "c65b97c3c1b2066a", "d9aaa76ed8021dd8", "d24ba2b9fe5658d7",
  "f0a642264f991557", "1a6e5205a001a96b", "f4a77621683331cd", "046a56072aeb545d",
  "2956b068a199b517", "02bfc124bc46f74c", "62a35931cb3ac070", "2dac234e7c730558",
  "1aefd7db6d3dd5a9", "33f75e15995034f9", "1311b8090eee3385", "bf23dc8f48c4d2d7",
  "b8c0417db942204b", "dbd6f6e859bd6806", "d033c1ccff86f49c", "6e9e46c59994d8f8",
  "d26255f9a7e034b2", "ce952e6d812d5253", "adcf5ef6c5b159bd", "03143c872723d06a",
  "e9f4b1ff0fd295d7", "fa6a9200f196e309", "89e1af9de4effed5", "54396e358a785a8a",
]);

function listarMedia(docx) {
  try {
    return execFileSync("unzip", ["-l", docx], { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 })
      .split("\n")
      .map((l) => l.match(/(word\/media\/\S+)/)?.[1])
      .filter(Boolean);
  } catch {
    return [];
  }
}
const leer = (docx, interno) => {
  try {
    return execFileSync("unzip", ["-p", docx, interno], { maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
};

const productos = JSON.parse(readFileSync(CRUCE, "utf-8")).productos;
// El modelo normalizado de cada código lo calculó el cruce por contenido.
// Sirve para compartir la foto entre variantes del mismo equipo.
const contenido = JSON.parse(readFileSync("scripts/data/cruce-contenido-2026-08-22.json", "utf-8")).resultado;
const modeloPorCodigo = new Map();
for (const c of contenido) if (c.modelo && !modeloPorCodigo.has(c.codigo)) modeloPorCodigo.set(c.codigo, c.modelo);
const claveModelo = (p) => {
  const m = modeloPorCodigo.get(p.codigo);
  return m ? `${p.marca}|${m.toUpperCase().replace(/[^A-Z0-9]/g, "")}` : null;
};

if (APLICAR) mkdirSync(DESTINO, { recursive: true });

const conFoto = [];
const sinFoto = [];
const sinFichaConfirmada = [];
const noConfirmados = [];
/** clave "MARCA|MODELO" → mejor foto encontrada para ese modelo. */
const fotoPorModelo = new Map();

// Los códigos que el maestro usa para DOS equipos distintos (LAV180 es la
// RX180 rígida y también la FX180 flotante) no pueden compartir un archivo
// llamado como el código: el segundo pisaría al primero. Se les agrega un
// sufijo y quedan marcados, porque hasta que Lesly les dé un código propio
// no hay forma de saber a cuál se refiere una cotización.
const vecesCodigo = {};
for (const p of productos) vecesCodigo[p.codigo] = (vecesCodigo[p.codigo] ?? 0) + 1;
const usadoCodigo = {};

for (const p of productos) {
  // Solo los que tienen ficha asignada por el cruce de contenido.
  if (!p.especificacion || !/\.docx$/i.test(p.especificacion)) {
    sinFichaConfirmada.push(p);
    continue;
  }
  // Y solo si el CONTENIDO de esa ficha la confirmó. Los "ambiguo" y
  // "sin_candidatos" esperan a Lesly: darles foto sería propagar un error
  // — SECU55 y SECU502, por ejemplo, son justo los dos que están
  // intercambiados entre sí.
  if (!["alta", "media"].includes(p.especificacionConfianza)) {
    noConfirmados.push(p);
    continue;
  }

  // De todas las imágenes de la ficha, quedarse con las que son foto del
  // equipo y elegir la de mayor superficie (la más aprovechable).
  const candidatas = [];
  for (const interno of listarMedia(p.especificacion)) {
    const datos = leer(p.especificacion, interno);
    if (!datos) continue;
    const huella = createHash("sha1").update(datos).digest("hex").slice(0, 16);
    if (!HUELLAS_FOTO.has(huella)) continue;
    const m = await sharp(datos).metadata();
    candidatas.push({ datos, huella, interno, area: (m.width ?? 0) * (m.height ?? 0), w: m.width, h: m.height });
  }
  if (candidatas.length === 0) {
    sinFoto.push(p);
    continue;
  }
  candidatas.sort((a, b) => b.area - a.area);
  const elegida = candidatas[0];
  // Se registra la mejor foto de cada modelo para poder prestársela a las
  // variantes cuya ficha no trae ninguna (misma máquina, distinto control o
  // voltaje: por fuera es el mismo equipo).
  const clave = claveModelo(p);
  if (clave) {
    const previa = fotoPorModelo.get(clave);
    if (!previa || previa.area < elegida.area) fotoPorModelo.set(clave, { ...elegida, codigo: p.codigo });
  }

  const duplicado = vecesCodigo[p.codigo] > 1;
  const n = (usadoCodigo[p.codigo] = (usadoCodigo[p.codigo] ?? 0) + 1);
  const archivo = `${p.codigo.toLowerCase()}${duplicado ? `-v${n}` : ""}.png`;
  if (APLICAR) {
    // trim() recorta el marco blanco que traen casi todas (la foto queda
    // chica dentro de un lienzo grande); el fondo blanco se vuelve a poner
    // con flatten para que no quede transparente sobre el PDF.
    await sharp(elegida.datos)
      .trim({ threshold: 12 })
      .resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .png({ quality: 90, compressionLevel: 9 })
      .toFile(join(DESTINO, archivo));
  }

  conFoto.push({
    codigo: p.codigo,
    marca: p.marca,
    equipo: p.equipo,
    confianza: p.especificacionConfianza,
    foto: `productos/${archivo}`,
    codigoDuplicado: duplicado || undefined,
    fotoOrigen: { ficha: p.especificacion, interno: elegida.interno, huella: elegida.huella, px: `${elegida.w}x${elegida.h}` },
    especificacion: p.especificacion,
    catalogos: p.catalogos ?? [],
  });
}

// Segunda pasada: a las variantes sin foto propia se les presta la de otra
// variante del mismo modelo. Queda anotado de cuál se tomó (`fotoPrestadaDe`)
// para que se pueda revisar y, si alguna variante se ve distinta por fuera,
// reemplazarla.
const prestadas = [];
for (const p of [...sinFoto]) {
  const clave = claveModelo(p);
  const fuente = clave && fotoPorModelo.get(clave);
  if (!fuente) continue;

  const duplicado = vecesCodigo[p.codigo] > 1;
  const n = (usadoCodigo[p.codigo] = (usadoCodigo[p.codigo] ?? 0) + 1);
  const archivo = `${p.codigo.toLowerCase()}${duplicado ? `-v${n}` : ""}.png`;
  if (APLICAR) {
    await sharp(fuente.datos)
      .trim({ threshold: 12 })
      .resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .png({ quality: 90, compressionLevel: 9 })
      .toFile(join(DESTINO, archivo));
  }
  conFoto.push({
    codigo: p.codigo,
    marca: p.marca,
    equipo: p.equipo,
    confianza: p.especificacionConfianza,
    foto: `productos/${archivo}`,
    fotoPrestadaDe: fuente.codigo,
    codigoDuplicado: duplicado || undefined,
    fotoOrigen: { ficha: p.especificacion, interno: fuente.interno, huella: fuente.huella, px: `${fuente.w}x${fuente.h}` },
    especificacion: p.especificacion,
    catalogos: p.catalogos ?? [],
  });
  prestadas.push({ codigo: p.codigo, de: fuente.codigo });
  sinFoto.splice(sinFoto.indexOf(p), 1);
}

if (APLICAR) {
  writeFileSync(MAPEO, JSON.stringify(conFoto, null, 1));
}

if (prestadas.length) {
  console.log(`\nFoto tomada de otra variante del mismo modelo (${prestadas.length}):`);
  for (const x of prestadas) console.log(`  ${x.codigo.padEnd(11)} usa la foto de ${x.de}`);
}

const listos = conFoto.filter((c) => !c.codigoDuplicado);
console.log(`Productos con foto lista         : ${conFoto.length}`);
console.log(`  listos para usar               : ${listos.length}`);
console.log(`  con código duplicado en el maestro (foto ok, código a resolver): ${conFoto.length - listos.length}`);
console.log(`  · de ficha con confianza alta  : ${conFoto.filter((c) => c.confianza === "alta").length}`);
console.log(`  · de ficha con confianza media : ${conFoto.filter((c) => c.confianza === "media").length}`);
console.log(`Con ficha pero sin foto limpia   : ${sinFoto.length}`);
console.log(`Ficha sin confirmar por contenido (esperan a Lesly): ${noConfirmados.length}`);
console.log(`Sin ficha asignada               : ${sinFichaConfirmada.length}`);

if (noConfirmados.length) {
  console.log(`\nSin foto a propósito, hasta que Lesly confirme su ficha:`);
  for (const p of noConfirmados) {
    console.log(`  ${p.codigo.padEnd(11)} [${p.especificacionConfianza}] ${p.equipo.slice(0, 52)}`);
  }
}

if (sinFoto.length) {
  console.log(`\nCon ficha pero sin foto aprovechable (la ficha solo trae capturas de pantalla o logos):`);
  for (const p of sinFoto) console.log(`  ${p.codigo.padEnd(11)} ${p.marca.padEnd(9)} ${p.equipo.slice(0, 58)}`);
}

if (!APLICAR) {
  console.log(`\n(Simulación: no se escribió nada. Volver a correr con --aplicar.)`);
} else {
  const tamaños = conFoto.map((c) => (existsSync(join(DESTINO, c.foto.replace("productos/", ""))) ? 1 : 0));
  console.log(`\nEscritas ${tamaños.filter(Boolean).length} imágenes en ${DESTINO}/ y el mapeo en ${MAPEO}`);
}
