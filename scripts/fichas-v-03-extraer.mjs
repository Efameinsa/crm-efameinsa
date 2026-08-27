// ============================================================
// CRM EFAMEINSA · Paso 3 · Leer cada ficha técnica tal como está
// ============================================================
// Orden de Darwin (27-08): «revisa la descripción de cada ficha técnica y
// reconoce sus títulos, subtítulos y cada ítem con su viñeta, con su misma
// estructura, y ponlo fielmente en la cotización».
//
// Hasta hoy el extractor viejo (`extraer-ficha-tecnica.mjs`) metía cada ficha
// en cuatro cajones fijos —características, diseño, especificaciones,
// medidas— y perdía todo lo que no encajara. Acá se lee la ficha COMO ESTÁ:
// una lista ordenada de bloques, cada uno con su tipo, en el mismo orden en
// que aparecen en el Word.
//
//   titulo     — el rótulo subrayado / en mayúsculas que abre una sección
//   subtitulo  — el rótulo en negrita de adentro (TAMBOR, PUERTA…)
//   vineta     — cada ítem de la lista
//   dato       — «Largo : 1100 mm», que se maqueta en dos columnas
//
// QUÉ NO SE TRAE, por orden expresa: las tablas del pie de la ficha (precio,
// tiempo de entrega, garantía, forma de pago). Eso lo pone el sistema con las
// condiciones de la cotización, y la firma del comercial, como siempre.
//
// La tabla de arriba (Marca / Modelo / Capacidad / Calentamiento / Panel /
// Controles) sí se lee, pero como datos de cabecera: son las columnas de la
// ficha del PDF, no descripción.
//
// No toca la base: escribe scripts/data/fichas-v/fichas.json y las imágenes
// en scripts/data/fichas-v/img/.
//
// Uso: node scripts/fichas-v-03-extraer.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createCanvas, loadImage } from "canvas";
import { leerZip, textoDeZip } from "./lib-zip.mjs";

/**
 * Deja la imagen como se ve en el Word: recortada por el rectángulo que puso
 * Lesly. Los valores vienen en fracción de la imagen (izquierda, arriba,
 * derecha, abajo) y se descuentan de cada lado.
 */
async function aplicarRecorte(datos, r) {
  const img = await loadImage(datos);
  const x0 = Math.round(img.width * r.l);
  const y0 = Math.round(img.height * r.t);
  const ancho = Math.max(1, Math.round(img.width * (1 - r.l - r.r)));
  const alto = Math.max(1, Math.round(img.height * (1 - r.t - r.b)));
  const lienzo = createCanvas(ancho, alto);
  const ctx = lienzo.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(img, x0, y0, ancho, alto, 0, 0, ancho, alto);
  return lienzo.toBuffer("image/png");
}

const LISTA = "scripts/data/fichas-v/lista.json";
const SALIDA = "scripts/data/fichas-v/fichas.json";
const DIR_IMG = "scripts/data/fichas-v/img";

const EMU_POR_MM = 36000;

// ---------- utilidades de XML ----------

const sinEtiquetas = (xml) =>
  xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/ /g, " ");

const limpio = (t) => t.replace(/[ \t]+/g, " ").replace(/\s+$/g, "").trim();

/**
 * Las mayúsculas llevan tilde.
 *
 * Las fichas están tecleadas sin tilde en mayúscula —«ESPECIFICACIONES
 * TECNICAS», «CARACTERISTICAS», «CALEFACCION DE SECADO»—, que es una costumbre
 * de teclado, no una forma correcta de escribir: la Academia lo dice desde
 * siempre y el documento va a un cliente. Pedido de Darwin el 27-08: «que
 * respete las tildes en las mayúsculas, faltan».
 *
 * Se corrige SOLO palabra completa y SOLO cuando viene toda en mayúsculas, con
 * un diccionario cerrado de las que de verdad aparecen en las 115 fichas. Así
 * no se toca un modelo (UT120L, SS17-E) ni una palabra que ya venía bien.
 */
