// ============================================================
// CRM EFAMEINSA · Paso 4 · Qué es cada imagen de cada ficha
// ============================================================
// Una ficha puede traer solo el logo, logo y producto, logo producto y panel,
// o producto y panel. El estándar de maquetación necesita saber cuál es cuál
// para ponerla en su caja: 27 × 14 mm el logo, 54 × 96 la foto del equipo,
// 35 × 32 el panel.
//
// CÓMO SE DECIDE (y por qué así):
//   · La foto del EQUIPO es la que Word muestra más grande. En las 116 fichas
//     la plantilla es la misma —logo arriba, equipo al medio, panel abajo— así
//     que el tamaño con el que está insertada separa las tres sin ambigüedad.
//   · Lo que aparece ANTES de la foto del equipo es el logo de la marca; lo
//     que aparece DESPUÉS, el panel de control.
//   · Una imagen que se repite en muchas fichas distintas es un logo de marca
//     (UNIMAC está en 30 fichas); la que aparece una sola vez es del equipo.
//     La repetición se usa para avisar de un desacuerdo, no para decidir.
//
// NADA DE ESTO SE DA POR BUENO SIN MIRARLO. El paso 5 arma hojas de contacto
// con todas las imágenes rotuladas, y lo que esté mal se corrige a mano en
// `scripts/data/fichas-v/correcciones.json`. Ya pasó tres veces que el Word
// traía un pantallazo de navegador como única imagen (GP100, UC100, FCU500):
// eso no lo detecta ninguna heurística de tamaño.
//
// Uso: node scripts/fichas-v-04-clasificar.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const FICHAS = "scripts/data/fichas-v/fichas.json";
const CORRECCIONES = "scripts/data/fichas-v/correcciones.json";
const SALIDA = "scripts/data/fichas-v/clasificacion.json";

/** Píxeles reales del archivo, leídos de la cabecera (PNG o JPEG). */
function medirPixeles(ruta) {
  const b = readFileSync(ruta);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString("ascii", 12, 16) === "IHDR") {
    return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b.readUInt16BE(0) === 0xffd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marcador = b[i + 1];
      if (marcador === 0xff) { i++; continue; }
      if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd9)) { i += 2; continue; }
      const largo = b.readUInt16BE(i + 2);
      if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
        return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
      }
      i += 2 + largo;
    }
  }
  return { ancho: 0, alto: 0 };
}

/** Píxeles mínimos para imprimir a 300 ppp en cada caja del estándar. */
const MINIMO_PX = { logo: 320, producto: 640, panel: 415 };

const datos = JSON.parse(readFileSync(FICHAS, "utf-8"));
const correcciones = existsSync(CORRECCIONES) ? JSON.parse(readFileSync(CORRECCIONES, "utf-8")) : {};
const LOGOS = new Map(Object.entries(correcciones.logos ?? {}));
const PANELES = new Set(correcciones.paneles ?? []);
const PANTALLAS = new Set(correcciones.resolucionesDePantalla ?? []);
const PANTALLAZOS = new Set(correcciones.pantallazos?.hashes ?? []);

// Cuántas fichas distintas usan cada imagen: delata los logos de marca.
const repeticiones = new Map();
for (const f of datos.fichas) {
  for (const h of new Set(f.imagenes.map((i) => i.hash))) repeticiones.set(h, (repeticiones.get(h) ?? 0) + 1);
}

