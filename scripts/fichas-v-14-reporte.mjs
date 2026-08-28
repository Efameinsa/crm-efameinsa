// ============================================================
// CRM EFAMEINSA · Paso 14 · Reporte de la carga de fichas
// ============================================================
// Del `auditoria.json` del paso 13 salen dos entregables:
//
//   · Word  — para leerlo: qué se cargó, qué falta y qué hay que corregir,
//             en el orden en que le sirve a Lesly. Marca Efameinsa.
//   · Excel — el detalle completo, una fila por código y una hoja por tema,
//             para trabajarlo y marcar lo corregido.
//
// Uso: node scripts/fichas-v-14-reporte.mjs [carpeta-de-salida]

import XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, WidthType, BorderStyle, ShadingType, PageBreak,
} from "docx";

const SALIDA = process.argv[2] ?? "docs";
const { resumen, filas, compartidas, retirados, movimientos = [] } = JSON.parse(
  readFileSync("scripts/data/fichas-v/auditoria.json", "utf-8"),
);
const movs = (que) => movimientos.filter((m) => m.que === que);

const GRANATE = "7E1210";
const CARBON = "2C2E35";
const GRIS = "6B6B6B";
const FUENTE = "Arial";
const FONDO_SUAVE = "F7F5F4";

const cargadas = filas.filter((f) => f.estado === "Cargada con su ficha");
const faltantes = filas.filter((f) => f.estado !== "Cargada con su ficha");
const con = (t) => cargadas.filter((f) => f.pendientes.some((x) => x.startsWith(t)));
const sinLogo = cargadas.filter((f) => f.logo === "NO");
const sinPanel = cargadas.filter((f) => f.panel === "no");
const bajaRes = con("Foto del equipo de baja").sort((a, b) => a.pppOriginal - b.pppOriginal);
const cortas = con("Descripción muy corta").sort((a, b) => a.lineas - b.lineas);
const marcas = con("El maestro dice marca");
const cabecera = con("La tabla de cabecera");
const deMas = cargadas.filter((f) => f.pendientes.some((x) => x.includes("imagen(es) de más")));
const recuperables = faltantes.filter((f) => f.pendientes.some((x) => /hay hoy|empiezan con ese código|El maestro apunta/.test(x)));
const perdidas = faltantes.filter((f) => !recuperables.includes(f));
// Lo que cambió en el catálogo con el maestro v2 (28-08).
const retiradosDelMaestro = filas.filter((f) => f.enSistema === "retirado");
// Los que están EN EL CATÁLOGO sin ficha: los coches por modelo también están
// sin ficha, pero salieron del catálogo y ya se cuentan como retiro.
const activosSinFicha = faltantes.filter((f) => f.enSistema !== "retirado");
const recuperablesActivos = () => recuperables;
const perdidasActivas = () => perdidas;
const falta = (f, k) => (f.pendientes.find((x) => x.startsWith("La tabla de cabecera"))?.includes(k) ? "falta" : "");
/** Los archivos que HOY están en V: para un código que no se pudo cargar. */
const pista = (f) => f.pendientes.map((x) => /(?:hay hoy|empiezan con ese código): (.+)$/.exec(x)?.[1]).find(Boolean) ?? "";
/** Qué pasó, sin repetir la pista: esa va en su propia columna. */
const quePasa = (f) => f.pendientes[0].replace(/;? ?(?:en la carpeta hay hoy|En V: hay archivos que empiezan con ese código): .+$/, "");

/** Por qué un producto salió del catálogo hoy. */
const porQueSale = (sku) =>
  ["CO401", "CO402", "CO408"].includes(sku)
    ? "Su equipo ahora está codificado por color (CO401A, CO402A/B/G, CO408A/B)"
    : faltantes.some((f) => f.codigo === sku)
      ? "Está en el maestro pero sin ficha: al sistema solo suben los que tienen su Word"
      : "El maestro v2 ya no lo lista; el mismo equipo figura con otro código";