const TILDES = {
  ADEMAS: "ADEMÁS",
  AUTOMATICA: "AUTOMÁTICA",
  AUTOMATICAS: "AUTOMÁTICAS",
  AUTOMATICO: "AUTOMÁTICO",
  AUTOMATICOS: "AUTOMÁTICOS",
  AUTOMATIZACION: "AUTOMATIZACIÓN",
  BASICO: "BÁSICO",
  CALDERIN: "CALDERÍN",
  CALEFACCION: "CALEFACCIÓN",
  CARACTERISTICA: "CARACTERÍSTICA",
  CARACTERISTICAS: "CARACTERÍSTICAS",
  CODIGO: "CÓDIGO",
  COMPRESION: "COMPRESIÓN",
  CONSTRUCCION: "CONSTRUCCIÓN",
  DIAMETRO: "DIÁMETRO",
  DIMENSION: "DIMENSIÓN",
  DOSIFICACION: "DOSIFICACIÓN",
  ELECTRICA: "ELÉCTRICA",
  ELECTRICAS: "ELÉCTRICAS",
  ELECTRICO: "ELÉCTRICO",
  ELECTRICOS: "ELÉCTRICOS",
  ELECTRONICA: "ELECTRÓNICA",
  ELECTRONICO: "ELECTRÓNICO",
  ENERGIA: "ENERGÍA",
  EXTRACCION: "EXTRACCIÓN",
  FUNCION: "FUNCIÓN",
  GARANTIA: "GARANTÍA",
  HIDRAULICA: "HIDRÁULICA",
  HIDRAULICO: "HIDRÁULICO",
  ILUMINACION: "ILUMINACIÓN",
  INSTALACION: "INSTALACIÓN",
  INYECCION: "INYECCIÓN",
  MAQUINA: "MÁQUINA",
  MAQUINAS: "MÁQUINAS",
  MAXIMO: "MÁXIMO",
  MECANICA: "MECÁNICA",
  MECANICO: "MECÁNICO",
  MINIMO: "MÍNIMO",
  NEUMATICA: "NEUMÁTICA",
  NEUMATICO: "NEUMÁTICO",
  NUMERO: "NÚMERO",
  OPERACION: "OPERACIÓN",
  PRESION: "PRESIÓN",
  PROGRAMACION: "PROGRAMACIÓN",
  PROTECCION: "PROTECCIÓN",
  REFRIGERACION: "REFRIGERACIÓN",
  ROTACION: "ROTACIÓN",
  SEGUN: "SEGÚN",
  SUSPENSION: "SUSPENSIÓN",
  TACTIL: "TÁCTIL",
  TECNICA: "TÉCNICA",
  TECNICAS: "TÉCNICAS",
  TECNICO: "TÉCNICO",
  TECNICOS: "TÉCNICOS",
  TENSION: "TENSIÓN",
  TRANSMISION: "TRANSMISIÓN",
  TRASMISION: "TRASMISIÓN",
  ULTIMA: "ÚLTIMA",
  ULTIMO: "ÚLTIMO",
  UNICO: "ÚNICO",
  VIBRACION: "VIBRACIÓN",
};

function acentuarMayusculas(texto) {
  return texto.replace(/[A-ZÑÁÉÍÓÚ]{3,}/g, (palabra) => TILDES[palabra] ?? palabra);
}

/**
 * Rangos de cada FILA de tabla del documento.
 *
 * Se trabaja por fila y no por tabla porque la ficha entera suele ser UNA sola
 * tabla: título, rótulos técnicos, valores y el cuerpo con imagen y
 * descripción son cuatro filas de la misma. Clasificar la tabla completa dejaba
 * la cabecera técnica dentro de la descripción (los rótulos salían como
 * subtítulos y los valores, como títulos de sección).
 */
function rangosDeFilas(xml) {
  const rangos = [];
  const pila = [];
  const re = /<w:tr(?:\s[^>]*)?>|<\/w:tr>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (m[0] === "</w:tr>") {
      const inicio = pila.pop();
      if (inicio !== undefined) rangos.push({ inicio, fin: re.lastIndex, profundidad: pila.length });
    } else {
      pila.push(m.index);
    }
  }
  return rangos.sort((a, b) => a.inicio - b.inicio);
}

