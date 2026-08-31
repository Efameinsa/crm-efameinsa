// ============================================================
// Las imágenes de una ficha técnica .docx: cuáles son y cómo se ven
// ============================================================
// Vive acá, y no dentro del paso 3 del pipeline, porque hay DOS programas que
// la necesitan: `scripts/fichas-v-03-extraer.mjs`, que lee el catálogo entero
// desde `V:`, y la pantalla de Lesly, donde ella arrastra el Word y el sistema
// tiene que sacarle la foto sola. Es la misma razón por la que el lector del
// texto (`ficha-docx.mjs`) tampoco está duplicado: copiar la lectura
// «mejorándola» fue lo que se llevó puestas las medidas de la SECA758.
//
// DEVUELVE LOS BYTES SIN RECORTAR, con el recorte declarado aparte. El recorte
// se aplica donde haya con qué dibujar: en los scripts, con `canvas`; en la
// pantalla, con el canvas del navegador. La biblioteca no elige por ellos.

const EMU_POR_MM = 36000;

/**
 * Las imágenes de la ficha, en el ORDEN en que aparecen en el documento.
 *
 * Se recorre el XML entero, no párrafo por párrafo: las fichas que vienen de un
 * .doc convertido guardan las fotos como formas VML dentro de cuadros de texto,
 * y el párrafo que las contiene se cierra antes de tiempo al leerlo con
 * expresiones regulares (las 45 fichas convertidas salían sin ninguna imagen).
 * Lo que importa igual es el ORDEN en el documento, y eso se conserva
 * recorriendo el archivo de principio a fin.
 *
 * @param zip      el .docx ya abierto (`leerZip`)
 * @param xml      `word/document.xml`
 * @param tablaDe  de `leerFichaDeXml`: dice en qué tabla cae una posición, para
 *                 dejar fuera las imágenes de la tabla de condiciones
 */
export function imagenesDeDocx(zip, xml, tablaDe) {
  // rId → archivo dentro del zip
  const rels = new Map();
  for (const m of textoDe(zip, "word/_rels/document.xml.rels").matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    rels.set(m[1], m[2].replace(/^\.\.\//, "").replace(/^\//, ""));
  }

  // Imágenes de encabezado y pie = papelería de Efameinsa, no van a la ficha.
  const papeleria = new Set();
  for (const nombre of zip.keys()) {
    if (!/^word\/_rels\/(header|footer)\d*\.xml\.rels$/.test(nombre)) continue;
    for (const m of textoDe(zip, nombre).matchAll(/Target="([^"]+)"/g)) {
      papeleria.add(m[1].replace(/^\.\.\//, "").replace(/^\//, ""));
    }
  }

  const vistos = new Set();
  const imagenes = [];
  const reImagen = /<a:blip[^>]*r:embed="([^"]+)"|<v:imagedata[^>]*r:id="([^"]+)"[^>]*>/g;
  let mi;
  while ((mi = reImagen.exec(xml)) !== null) {
    const rId = mi[1] ?? mi[2];
    const destino = rels.get(rId);
    if (!destino || papeleria.has(destino)) continue;

    const tabla = tablaDe?.(mi.index);
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
    imagenes.push({ entrada: destino, anchoMm, altoMm, recorte, originales });
  }

  return imagenes;
}

/**
 * Cuál de las imágenes es la FOTO DEL EQUIPO: la que Word muestra más grande.
 *
 * Es el mismo criterio del paso 4 del pipeline y sale de mirar las 122 fichas:
 * la plantilla es siempre la misma —logo arriba, equipo al medio, panel
 * abajo—, así que el tamaño con el que está insertada las separa sin
 * ambigüedad. Lo que va ANTES de la foto del equipo es el logo de la marca; lo
 * que va DESPUÉS, la vista del panel.
 */
export function fotoDelEquipo(imagenes) {
  if (imagenes.length === 0) return null;
  const area = (i) => (i.anchoMm ?? 0) * (i.altoMm ?? 0);
  let elegida = imagenes[0];
  for (const i of imagenes) if (area(i) > area(elegida)) elegida = i;
  return elegida;
}

function textoDe(zip, nombre) {
  const b = zip.get(nombre);
  return b ? b.toString("utf8") : "";
}