// =========================================================================
// EXCEL
// =========================================================================

const libro = XLSX.utils.book_new();
const hoja = (nombre, filas, anchos) => {
  const h = XLSX.utils.json_to_sheet(filas);
  if (anchos) h["!cols"] = anchos.map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(libro, h, nombre);
};

const hojaResumen = XLSX.utils.aoa_to_sheet([
  ["EFAMEINSA · Fichas técnicas cargadas al CRM"],
  ["Revisión del 28 de agosto de 2026 · fuente: V:\\Fichas tecnicas por codigo v2.xlsx"],
  [],
  ["LO QUE ENTRÓ AL SISTEMA", ""],
  ["Códigos en el maestro de Lesly", resumen.totalExcel],
  ["Cargados con su ficha (descripción + fotos del Word)", resumen.cargadas],
  ["Del maestro sin ficha: quedan FUERA del catálogo", resumen.sinFicha],
  ["Productos que el maestro ya no lista y se retiraron del sistema", resumen.retirados],
  [],
  ["LO QUE MOVIÓ LA CARGA DE HOY", ""],
  ["Productos nuevos", resumen.altasHoy ?? 0],
  ["Productos retirados", resumen.retirosHoy ?? 0],
  ["Precios actualizados con el Excel", resumen.preciosHoy ?? 0],
  [],
  [`CALIDAD DE LAS ${resumen.cargadas} FICHAS CARGADAS`, ""],
  ["Sin foto del equipo", resumen.sinFotoEquipo],
  ["Sin logo de la marca", resumen.sinLogo],
  ["Sin vista de complemento (panel o botonera)", resumen.sinPanel],
  ["Foto del equipo de baja resolución (hubo que ampliarla)", resumen.bajaResolucion],
  ["Foto que aun ampliada queda por debajo de la norma (200 ppp)", resumen.bajoNorma],
  ["Códigos que comparten la foto del equipo con otro", resumen.fotoCompartida],
  ["  ... repartidos en grupos de equipos con la misma foto", resumen.gruposCompartidos],
  ["Descripción muy corta (menos de 20 líneas; la media es 50)", resumen.descripcionCorta],
  ["Tabla de cabecera incompleta", resumen.cabeceraIncompleta],
  ["Marca del maestro distinta a la de la ficha", resumen.marcaDistinta],
  ["Fichas con imágenes de más para el formato de cotización", resumen.descartadas],
  ["Códigos sin precio en el maestro", resumen.sinPrecio],
  [],
  ["CÓMO LEER ESTE ARCHIVO", ""],
  ["Todas las fichas", "una fila por código del maestro y todo lo que se detectó"],
  ["Cambios de hoy", "altas, retiros y precios que aplicó esta carga"],
  ["Falta la ficha", `los ${resumen.sinFicha} códigos del maestro que no tienen Word`],
  ["Fotos por mejorar", "las que se imprimen con menos calidad de la debida"],
  ["Misma foto", "equipos distintos que muestran la misma imagen: confirmar"],
  ["Sin logo", "fichas donde no aparece el logo de la marca"],
  ["Descripción corta", "fichas con muy pocas características"],
  ["Marca distinta", "el maestro y la ficha no dicen lo mismo"],
  ["Cabecera incompleta", "falta capacidad, calentamiento o panel en la tabla"],
  ["Retirados del sistema", "productos que salieron del catálogo del CRM"],
]);
hojaResumen["!cols"] = [{ wch: 64 }, { wch: 60 }];
XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen");