/** Texto plano de una tabla, celda por celda. */
function celdasDeTabla(xmlTabla) {
  return [...xmlTabla.matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map((m) => limpio(sinEtiquetas(m[1])));
}

// ---------- qué es cada tabla ----------

const ROTULOS_CABECERA = ["marca", "modelo", "capacidad", "calentamiento", "panel", "control", "voltaje", "volumen"];
const ROTULOS_CONDICIONES = [
  "precio",
  "tiempo de entrega",
  "garantia",
  "garantía",
  "forma de pago",
  "saldo",
  "validez",
  "i.g.v",
  "igv",
  "total",
  "sub total",
  "adelanto",
  "contado",
];

/** Qué es una fila, mirando solo sus rótulos. */
function claseDeFila(celdas) {
  if (celdas.length === 0 || celdas.length > 8) return "contenido";
  const normal = celdas.map((c) => c.toLowerCase().trim());
  const cuenta = (rotulos) => normal.filter((c) => c && rotulos.some((r) => c.includes(r))).length;
  // Los rótulos ocupan la celda entera («Marca», «Forma de pago»); un texto
  // largo que casualmente nombre el precio no convierte la fila en cabecera.
  const cortas = normal.filter((c) => c.length <= 26);
  if (cortas.length < celdas.length - 1) return "contenido";
  if (cuenta(ROTULOS_CONDICIONES) >= 2) return "condiciones";
  if (cuenta(ROTULOS_CABECERA) >= 3) return "cabecera";
  return "contenido";
}

// ---------- el documento, párrafo por párrafo ----------

function parrafosDe(xml) {
  const parrafos = [];
  const re = /<w:p(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/w:p>)/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const cuerpo = m[1] ?? "";
    const pPr = (cuerpo.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) ?? [""])[0];
    const cuerpoSinPr = cuerpo.replace(pPr, "");
    const texto = limpio(sinEtiquetas(cuerpoSinPr));

    // Negrita / subrayado: se miran las propiedades de las corridas con texto.
    const corridas = [...cuerpoSinPr.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)].map((r) => r[1]);
    const conTexto = corridas.filter((r) => /<w:t[\s>]/.test(r));
    const negrita =
      conTexto.length > 0 && conTexto.every((r) => /<w:b\/>|<w:b [^>]*w:val="(1|true|on)"/.test(r));
    const subrayado = conTexto.some((r) => /<w:u\s[^>]*w:val="(?!none)/.test(r));

    const esLista = /<w:numPr>/.test(pPr);
    const estilo = (pPr.match(/<w:pStyle w:val="([^"]+)"/) ?? [])[1] ?? null;
    const nivel = Number((pPr.match(/<w:ilvl w:val="(\d+)"/) ?? [])[1] ?? 0);

    // Imágenes ancladas en este párrafo, con la medida a la que Word las
    // muestra: es la señal que separa un logo de la foto del equipo.
    const imagenes = [];
    for (const dibujo of cuerpo.matchAll(/<w:drawing>[\s\S]*?<\/w:drawing>/g)) {
      const d = dibujo[0];
      const rId = (d.match(/<a:blip[^>]*r:embed="([^"]+)"/) ?? [])[1];
      const ext = d.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
      if (rId) imagenes.push({ rId, cx: ext ? Number(ext[1]) : null, cy: ext ? Number(ext[2]) : null });
    }
    for (const pict of cuerpo.matchAll(/<w:pict>[\s\S]*?<\/w:pict>/g)) {
      const rId = (pict[0].match(/<v:imagedata[^>]*r:id="([^"]+)"/) ?? [])[1];
      if (rId) imagenes.push({ rId, cx: null, cy: null });
    }

    parrafos.push({ inicio: m.index, texto, negrita, subrayado, esLista, estilo, nivel, imagenes });
  }
  return parrafos;
}

// ---------- clasificación de cada línea de la descripción ----------

const RE_VINETA_MANUAL = /^[•·▪◦‣\-–—*]\s*/;
const RE_ITEM = /^ITEM\s+[IVXLC]+\s*[.\-]/i;

/** ¿La línea es «rótulo : valor»? Solo dentro de secciones de medidas. */
function comoDato(texto) {
  const m = texto.match(/^([^:]{2,45}?)\s*:\s*(.+)$/);
  if (!m) return null;
  return { rotulo: limpio(m[1]), valor: limpio(m[2]) };
}

const RE_SECCION_DE_MEDIDAS = /DIMENSION|MEDIDA|ESPECIFICACION|DATOS T[EÉ]CNICOS|CARACTER[IÍ]STICAS T[EÉ]CNICAS/i;

