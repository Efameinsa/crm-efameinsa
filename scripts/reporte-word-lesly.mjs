// Versión en Word del reporte de catálogos y fichas, para entregarle a
// Lesly (logística/marketing). El Excel que genera reporte-pendientes-lesly.mjs
// tiene el detalle completo; este documento es para LEERLO: dice qué falta,
// qué está mal y qué se necesita de ella, en el orden en que le sirve.
//
// Marca Efameinsa (manual de marca): granate #7E1210, carbón #2C2E35, gris
// #6B6B6B, tipografía Arial (decisión del usuario por legibilidad), trato de
// usted, "Efameinsa" en texto corrido. Autor: Santos Lenin Vilcachagua Ayala.
//
// Uso: node scripts/reporte-word-lesly.mjs [salida.docx]

import { readFileSync, writeFileSync } from "node:fs";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, WidthType, BorderStyle, ShadingType, PageBreak,
} from "docx";

const SALIDA = process.argv[2] ?? "V:/SANTOS/Revision de catalogos y fichas tecnicas - para Lesly.docx";
const ENTRADA = "scripts/data/cruce-definitivo-2026-08-22.json";

const GRANATE = "7E1210";
const CARBON = "2C2E35";
const GRIS = "6B6B6B";
const FUENTE = "Arial";
const FONDO_SUAVE = "F7F5F4";

const bruto = JSON.parse(readFileSync(ENTRADA, "utf-8"));
const P = bruto.productos;
const { malNombrados = [], intercambios = [], discrepanciasDeModelo = [] } = bruto;

const tieneSpec = (f) => Boolean(f.especificacion);
const tieneCat = (f) => Boolean(f.catalogos?.length);
const rev = (f, t) => f.revisar?.find((r) => r.tipo === t);
const soloNombre = (r) => r.split(/[\\/]/).pop();

/** Recorta sin partir palabras y avisa con "…" que la descripción sigue.
 *  Las descripciones del maestro son larguísimas y cortarlas a ras deja
 *  cosas como "CILINDRO IN", que en un documento para leer queda mal. */
function recortar(s, max) {
  const limpio = s.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max);
  const ultimoEspacio = corte.lastIndexOf(" ");
  return (ultimoEspacio > max * 0.6 ? corte.slice(0, ultimoEspacio) : corte).replace(/[,;:\s]+$/, "") + "…";
}

const pendientes = P.filter(
  (f) => (!tieneSpec(f) && !rev(f, "especificacion")) || (!tieneCat(f) && !rev(f, "catalogo")),
).map((f) => ({
  ...f,
  falta:
    !tieneSpec(f) && !rev(f, "especificacion") && !tieneCat(f) && !rev(f, "catalogo")
      ? "Catálogo y ficha técnica"
      : !tieneSpec(f) && !rev(f, "especificacion")
        ? "Ficha técnica"
        : "Catálogo",
}));

const porConfirmar = P.filter((f) => f.revisar?.length);

const conteoCodigos = {};
for (const f of P) conteoCodigos[f.codigo] = (conteoCodigos[f.codigo] ?? 0) + 1;
const duplicados = Object.entries(conteoCodigos).filter(([, n]) => n > 1).map(([c]) => c);

// --- piezas de formato ---------------------------------------------------

const texto = (t, o = {}) => new TextRun({ text: t, font: FUENTE, size: o.size ?? 21, color: o.color ?? "333333", bold: o.bold, italics: o.italics });
const parrafo = (t, o = {}) =>
  new Paragraph({
    children: Array.isArray(t) ? t : [texto(t, o)],
    spacing: { after: o.after ?? 140, line: 276 },

  });

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

const vineta = (t) =>
  new Paragraph({ children: [texto(t)], bullet: { level: 0 }, spacing: { after: 90, line: 276 } });

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

function tabla(encabezados, filas, anchos) {
  // encabezados = null → tabla sin franja de título (para las de dos columnas
  // tipo "etiqueta / valor", donde una franja granate vacía se ve como un
  // error de maquetación).
  const filasTabla = filas.map((f, n) =>
    new TableRow({
      children: f.map((c, i) =>
        celda(c, {
          ancho: anchos?.[i],
          fondo: n % 2 ? FONDO_SUAVE : undefined,
          etiqueta: encabezados === null && i === 0,
        }),
      ),
    }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: borde, bottom: borde, left: borde, right: borde, insideHorizontal: borde, insideVertical: borde },
    rows: encabezados
      ? [
          new TableRow({
            tableHeader: true,
            children: encabezados.map((h, i) => celda(h, { encabezado: true, ancho: anchos?.[i] })),
          }),
          ...filasTabla,
        ]
      : filasTabla,
  });
}

/** Caja de aviso: franja granate a la izquierda, como la pestaña del manual. */
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