hoja(
  "Todas las fichas",
  filas.map((f) => ({
    "CÓDIGO": f.codigo,
    "EQUIPO (maestro)": f.equipo,
    "MARCA (maestro)": f.marca,
    "MARCA (ficha)": f.marcaFicha,
    "MODELO": f.modelo,
    "ESTADO": f.estado,
    "ARCHIVO WORD": f.archivo,
    "FOTO DEL EQUIPO": f.fotoEquipo,
    "PPP ORIGINAL": f.pppOriginal,
    "LOGO": f.logo,
    "VISTA DE PANEL": f.panel,
    "LÍNEAS DE DESCRIPCIÓN": f.lineas || "",
    "MISMA FOTO QUE": f.compartidaCon,
    "PRECIO (maestro)": f.precioMaestro ?? "",
    "EN EL SISTEMA": f.enSistema,
    "QUÉ HAY QUE CORREGIR": f.pendientes.join("\n"),
  })),
  [11, 58, 15, 16, 14, 22, 42, 26, 12, 14, 14, 12, 26, 13, 13, 70],
);

hoja(
  "Cambios de hoy",
  movimientos.map((m) => ({
    "QUÉ": m.que === "alta" ? "Producto nuevo" : m.que === "retiro" ? "Retirado del catálogo" : "Precio actualizado",
    "CÓDIGO": m.sku,
    "NOMBRE EN EL CRM": m.nombre,
    "PRECIO NUEVO US$": m.precio ?? "",
    "POR QUÉ":
      m.que === "alta"
        ? "Figura en el maestro v2 con ficha y no existía en el CRM"
        : m.que === "retiro"
          ? porQueSale(m.sku)
          : "El libro más nuevo de Lesly (MODIF. UT120 26-08) trae este precio",
  })),
  [22, 12, 60, 17, 70],
);

hoja(
  "Falta la ficha",
  faltantes.map((f) => ({
    "CÓDIGO": f.codigo,
    "EQUIPO (maestro)": f.equipo,
    "MARCA": f.marca,
    "EN EL SISTEMA": f.enSistema,
    "QUÉ PASA": quePasa(f),
    "QUÉ APUNTA EL MAESTRO": f.pistaMaestro ?? "",
    "QUÉ HAY EN V: HOY": pista(f),
    "QUÉ NECESITAMOS": f.pistaMaestro || pista(f)
      ? "Unificar el código: decidir cuál de los dos queda y que la ficha se llame igual"
      : "La ficha técnica del equipo",
    "PRECIO (maestro)": f.precioMaestro ?? "",
  })),
  [11, 50, 14, 13, 46, 52, 46, 52, 13],
);

hoja(
  "Fotos por mejorar",
  bajaRes.map((f) => ({
    "CÓDIGO": f.codigo,
    "EQUIPO": f.equipo,
    "FOTO ACTUAL": f.fotoEquipo,
    "PPP AL TAMAÑO DE IMPRESIÓN": f.pppOriginal,
    "GRAVEDAD": f.pppOriginal < 100 ? "ALTA" : f.pppOriginal < 130 ? "media" : "leve",
    "QUÉ NECESITAMOS": "Foto del equipo en mejor resolución dentro de la ficha (mínimo 600 px de ancho)",
  })),
  [11, 58, 30, 26, 11, 66],
);

hoja(
  "Misma foto",
  compartidas.flatMap((g) =>
    g.map((c) => ({
      "GRUPO": g.join(" + "),
      "CÓDIGO": c,
      "EQUIPO": filas.find((f) => f.codigo === c)?.equipo ?? "",
      "QUÉ HAY QUE CONFIRMAR": "Que todos estos equipos se vean realmente igual; si no, cada ficha necesita su propia foto",
    })),
  ),
  [40, 11, 58, 70],
);

hoja(
  "Sin logo",
  sinLogo.map((f) => ({ "CÓDIGO": f.codigo, "EQUIPO": f.equipo, "MARCA": f.marca, "QUÉ NECESITAMOS": "El logo de la marca en la ficha" })),
  [11, 58, 15, 40],
);

hoja(
  "Descripción corta",
  cortas.map((f) => ({
    "CÓDIGO": f.codigo,
    "EQUIPO": f.equipo,
    "LÍNEAS": f.lineas,
    "QUÉ NECESITAMOS": "Completar las características del equipo en la ficha (la media de las fichas es 50 líneas)",
  })),
  [11, 58, 9, 66],
);