async function extraerFicha(rutaDocx) {
  const zip = leerZip(rutaDocx);
  const xml = textoDeZip(zip, "word/document.xml");
  if (!xml) throw new Error("sin word/document.xml");

  // rId → archivo dentro del zip
  const rels = new Map();
  for (const m of textoDeZip(zip, "word/_rels/document.xml.rels").matchAll(
    /Id="([^"]+)"[^>]*Target="([^"]+)"/g,
  )) {
    rels.set(m[1], m[2].replace(/^\.\.\//, "").replace(/^\//, ""));
  }

  // Imágenes de encabezado y pie = papelería de Efameinsa, no van a la ficha.
  const papeleria = new Set();
  for (const nombre of zip.keys()) {
    if (!/^word\/_rels\/(header|footer)\d*\.xml\.rels$/.test(nombre)) continue;
    for (const m of textoDeZip(zip, nombre).matchAll(/Target="([^"]+)"/g)) {
      papeleria.add(m[1].replace(/^\.\.\//, "").replace(/^\//, ""));
    }
  }

  const filas = rangosDeFilas(xml).map((r) => {
    const celdas = celdasDeTabla(xml.slice(r.inicio, r.fin));
    return { ...r, celdas, clase: claseDeFila(celdas) };
  });

  // La fila siguiente a una de rótulos trae sus valores: tampoco es
  // descripción. Se busca la fila hermana (misma profundidad) que empieza
  // inmediatamente después.
  for (let i = 0; i < filas.length; i++) {
    if (filas[i].clase !== "cabecera" && filas[i].clase !== "condiciones") continue;
    const siguiente = filas.find((f, j) => j > i && f.profundidad === filas[i].profundidad && f.inicio >= filas[i].fin);
    if (siguiente && siguiente.clase === "contenido") siguiente.clase = `${filas[i].clase}-valores`;
  }

  // Datos de cabecera: rótulos de una fila, valores de la de abajo.
  const cabecera = {};
  for (let i = 0; i < filas.length; i++) {
    if (filas[i].clase !== "cabecera") continue;
    const valores = filas.find((f, j) => j > i && f.clase === "cabecera-valores");
    if (!valores) continue;
    filas[i].celdas.forEach((rotulo, k) => {
      const clave = rotulo.toLowerCase();
      const valor = limpio(valores.celdas[k] ?? "");
      if (!valor) return;
      if (clave.includes("marca")) cabecera.marca ??= valor;
      else if (clave.includes("modelo")) cabecera.modelo ??= valor;
      else if (clave.includes("capacidad") || clave.includes("volumen")) cabecera.capacidad ??= valor;
      else if (clave.includes("calentamiento")) cabecera.calentamiento ??= valor;
      else if (clave.includes("panel")) cabecera.panel ??= valor;
      else if (clave.includes("control") || clave.includes("voltaje")) cabecera.controles ??= valor;
    });
  }

  const parrafos = parrafosDe(xml);

  /** La fila de tabla más interna que contiene esta posición. */
  const tablaDe = (pos) => {
    const dentro = filas.filter((f) => pos > f.inicio && pos < f.fin);
    return dentro.length ? dentro[dentro.length - 1] : null;
  };

  // ¿La ficha usa el subrayado para abrir sección? Es la señal del estándar
  // («AUTOMATIZACION, SEGURIDAD Y CONTROL» subrayado; «TAMBOR», solo negrita).
  // Algunas fichas viejas no subrayan nada: ahí manda la negrita en mayúsculas.
  const usaSubrayado = parrafos.some((p) => p.subrayado && p.texto && !p.esLista);

  // ---------- bloques de la descripción ----------
  const bloques = [];
  let seccionActual = "";
  for (const p of parrafos) {
    const tabla = tablaDe(p.inicio);
    // Se descartan las dos tablas de datos; el contenido puede estar dentro de
    // una tabla de maquetación y ese sí se lee.
    if (tabla && tabla.clase !== "contenido") continue;
    if (!p.texto) continue;
    if (RE_ITEM.test(p.texto)) continue; // el título del ítem lo pone el sistema
    if (/^(www\.|av\.|tel[eé]fono|telefax)/i.test(p.texto)) continue; // papelería suelta

    const texto = acentuarMayusculas(limpio(p.texto.replace(RE_VINETA_MANUAL, "")));
    if (!texto) continue;

    const esVineta = p.esLista || RE_VINETA_MANUAL.test(p.texto);
    const mayusculas = texto === texto.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(texto);

    // Título de sección: el subrayado. Subtítulo: la negrita sin subrayar.
    // Es la distinción que hace la ficha en papel y la que pide el estándar de
    // maquetación; tomar toda mayúscula en negrita como título convertía
    // TAMBOR, PUERTA y PANELES en secciones, y el cliente leía el nombre de la
    // pieza al mismo nivel que «DISEÑO DE CONSTRUCCIÓN».
    if (!esVineta && texto.length <= 80) {
      const esTitulo = usaSubrayado ? p.subrayado : p.negrita && mayusculas;
      if (esTitulo) {
        seccionActual = texto;
        bloques.push({ t: "titulo", texto });
        continue;
      }
      if (p.negrita) {
        bloques.push({ t: "subtitulo", texto });
        continue;
      }
    }

    const dato = RE_SECCION_DE_MEDIDAS.test(seccionActual) ? comoDato(texto) : null;
    if (dato) bloques.push({ t: "dato", rotulo: acentuarMayusculas(dato.rotulo), valor: acentuarMayusculas(dato.valor) });
    else bloques.push({ t: "vineta", texto });
  }

  // Números de parte y código de barras: la plantilla de UniMac los pone
  // sueltos arriba de todo, antes del primer título («-24130-381000»,
  // «4635520891500»). No son descripción — no se los puede leer— y al cliente
  // le aparecían como dos viñetas sin explicación al abrir la ficha.
  const primerTitulo = bloques.findIndex((b) => b.t === "titulo");
  if (primerTitulo > 0) {
    for (let i = primerTitulo - 1; i >= 0; i--) {
      const b = bloques[i];
      if (b.t === "vineta" && /^[\d\s.,\-/]+$/.test(b.texto)) bloques.splice(i, 1);
    }
  }

  // ---------- imágenes ----------
  //
  // Se recorre el XML entero, no párrafo por párrafo: las fichas que vienen de
  // un .doc convertido guardan las fotos como formas VML dentro de cuadros de
  // texto, y el párrafo que las contiene se cierra antes de tiempo al leerlo
  // con expresiones regulares (las 45 fichas convertidas salían sin ninguna
  // imagen). Lo que importa igual es el ORDEN en el documento, y eso se
  // conserva recorriendo el archivo de principio a fin.
  const vistos = new Set();
  const imagenes = [];
  const reImagen = /<a:blip[^>]*r:embed="([^"]+)"|<v:imagedata[^>]*r:id="([^"]+)"[^>]*>/g;
  let mi;
  while ((mi = reImagen.exec(xml)) !== null) {
    const rId = mi[1] ?? mi[2];
    const destino = rels.get(rId);
    if (!destino || papeleria.has(destino)) continue;

    const tabla = tablaDe(mi.index);
    if (tabla && tabla.clase === "condiciones") continue;

    // Medida a la que Word la muestra: DrawingML la declara en EMU justo
    // antes; VML, en puntos dentro del style de la forma que la envuelve.
    const antes = xml.slice(Math.max(0, mi.index - 2500), mi.index);
    let anchoMm = null;
    let altoMm = null;
    const extent = [...antes.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].pop();
    if (extent) {
      anchoMm = Math.round((Number(extent[1]) / EMU_POR_MM) * 10) / 10;
      altoMm = Math.round((Number(extent[2]) / EMU_POR_MM) * 10) / 10;
    } else {
      const estilo = [...antes.matchAll(/style="([^"]*)"/g)].pop();
      const w = estilo?.[1].match(/width:\s*([\d.]+)pt/);
      const h = estilo?.[1].match(/height:\s*([\d.]+)pt/);
      if (w) anchoMm = Math.round((Number(w[1]) / 2.8346) * 10) / 10;
      if (h) altoMm = Math.round((Number(h[1]) / 2.8346) * 10) / 10;
    }

    // EL RECORTE QUE HIZO LESLY EN EL WORD. Word no guarda la imagen recortada:
    // guarda el archivo entero y un rectángulo (`a:srcRect`, en cienmilésimas)
    // que dice qué parte se ve. Extraer el archivo tal cual traía de vuelta lo
    // que ella había escondido — en la CALE160, dos franjas rojas del catálogo
    // y el logo pegado al equipo (reportado por Darwin el 27-08). Se respeta el
    // recorte: lo que va a la cotización es lo que se ve en la ficha.
    let recorte = null;
    if (mi[1]) {
      // DrawingML: <a:srcRect l="" t="" r="" b=""/> en cienmilésimas.
      const despues = xml.slice(mi.index, mi.index + 1200);
      const src = despues.match(/<a:srcRect([^>]*)\/>/);
      const pedazo = (atributo) => {
        const m = src?.[1].match(new RegExp(`${atributo}="(-?\\d+)"`));
        return m ? Number(m[1]) / 100000 : 0;
      };
      if (src && src[1].trim()) recorte = { l: pedazo("l"), t: pedazo("t"), r: pedazo("r"), b: pedazo("b") };
    } else {
      // VML —las 45 fichas que vienen de un .doc—: cropleft/croptop/… en el
      // propio <v:imagedata>, en unidades «f» (fracciones de 65536) o en
      // decimal. Sin esto, la CAL1835 devolvía la foto entera del rodillo donde
      // la ficha muestra SOLO el logo GMP recortado de una esquina.
      const trozo = mi[0];
      const lado = (atributo) => {
        const m = trozo.match(new RegExp(`crop${atributo}="([\\d.]+)(f?)"`));
        if (!m) return 0;
        return m[2] === "f" ? Number(m[1]) / 65536 : Number(m[1]);
      };
      const l = lado("left");
      const t = lado("top");
      const r = lado("right");
      const b = lado("bottom");
      if (l || t || r || b) recorte = { l, t, r, b };
    }

    const clave = `${destino}·${anchoMm}·${altoMm}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const originales = zip.get(`word/${destino}`) ?? zip.get(destino);
    if (!originales) continue;
    // Los metarchivos EMF no los abre canvas: se dejan enteros y el paso 6 los
    // convierte con GDI+ (ninguno de los dos que hay viene recortado).
    const esEmf = /.emf$/i.test(destino);
    const datos = recorte && !esEmf ? await aplicarRecorte(originales, recorte) : originales;
    imagenes.push({
      entrada: destino,
      anchoMm,
      altoMm,
      recorte,
      bytes: datos.length,
      hash: createHash("sha1").update(datos).digest("hex").slice(0, 12),
      datos,
    });
  }

  return { cabecera, bloques, imagenes };
}

// ---------- recorrido ----------

const lista = JSON.parse(readFileSync(LISTA, "utf-8"));
mkdirSync(DIR_IMG, { recursive: true });

const fichas = [];
const fallidas = [];

for (const p of lista.productos) {
  if (!p.docx) {
    fallidas.push({ codigo: p.codigo, error: "sin .docx (conversión pendiente)" });
    continue;
  }
  try {
    const { cabecera, bloques, imagenes } = await extraerFicha(p.docx);
    const guardadas = imagenes.map((img, i) => {
      // Lo recortado sale en PNG; lo demás conserva su formato original.
      const ext =
        img.recorte && !/\.emf$/i.test(img.entrada)
          ? "png"
          : (img.entrada.match(/\.([a-z0-9]+)$/i) ?? [, "png"])[1].toLowerCase();
      const archivo = join(DIR_IMG, `${p.codigo}-${i + 1}.${ext}`).replace(/\\/g, "/");
      writeFileSync(archivo, img.datos);
      return { archivo, anchoMm: img.anchoMm, altoMm: img.altoMm, recorte: img.recorte, bytes: img.bytes, hash: img.hash };
    });
    fichas.push({
      codigo: p.codigo,
      equipo: p.equipo,
      marca: p.marca,
      stock: p.stock,
      ubicacion: p.ubicacion,
      precio: p.precio,
      origen: p.archivo,
      docx: p.docx,
      cabecera,
      bloques,
      imagenes: guardadas,
    });
  } catch (e) {
    fallidas.push({ codigo: p.codigo, error: String(e.message ?? e).slice(0, 140) });
  }
}

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), fichas, fallidas }, null, 2));

const conBloques = fichas.filter((f) => f.bloques.length > 0).length;
const sinImagen = fichas.filter((f) => f.imagenes.length === 0);
console.log(`Fichas leídas: ${fichas.length}  ·  con descripción: ${conBloques}  ·  fallidas: ${fallidas.length}`);
console.log(`Imágenes extraídas: ${fichas.reduce((a, f) => a + f.imagenes.length, 0)}`);
console.log(`\nSin ninguna imagen (${sinImagen.length}): ${sinImagen.map((f) => f.codigo).join(", ")}`);
const sinTexto = fichas.filter((f) => f.bloques.length === 0);
if (sinTexto.length) console.log(`Sin descripción (${sinTexto.length}): ${sinTexto.map((f) => f.codigo).join(", ")}`);
for (const f of fallidas) console.log(`  ✗ ${f.codigo}: ${f.error}`);
console.log(`\n→ ${SALIDA}`);