// --- contenido -----------------------------------------------------------

const hoy = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

const cuerpo = [
  new Paragraph({
    children: [new TextRun({ text: "EFAMEINSA", font: FUENTE, size: 20, bold: true, color: GRANATE, characterSpacing: 60 })],
    spacing: { after: 40 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Revisión de catálogos y fichas técnicas", font: FUENTE, size: 40, bold: true, color: CARBON })],
    spacing: { after: 60 },
  }),
  new Paragraph({
    children: [texto("Codificación de equipos para marketing · " + hoy, { color: GRIS, size: 20 })],
    spacing: { after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GRANATE, space: 8 } },
  }),
  parrafo(" ", { after: 200 }),

  parrafo([
    texto("Estimada Lesly:", { bold: true, color: CARBON }),
  ]),
  parrafo(
    "Revisamos los " +
      P.length +
      " equipos de su archivo «Codificación de equipos para marketing» y los cruzamos contra todas las carpetas de la unidad V:, " +
      "abriendo y leyendo cada catálogo y cada ficha técnica para confirmar que realmente correspondan al equipo indicado.",
  ),
  parrafo(
    "Este documento resume qué encontramos, qué falta y qué necesitamos de su parte. El detalle completo, equipo por equipo, " +
      "está en el archivo Excel que acompaña a este informe.",
  ),

  tituloSeccion("En resumen"),
  tabla(
    ["", "Cantidad"],
    [
      ["Equipos revisados", String(P.length)],
      ["Con catálogo y ficha técnica completos", String(P.filter((f) => tieneSpec(f) && tieneCat(f)).length)],
      ["Les falta material (los necesitamos de usted)", String(pendientes.length)],
      ["Archivos guardados con el código equivocado", String(malNombrados.length)],
      ["Diferencias entre el Excel y la ficha", String(discrepanciasDeModelo.length)],
      ["Códigos usados para dos equipos distintos", String(duplicados.length)],
      ["Pendientes de confirmar cuál ficha corresponde", String(porConfirmar.length)],
    ],
    [70, 30],
  ),

  tituloSeccion("1. Material que falta"),
  parrafo(
    "Estos " + pendientes.length + " equipos no tienen catálogo o ficha técnica en ninguna carpeta de la unidad V:. " +
      "Es lo único que necesitamos que nos consiga o nos confirme si no existe.",
  ),
  tabla(
    ["Código", "Marca", "Equipo", "Qué falta"],
    pendientes.map((f) => [f.codigo, f.marca, recortar(f.equipo, 95), f.falta]),
    [11, 11, 56, 22],
  ),
];

if (intercambios.length) {
  cuerpo.push(
    tituloSeccion("2. Archivos con el código cambiado"),
    parrafo(
      "Al leer el contenido de cada ficha encontramos archivos guardados con el código de otro equipo. " +
        "Conviene corregirlo en la carpeta, porque cualquiera que busque por código va a abrir la ficha equivocada.",
    ),
  );
  for (const [a, b] of intercambios) {
    cuerpo.push(
      subtitulo(`Los códigos ${a.codigoReal} y ${b.codigoReal} están intercambiados entre sí`),
      aviso([
        `El archivo «${soloNombre(a.ruta)}»`,
        `está guardado con el código ${a.codigoEnElArchivo}, pero su contenido describe al equipo ${a.codigoReal}.`,
      ]),
      parrafo(" ", { after: 80 }),
      aviso([
        `El archivo «${soloNombre(b.ruta)}»`,
        `está guardado con el código ${b.codigoEnElArchivo}, pero su contenido describe al equipo ${b.codigoReal}.`,
      ]),
      parrafo(" ", { after: 100 }),
      parrafo(
        "Lo verificamos abriendo ambos documentos: uno indica control UNILINC TOUCH y el otro DUAL DIGITAL, " +
          "que es justo al revés de lo que dice el Excel para esos dos códigos.",
        { italics: true, color: GRIS },
      ),
    );
  }
}

if (discrepanciasDeModelo.length) {
  cuerpo.push(
    tituloSeccion("3. Diferencias entre el Excel y la ficha"),
    parrafo(
      "En estos casos el modelo que el Excel indica para el código no coincide con el de la ficha guardada con ese mismo código. " +
        "No sabemos de qué lado está el error, así que preferimos consultarlo antes de cambiar nada.",
    ),
  );
  for (const d of discrepanciasDeModelo) {
    cuerpo.push(
      subtitulo(`Código ${d.codigo}`),
      tabla(
        null,
        [
          ["El Excel indica", `Modelo ${d.modeloSegunMaestro} — ${recortar(d.equipoSegunMaestro, 90)}`],
          ["El archivo guardado", soloNombre(d.ruta)],
          ["Su contenido parece ser de", `${d.pareceSer} — ${recortar(d.equipoQueParece, 90)}`],
        ],
        [24, 76],
      ),
    );
  }
}