hoja(
  "Marca distinta",
  marcas.map((f) => ({
    "CÓDIGO": f.codigo,
    "EQUIPO": f.equipo,
    "MARCA (maestro)": f.marca,
    "MARCA (ficha)": f.marcaFicha,
    "QUÉ HAY QUE DECIDIR": "Cuál de las dos es la correcta; el CRM imprime la de la ficha",
  })),
  [11, 58, 16, 20, 52],
);

hoja(
  "Cabecera incompleta",
  cabecera.map((f) => ({
    "CÓDIGO": f.codigo,
    "EQUIPO": f.equipo,
    "CAPACIDAD": falta(f, "capacidad"),
    "CALENTAMIENTO": falta(f, "calentamiento"),
    "PANEL": falta(f, "panel"),
  })),
  [11, 58, 12, 15, 9],
);

hoja(
  "Retirados del sistema",
  retirados.map((r) => ({
    "CÓDIGO": r.sku,
    "NOMBRE EN EL CRM": r.nombre,
    "PRECIO QUE TENÍA": r.precio ?? "",
    "POR QUÉ": "No figura en el maestro de Lesly; queda inactivo, sin borrar, y las cotizaciones viejas lo conservan",
  })),
  [12, 40, 16, 76],
);

const rutaExcel = `${SALIDA}/Fichas tecnicas cargadas al CRM - revision 28-08.xlsx`;
XLSX.writeFile(libro, rutaExcel);

// =========================================================================
// WORD
// =========================================================================

const texto = (t, o = {}) => new TextRun({ text: t, font: FUENTE, size: o.size ?? 21, color: o.color ?? "333333", bold: o.bold, italics: o.italics });
const parrafo = (t, o = {}) =>
  new Paragraph({ children: Array.isArray(t) ? t : [texto(t, o)], spacing: { after: o.after ?? 140, line: 276 } });
const tituloSeccion = (t) =>
  new Paragraph({
    children: [new TextRun({ text: t.toUpperCase(), font: FUENTE, size: 26, bold: true, color: GRANATE })],
    spacing: { before: 380, after: 160 },
    heading: HeadingLevel.HEADING_1,
  });
const subtitulo = (t) =>
  new Paragraph({
    children: [new TextRun({ text: t, font: FUENTE, size: 22, bold: true, color: CARBON })],
    spacing: { before: 220, after: 100 },
  });
const vineta = (t) => new Paragraph({ children: [texto(t)], bullet: { level: 0 }, spacing: { after: 90, line: 276 } });

const SIN_BORDE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const borde = { style: BorderStyle.SINGLE, size: 1, color: "D8D2D0" };

function celda(contenido, { encabezado = false, ancho, fondo, etiqueta = false } = {}) {
  return new TableCell({
    width: ancho ? { size: ancho, type: WidthType.PERCENTAGE } : undefined,
    shading: encabezado
      ? { type: ShadingType.CLEAR, fill: GRANATE, color: "auto" }
      : fondo
        ? { type: ShadingType.CLEAR, fill: fondo, color: "auto" }
        : undefined,
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    borders: { top: borde, bottom: borde, left: borde, right: borde },
    children: (Array.isArray(contenido) ? contenido : [contenido]).map((linea) =>
      new Paragraph({
        children: [
          new TextRun({
            text: linea,
            font: FUENTE,
            size: 19,
            bold: encabezado || etiqueta,
            color: encabezado ? "FFFFFF" : etiqueta ? CARBON : "333333",
          }),
        ],
        spacing: { after: 0, line: 260 },
      }),
    ),
  });
}