const fichas = datos.fichas.map((f) => {
  const imagenes = f.imagenes.map((img) => {
    const px = medirPixeles(img.archivo);
    const area = (img.anchoMm ?? 0) * (img.altoMm ?? 0);
    return { ...img, px, area, repetida: repeticiones.get(img.hash) ?? 1 };
  });

  // 1. Lo reconocido a ojo manda: logos de marca y pantallas del equipo.
  //
  //    Y una regla que ordena todo lo demás: SI LESLY LA RECORTÓ EN EL WORD, es
  //    lo que ella quiere mostrar. Las once imágenes que antes se descartaban
  //    por «captura de pantalla» resultaron ser exactamente las que trae
  //    recortadas —la CALE160 esconde así las dos franjas rojas del catálogo y
  //    aísla la vista del panel—, así que el recorte manda sobre la sospecha.
  //    Solo se descarta una captura ENTERA, sin recortar, con tamaño exacto de
  //    pantalla.
  for (const img of imagenes) {
    const resolucion = `${img.px.ancho}x${img.px.alto}`;
    if (LOGOS.has(img.hash)) {
      img.rol = "logo";
      img.marcaLogo = LOGOS.get(img.hash);
    } else if (PANELES.has(img.hash)) img.rol = "panel";
    else if (!img.recorte && (PANTALLAS.has(resolucion) || PANTALLAZOS.has(img.hash))) img.rol = "pantallazo";
    else img.rol = null;
  }

  // 2. El resto se reparte por el ORDEN DE LA FICHA, que es el del estándar:
  //    logo arriba, equipo al medio, panel abajo. El equipo es el que Lesly
  //    puso más grande; lo que va antes y es chico y apaisado, es un logo; lo
  //    que va después, la vista de complemento (el panel).
  const candidatas = imagenes.filter((img) => img.rol === null);
  if (candidatas.length > 0) {
    const area = (img) => (img.anchoMm ?? 0) * (img.altoMm ?? 0) || img.px.ancho * img.px.alto;
    let equipo = candidatas[0];
    for (const img of candidatas) if (area(img) > area(equipo)) equipo = img;

    let vistoElEquipo = false;
    let yaHayPanel = false;
    for (const img of candidatas) {
      if (img === equipo) {
        img.rol = "producto";
        vistoElEquipo = true;
        continue;
      }
      const anchoVisible = img.anchoMm ?? img.px.ancho;
      const altoVisible = img.altoMm ?? img.px.alto;
      const proporcion = anchoVisible / (altoVisible || 1);
      if (!vistoElEquipo && anchoVisible <= 35 && proporcion >= 1.3) img.rol = "logo";
      else if (vistoElEquipo && !yaHayPanel) {
        img.rol = "panel";
        yaHayPanel = true;
      } else img.rol = "descartar";
    }
  } else {
    // Todo son capturas enteras: la ficha se queda sin foto y hay que sacarla
    // recortando la captura.
    const primerPantallazo = imagenes.find((img) => img.rol === "pantallazo");
    if (primerPantallazo) primerPantallazo.recortar = true;
  }

  // Corrección a mano: gana siempre sobre la heurística.
  const arreglo = correcciones[f.codigo];
  if (arreglo?.roles) {
    imagenes.forEach((img, i) => {
      const rol = arreglo.roles[String(i + 1)];
      if (rol) img.rol = rol; // "logo" | "producto" | "panel" | "descartar"
    });
  }

  const avisos = [];
  const producto = imagenes.find((i) => i.rol === "producto");
  if (!producto) avisos.push("sin foto de equipo");
  if (producto && producto.repetida > 3) avisos.push(`la foto de equipo se repite en ${producto.repetida} fichas`);
  for (const img of imagenes) {
    if (img.rol === "descartar" || img.rol === "pantallazo") continue;
    const minimo = MINIMO_PX[img.rol] ?? 0;
    if (img.px.ancho && img.px.ancho < minimo) {
      avisos.push(`${img.rol} de ${img.px.ancho}px (mínimo ${minimo} para 300 ppp)`);
    }
  }
  const pantallazos = imagenes.filter((i) => i.rol === "pantallazo").length;
  if (pantallazos > 0) avisos.push(`${pantallazos} captura(s) de pantalla descartada(s)`);
  if (imagenes.some((i) => i.recortar)) avisos.push("SIN FOTO PROPIA: solo hay capturas de pantalla");

  const utiles = imagenes.filter((i) => i.rol === "logo" || i.rol === "producto" || i.rol === "panel");
  return { ...f, imagenes, avisos, composicion: utiles.map((i) => i.rol).join("+") || "sin imágenes" };
});

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), fichas }, null, 2));

const porComposicion = fichas.reduce((acc, f) => ({ ...acc, [f.composicion]: (acc[f.composicion] ?? 0) + 1 }), {});
console.log("Composición de imágenes por ficha:");
for (const [k, v] of Object.entries(porComposicion).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
const conAvisos = fichas.filter((f) => f.avisos.length);
console.log(`\nFichas con aviso: ${conAvisos.length}`);
for (const f of conAvisos) console.log(`  · ${f.codigo.padEnd(11)} ${f.avisos.join(" · ")}`);
console.log(`\n→ ${SALIDA}`);