if (duplicados.length) {
  cuerpo.push(
    tituloSeccion("4. Códigos usados para dos equipos distintos"),
    parrafo(
      "Estos códigos aparecen dos veces en el Excel, con equipos diferentes. Mientras compartan código no es posible " +
        "saber a cuál de los dos pertenece cada ficha o cada foto: convendría darle un código propio a cada uno.",
    ),
    tabla(
      ["Código", "Equipo"],
      duplicados.flatMap((c) => P.filter((f) => f.codigo === c).map((f) => [c, recortar(f.equipo, 110)])),
      [12, 88],
    ),
    parrafo(
      "Como ejemplo, el código LAV180 se usa tanto para la lavadora rígida RX180 como para la flotante FX180, que son equipos distintos.",
      { italics: true, color: GRIS },
    ),
  );
}

if (porConfirmar.length) {
  cuerpo.push(
    tituloSeccion("5. Pendientes de confirmar"),
    parrafo(
      "Para estos equipos encontramos más de un archivo posible y las diferencias entre ellos son mínimas " +
        "(por ejemplo, la misma secadora en versión eléctrica de 220 V y de 380 V). No quisimos elegir por nuestra cuenta.",
    ),
    parrafo(
      "En la carpeta de cada uno de estos códigos, dentro de V:\\SANTOS, dejamos una subcarpeta llamada «CANDIDATOS (revisar)» " +
        "con los archivos posibles, para que se pueda decidir viéndolos.",
    ),
    tabla(
      ["Código", "Marca", "Equipo", "Archivos posibles"],
      porConfirmar.map((f) => [
        f.codigo,
        f.marca,
        recortar(f.equipo, 85),
        String(f.revisar.reduce((a, r) => a + r.candidatos.length, 0)),
      ]),
      [12, 12, 60, 16],
    ),
  );
}

cuerpo.push(
  new Paragraph({ children: [new PageBreak()] }),
  tituloSeccion("Qué necesitamos de usted"),
  vineta("El material de los " + pendientes.length + " equipos del punto 1, o su confirmación de que no existe."),
  intercambios.length
    ? vineta("Su visto bueno para corregir el nombre de los archivos del punto 2, que están guardados con el código de otro equipo.")
    : null,
  discrepanciasDeModelo.length
    ? vineta("Confirmar, en los casos del punto 3, si el error está en el Excel o en la ficha.")
    : null,
  duplicados.length ? vineta("Asignar un código propio a cada uno de los equipos del punto 4.") : null,
  porConfirmar.length ? vineta("Revisar las carpetas «CANDIDATOS (revisar)» del punto 5 cuando tenga un momento.") : null,

  tituloSeccion("Anexo · Catálogos que no se pudieron leer"),
  parrafo(
    "Los siguientes catálogos son imágenes escaneadas, sin texto: se pueden ver y usar normalmente, pero no es posible " +
      "buscar dentro de ellos ni extraer sus características de forma automática. Si existiera el archivo original " +
      "del proveedor, nos sería de mucha utilidad.",
  ),
  ...[
    "Catálogos ADC (AD35i-AD120i, AD50V-AD758V)",
    "Catálogos SAILSTAR (GZZ-GDZ, SS_17_23, lavadora centrífuga SS_40, GP 50-70, lavadora al seco)",
    "Catálogo de coches de lavandería Efamein 2026",
    "Catálogo general LG 2022",
  ].map(vineta),

  parrafo(" ", { after: 300 }),
  new Paragraph({
    children: [texto("Elaborado por Santos Lenin Vilcachagua Ayala", { color: GRIS, size: 19 })],
    spacing: { before: 200, after: 0 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: "D8D2D0", space: 10 } },
  }),
  new Paragraph({
    children: [texto("Efameinsa · " + hoy, { color: GRIS, size: 19 })],
  }),
);

const doc = new Document({
  creator: "Santos Lenin Vilcachagua Ayala",
  title: "Revisión de catálogos y fichas técnicas",
  description: "Estado de catálogos y fichas técnicas de la codificación de equipos para marketing",
  styles: { default: { document: { run: { font: FUENTE, size: 21, color: "333333" } } } },
  sections: [
    {
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
      children: cuerpo.filter(Boolean),
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(SALIDA, buffer);
console.log(`Escrito: ${SALIDA} (${(buffer.length / 1024).toFixed(0)} KB)`);
console.log(
  `Secciones: ${pendientes.length} pendientes · ${intercambios.length} intercambios · ${discrepanciasDeModelo.length} discrepancias · ${duplicados.length} duplicados · ${porConfirmar.length} por confirmar`,
);