function tabla(encabezados, filasTabla, anchos) {
  const cuerpoTabla = filasTabla.map((f, n) =>
    new TableRow({
      children: f.map((c, i) =>
        celda(c, { ancho: anchos?.[i], fondo: n % 2 ? FONDO_SUAVE : undefined, etiqueta: encabezados === null && i === 0 }),
      ),
    }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: borde, bottom: borde, left: borde, right: borde, insideHorizontal: borde, insideVertical: borde },
    rows: encabezados
      ? [new TableRow({ tableHeader: true, children: encabezados.map((h, i) => celda(h, { encabezado: true, ancho: anchos?.[i] })) }), ...cuerpoTabla]
      : cuerpoTabla,
  });
}

function aviso(lineas) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE, insideHorizontal: SIN_BORDE, insideVertical: SIN_BORDE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: GRANATE, color: "auto" },
            borders: { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE },
            children: [new Paragraph("")],
          }),
          new TableCell({
            width: { size: 99, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: FONDO_SUAVE, color: "auto" },
            margins: { top: 120, bottom: 120, left: 180, right: 140 },
            borders: { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE },
            children: lineas.map((l, i) =>
              new Paragraph({
                children: [texto(l, { bold: i === 0, color: i === 0 ? CARBON : "333333" })],
                spacing: { after: i === lineas.length - 1 ? 0 : 80, line: 270 },
              }),
            ),
          }),
        ],
      }),
    ],
  });
}

const recortar = (s, max) => {
  const limpio = String(s ?? "").replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max);
  const esp = corte.lastIndexOf(" ");
  return (esp > max * 0.6 ? corte.slice(0, esp) : corte).replace(/[,;:\s]+$/, "") + "…";
};
const enFilas = (codigos, porFila = 6) => {
  const l = [];
  for (let i = 0; i < codigos.length; i += porFila) l.push(codigos.slice(i, i + porFila).join(" · "));
  return l;
};

const hoy = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

const cuerpo = [
  new Paragraph({
    children: [new TextRun({ text: "EFAMEINSA", font: FUENTE, size: 20, bold: true, color: GRANATE, characterSpacing: 60 })],
    spacing: { after: 40 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Fichas técnicas cargadas al CRM", font: FUENTE, size: 40, bold: true, color: CARBON })],
    spacing: { after: 60 },
  }),
  new Paragraph({
    children: [texto(`Los ${resumen.totalExcel} códigos del maestro de equipos v2 · ` + hoy, { color: GRIS, size: 20 })],
    spacing: { after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GRANATE, space: 8 } },
  }),

  parrafo(
    "El CRM ya arma la cotización con la ficha técnica de cada equipo: la descripción y las fotos que salen impresas " +
      "son las de su archivo de Word, tal como están, sin cambiar ni agregar nada. Por eso todo lo que se corrija en la " +
      "ficha se ve al día siguiente en las cotizaciones que envían los comerciales.",
  ),
  parrafo(
    "Este documento informa qué entró al sistema, qué no se pudo cargar y qué conviene corregir en las fichas. " +
      "El detalle completo, código por código, va en el Excel que acompaña a este documento.",
  ),

  tituloSeccion("1 · Lo que entró al sistema"),
  tabla(
    ["", "Códigos"],
    [
      ["Códigos del maestro de equipos", String(resumen.totalExcel)],
      ["Cargados con su ficha: descripción y fotos", String(resumen.cargadas)],
      ["Del maestro sin ficha: quedan fuera del catálogo", String(resumen.sinFicha)],
      ["Retirados hoy del catálogo del CRM", String(resumen.retirosHoy ?? 0)],
    ],
    [78, 22],
  ),
  parrafo(" ", { after: 60 }),
  aviso([
    `Ninguna de las ${resumen.cargadas} fichas cargadas quedó sin foto.`,
    `Las ${resumen.cargadas} entraron con su foto del equipo, su descripción y los datos de la tabla de cabecera. ` +
      "Lo que sigue no impide cotizar: es lo que haría que las cotizaciones se vean mejor.",
  ]),

  tituloSeccion("2 · Qué cambió hoy en el catálogo"),
  parrafo(
    "El maestro v2 del 28-08 trae 10 códigos más que el del 27-08 y estrenó la hoja COCHE del libro de modificaciones. " +
      "Con él, el catálogo del CRM quedó así:",
  ),
  subtitulo(`Productos nuevos (${movs("alta").length})`),
  tabla(
    ["Código", "Nombre en el CRM", "Precio US$"],
    movs("alta").map((m) => [
      m.sku,
      recortar(m.nombre, 62),
      String(movs("precio").find((p) => p.sku === m.sku)?.precio ?? "—"),
    ]),
    [14, 66, 20],
  ),
  parrafo(" ", { after: 60 }),
  subtitulo(`Retirados del catálogo (${movs("retiro").length})`),
  parrafo(
    "No se borra nada: quedan inactivos, no aparecen al cotizar y las cotizaciones ya emitidas los conservan tal como se enviaron.",
    { after: 80 },
  ),
  tabla(
    ["Código", "Por qué"],
    movs("retiro").map((m) => [
      m.sku, porQueSale(m.sku),
    ]),
    [16, 84],
  ),
  parrafo(" ", { after: 60 }),
  subtitulo(`Precios actualizados (${movs("precio").length})`),
  parrafo(
    "Salen del libro más nuevo de Lesly, «Modificacion de precio y capacidad secadora ut120 26.08.26». El precio anterior " +
      "no se borra: queda cerrado con su fecha, para poder explicar cualquier cotización vieja.",
    { after: 80 },
  ),
  tabla(
    ["Código", "Precio US$"],
    movs("precio").map((m) => [m.sku, Number(m.precio).toLocaleString("es-PE")]),
    [50, 50],
  ),

  new Paragraph({ children: [new PageBreak()] }),
  tituloSeccion(`3 · Los ${faltantes.length} códigos que quedaron fuera del catálogo`),
  parrafo(
    "Estos códigos figuran en el maestro pero no tienen Word. Al sistema suben únicamente los que tienen ficha, así que " +
      "quedaron fuera del catálogo: un producto sin descripción ni foto no se puede cotizar. En casi todos el equipo SÍ " +
      "tiene ficha, pero guardada con otro código —el mismo equipo está codificado de dos maneras en los Excels—, y eso " +
      "es lo que hay que unificar para que entren.",
  ),
  subtitulo("El equipo existe, pero con otro código"),
  tabla(
    ["Código", "Equipo", "Qué apunta el maestro"],
    recuperablesActivos().map((f) => [
      f.codigo,
      recortar(f.equipo, 46),
      recortar(f.pistaMaestro || pista(f), 74),
    ]),
    [12, 38, 50],
  ),
  parrafo(" ", { after: 60 }),
  perdidasActivas().length ? subtitulo("No existe la ficha por ningún lado") : null,
  perdidasActivas().length
    ? tabla(
        ["Código", "Equipo", "Qué dice el maestro"],
        perdidasActivas().map((f) => [f.codigo, recortar(f.equipo, 70), recortar(quePasa(f).replace("El maestro lo marca en rojo: ", ""), 60)]),
        [12, 53, 35],
      )
    : null,

  new Paragraph({ children: [new PageBreak()] }),
  tituloSeccion("4 · Fotos que conviene reemplazar"),
  parrafo(
    `En ${resumen.bajaResolucion} fichas la foto del equipo es más chica de lo que necesita el tamaño al que se imprime. ` +
      "El sistema la amplía con enfoque para que no la agrande la impresora, pero ampliar no inventa detalle: la foto se ve " +
      "blanda. Con una imagen de al menos 600 px de ancho el problema desaparece.",
  ),
  subtitulo("Las más urgentes"),
  tabla(
    ["Código", "Equipo", "Resolución a la que se imprime"],
    bajaRes.slice(0, 12).map((f) => [f.codigo, recortar(f.equipo, 62), `${f.pppOriginal} ppp (la norma es 300)`]),
    [12, 58, 30],
  ),
  parrafo(" ", { after: 60 }),
  parrafo("El resto, en la hoja «Fotos por mejorar» del Excel:", { after: 80 }),
  ...enFilas(bajaRes.slice(12).map((f) => f.codigo), 8).map((l) => parrafo(l, { size: 19, color: GRIS })),
  resumen.bajoNorma
    ? aviso([
        "Dos fotos no llegan a la norma ni ampliadas",
        con("La foto del equipo queda por debajo").map((f) => f.codigo).join(" y ") +
          " se imprimen por debajo de los 200 ppp mínimos. Son las dos que más conviene cambiar.",
      ])
    : null,

  tituloSeccion("5 · Equipos distintos con la misma foto"),
  parrafo(
    `${resumen.fotoCompartida} códigos comparten la foto del equipo con otro, en ${resumen.gruposCompartidos} grupos. ` +
      "En muchos casos es correcto —la misma máquina en distintas capacidades o calentamientos—, pero conviene confirmarlo " +
      "grupo por grupo: si dos equipos no se ven iguales, el cliente recibe la foto de otro producto.",
  ),
  tabla(
    ["Códigos que muestran la misma foto"],
    compartidas.map((g) => [g.join("  ·  ")]),
    [100],
  ),

  new Paragraph({ children: [new PageBreak()] }),
  tituloSeccion("6 · Lo demás que se detectó"),
  subtitulo(`Sin logo de la marca (${sinLogo.length} fichas)`),
  parrafo("La cotización deja el espacio del logo vacío. No se pone el logo de otra ficha ni uno bajado de internet.", { after: 80 }),
  ...enFilas(sinLogo.map((f) => f.codigo), 8).map((l) => parrafo(l, { size: 19, color: GRIS })),

  subtitulo(`Descripción muy corta (${cortas.length} fichas)`),
  parrafo(
    "Menos de 20 líneas de características, cuando la media de las fichas es 50. La cotización sale con media página en blanco.",
    { after: 80 },
  ),
  tabla(
    ["Código", "Equipo", "Líneas"],
    cortas.map((f) => [f.codigo, recortar(f.equipo, 66), String(f.lineas)]),
    [12, 76, 12],
  ),

  subtitulo(`La marca del maestro no es la de la ficha (${marcas.length} códigos)`),
  parrafo("El CRM imprime la marca que muestra la ficha. Hay que decidir cuál de las dos es la correcta.", { after: 80 }),
  tabla(
    ["Código", "Dice el maestro", "Dice la ficha"],
    marcas.map((f) => [f.codigo, f.marca, f.marcaFicha]),
    [16, 42, 42],
  ),

  subtitulo(`Tabla de cabecera incompleta (${cabecera.length} fichas)`),
  parrafo(
    "La tabla del encabezado de la ficha alimenta los datos que el comercial ve al elegir el equipo. Falta " +
      `calentamiento en ${cabecera.filter((f) => falta(f, "calentamiento")).length} fichas, ` +
      `panel en ${cabecera.filter((f) => falta(f, "panel")).length} y ` +
      `capacidad en ${cabecera.filter((f) => falta(f, "capacidad")).length}. El detalle está en el Excel.`,
  ),

  subtitulo(`Sin vista de complemento (${sinPanel.length} fichas)`),
  parrafo(
    "El formato de cotización tiene un lugar para una segunda imagen —el panel de control o la botonera— debajo de la foto " +
      "del equipo. Estas fichas no la traen; no es un error, pero la hoja se ve más completa con ella.",
  ),

  subtitulo(`Imágenes de más (${deMas.length} fichas)`),
  parrafo(
    "En la cotización entran tres imágenes: el logo, el equipo y una vista de complemento. Estas fichas traen alguna imagen " +
      "adicional que no se usó: " + deMas.map((f) => f.codigo).join(" · ") + ".",
  ),

  subtitulo("CALE2120 y CALE2200"),
  parrafo(
    "Las dos cierran con un cartel publicitario («e²line — diseñada alrededor de usted») donde las demás fichas traen la " +
      "botonera. Se imprime porque está en la ficha: hay que decidir si se deja o se reemplaza por la vista del panel.",
  ),

  resumen.sinPrecio
    ? subtitulo(`Sin precio en el maestro (${resumen.sinPrecio} códigos)`)
    : null,
  resumen.sinPrecio
    ? parrafo(filas.filter((f) => f.precioMaestro == null).map((f) => f.codigo).join(" · ") + ".")
    : null,

  new Paragraph({ children: [new PageBreak()] }),
  tituloSeccion("7 · Todo lo que está fuera del catálogo"),
  parrafo(
    "Se aplicó la regla acordada: en el sistema quedan únicamente los productos que figuran en el maestro de equipos. " +
      `Estos ${resumen.retirados} no figuran en el maestro v2 y están inactivos —no se borró nada—: no aparecen al ` +
      "cotizar, y las cotizaciones ya emitidas los conservan tal como se enviaron. Los tres coches por modelo " +
      "(CO401, CO402, CO408) salieron por la decisión del punto 2 y no están en esta lista.",
  ),
  tabla(
    ["Código", "Nombre que tenía en el CRM"],
    retirados.map((r) => [r.sku, recortar(r.nombre, 60)]),
    [22, 78],
  ),

  tituloSeccion("8 · Qué necesitamos de usted"),
  vineta(
    `Unificar los ${recuperablesActivos().length} códigos del punto 3: el mismo equipo está codificado de dos maneras en los ` +
      "Excels, y el CRM se queda con el que usted ponga en el maestro. Hoy esos equipos están sin descripción ni foto.",
  ),
  perdidasActivas().length
    ? vineta(`Las fichas de ${perdidasActivas().map((f) => f.codigo).join(" y ")}, que no existen por ningún lado.`)
    : null,
  vineta(`Reemplazar por una imagen más grande las fotos de las ${resumen.bajaResolucion} fichas del punto 4, empezando por las 12 de la tabla.`),
  vineta(`Confirmar los ${resumen.gruposCompartidos} grupos de equipos que muestran la misma foto.`),
  vineta(`Agregar el logo de la marca en las ${sinLogo.length} fichas que no lo traen.`),
  vineta(`Completar las características de las ${cortas.length} fichas con descripción corta.`),
  vineta(`Decidir la marca correcta en los ${marcas.length} códigos donde el maestro y la ficha no coinciden.`),
  vineta("Decidir si el cartel publicitario de CALE2120 y CALE2200 se deja o se reemplaza por la botonera."),

  parrafo(" ", { after: 300 }),
  new Paragraph({
    children: [texto("Elaborado por Santos Lenin Vilcachagua Ayala", { color: GRIS, size: 19 })],
    spacing: { before: 200, after: 0 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: "D8D2D0", space: 10 } },
  }),
  new Paragraph({ children: [texto("Efameinsa · " + hoy, { color: GRIS, size: 19 })] }),
];

const doc = new Document({
  creator: "Santos Lenin Vilcachagua Ayala",
  title: "Fichas técnicas cargadas al CRM",
  description: "Estado de la carga de las fichas técnicas al CRM y correcciones pendientes",
  styles: { default: { document: { run: { font: FUENTE, size: 21, color: "333333" } } } },
  sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children: cuerpo.filter(Boolean) }],
});

const rutaWord = `${SALIDA}/Fichas tecnicas cargadas al CRM - revision 28-08.docx`;
writeFileSync(rutaWord, await Packer.toBuffer(doc));

console.log(`Word:  ${rutaWord}`);
console.log(`Excel: ${rutaExcel}`);
console.log(
  `${resumen.cargadas} cargadas · ${faltantes.length} sin cargar (${recuperables.length} recuperables) · ` +
    `${resumen.bajaResolucion} fotos por mejorar · ${resumen.gruposCompartidos} grupos con la misma foto · ` +
    `${sinLogo.length} sin logo · ${cortas.length} descripciones cortas · ${retirados.length} retirados`,
);
