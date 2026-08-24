// Guion de la capacitación del CRM a comerciales y Central (24-08-2026).
//
// Sale de la reunión del gerente con Darwin de esa misma mañana: el eje es
// "registren debidamente la información", y todo lo demás cuelga de ahí. A eso
// se le suman los datos reales del sistema —los que hacen creíble el pedido— y
// los cambios que entraron en producción esta misma mañana.
//
// Marca Efameinsa: granate #7E1210, carbón #2C2E35, gris #6B6B6B, Arial,
// trato de usted. Autor: Santos Lenin Vilcachagua Ayala.
//
// Uso: node scripts/guion-capacitacion.mjs [salida.docx]

import { writeFileSync } from "node:fs";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, WidthType, BorderStyle, ShadingType, AlignmentType,
} from "docx";

const SALIDA = process.argv[2] ?? "C:/Users/diseno/Downloads/Guion capacitacion CRM - 24-08-2026.docx";

const GRANATE = "7E1210";
const CARBON = "2C2E35";
const GRIS = "6B6B6B";
const AMBAR = "8A5A00";
const FUENTE = "Arial";
const FONDO_SUAVE = "F7F5F4";
const FONDO_ALERTA = "FBF3E7";

const sinBordes = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
};

const p = (texto, o = {}) =>
  new Paragraph({
    spacing: { after: o.after ?? 120, line: 276 },
    alignment: o.alineacion,
    indent: o.sangria ? { left: 340 } : undefined,
    children: [new TextRun({ text: texto, font: FUENTE, size: o.size ?? 21, color: o.color ?? CARBON, bold: o.bold, italics: o.italics })],
  });

/** Párrafo con trozos en negrita: mezcla ["texto normal", ["negrita"], "más"] */
const pm = (trozos, o = {}) =>
  new Paragraph({
    spacing: { after: o.after ?? 120, line: 276 },
    indent: o.sangria ? { left: 340 } : undefined,
    children: trozos.map((t) =>
      Array.isArray(t)
        ? new TextRun({ text: t[0], font: FUENTE, size: o.size ?? 21, color: o.color ?? CARBON, bold: true })
        : new TextRun({ text: t, font: FUENTE, size: o.size ?? 21, color: o.color ?? CARBON }),
    ),
  });

const h1 = (texto) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text: texto, font: FUENTE, size: 30, bold: true, color: GRANATE })],
  });

const h2 = (texto) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 110 },
    children: [new TextRun({ text: texto, font: FUENTE, size: 24, bold: true, color: CARBON })],
  });

const vineta = (texto, o = {}) =>
  new Paragraph({
    bullet: { level: o.nivel ?? 0 },
    spacing: { after: 70, line: 264 },
    children: [new TextRun({ text: texto, font: FUENTE, size: 21, color: o.color ?? CARBON, bold: o.bold })],
  });

const numerada = (texto) =>
  new Paragraph({
    numbering: { reference: "pasos", level: 0 },
    spacing: { after: 70, line: 264 },
    children: [new TextRun({ text: texto, font: FUENTE, size: 21, color: CARBON })],
  });

/** Recuadro para lo que no se puede pasar por alto. */
const recuadro = (titulo, lineas, tono = "suave") =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      ...sinBordes,
      left: { style: BorderStyle.SINGLE, size: 18, color: tono === "alerta" ? AMBAR : GRANATE },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: tono === "alerta" ? FONDO_ALERTA : FONDO_SUAVE },
            margins: { top: 160, bottom: 160, left: 220, right: 220 },
            children: [
              new Paragraph({
                spacing: { after: 90 },
                children: [new TextRun({ text: titulo, font: FUENTE, size: 21, bold: true, color: tono === "alerta" ? AMBAR : GRANATE })],
              }),
              ...lineas.map((l) => p(l, { after: 60 })),
            ],
          }),
        ],
      }),
    ],
  });

const celda = (texto, o = {}) =>
  new TableCell({
    shading: o.encabezado ? { type: ShadingType.CLEAR, fill: GRANATE } : undefined,
    margins: { top: 90, bottom: 90, left: 140, right: 140 },
    width: o.ancho ? { size: o.ancho, type: WidthType.PERCENTAGE } : undefined,
    children: [
      new Paragraph({
        spacing: { after: 0 },
        children: [new TextRun({ text: texto, font: FUENTE, size: 19, bold: o.encabezado || o.bold, color: o.encabezado ? "FFFFFF" : CARBON })],
      }),
    ],
  });

const tabla = (encabezados, filas, anchos) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "D8D3D1" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "D8D3D1" },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E8E4E2" },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({ children: encabezados.map((e, i) => celda(e, { encabezado: true, ancho: anchos?.[i] })) }),
      ...filas.map((f) => new TableRow({ children: f.map((c, i) => celda(c, { ancho: anchos?.[i] })) })),
    ],
  });

const espacio = () => p("", { after: 60 });

// ────────────────────────────────────────────────────────────────────────────

const doc = new Document({
  creator: "Santos Lenin Vilcachagua Ayala",
  title: "Guion de capacitación · CRM Efameinsa",
  description: "Capacitación al área comercial y a Central — 24 de agosto de 2026",
  numbering: {
    config: [{
      reference: "pasos",
      levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 400, hanging: 240 } } } }],
    }],
  },
  styles: { default: { document: { run: { font: FUENTE, size: 21, color: CARBON } } } },
  sections: [{
    properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
    children: [
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: "CORPORACIÓN EFAMEINSA INGENIERÍA S.A.", font: FUENTE, size: 18, bold: true, color: GRANATE })],
      }),
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: "Guion de capacitación · CRM", font: FUENTE, size: 40, bold: true, color: CARBON })],
      }),
      p("Área comercial y Central · Lunes 24 de agosto de 2026, 9:30 – 10:30 a. m.", { color: GRIS, size: 20, after: 300 }),

      recuadro("El mensaje que tiene que quedar (pedido del gerente)", [
        "«No hay procedimientos nuevos.» La forma de trabajar es la misma que ya conocen; lo que cambia es la herramienta.",
        "«Para explotar la herramienta, necesitamos que se registre toda la información debidamente.» Ese es el eje de toda la reunión: si el registro no es serio, nada de lo demás funciona.",
      ]),
      espacio(),

      // ── 1
      h1("1. Por qué cambiamos, en un minuto"),
      p("Abrir reconociendo su trabajo, no señalando errores. El Excel no falló por las personas: falló porque un Excel no puede exigir que un dato esté bien escrito."),
      espacio(),
      pm([["Lo que encontramos al pasar el histórico al CRM"], " — decirlo con números, no con adjetivos:"]),
      espacio(),
      tabla(
        ["Lo que apareció", "Cuánto"],
        [
          ["Clientes duplicados, con el nombre escrito distinto", "396 grupos con nombre idéntico; 645 filas sobrantes"],
          ["Clientes sin RUC ni DNI registrado", "3.791 cuentas"],
          ["Cuentas que hubo que limpiar y fusionar a mano", "de 14.354 a 14.137"],
          ["Fechas de seguimiento imposibles (año 1900)", "cientos, por celdas mal tipeadas"],
          ["Presupuestos del archivo sin número registrado", "más de 1.000 de 5.559"],
        ],
        [58, 42],
      ),
      espacio(),
      pm([
        "Cada una de esas filas costó horas de trabajo de recuperación. ",
        ["Ese trabajo no se puede repetir cada año"],
        ": de ahora en adelante el dato nace bien o no sirve.",
      ]),
      espacio(),

      // ── 2
      h1("2. La cadena: su registro mueve todo lo demás"),
      p("Este es el concepto que el gerente pidió que entiendan antes que cualquier botón."),
      espacio(),
      tabla(
        ["Si usted registra…", "…entonces"],
        [
          ["La gestión y en qué quedó", "Su agenda del día siguiente se arma sola"],
          ["El interés y el monto estimado", "Gerencia sabe qué vale su cartera y dónde apoyarlo"],
          ["El informe de cierre", "Central puede facturar y despachar. Sin informe no hay despacho"],
          ["De dónde vino el cliente", "Marketing sabe qué campaña sirve y le trae más leads como ese"],
        ],
        [42, 58],
      ),
      espacio(),
      recuadro("La frase del gerente, textual", [
        "«Si tú no tienes información de calidad, yo no te voy a poder dar alternativas de una campaña eficiente, una campaña que realmente te ayude a vender más.»",
        "Google Ads devuelve si el lead sirvió o no. Eso se conecta con lo que ustedes registran: marcar bien un cliente como rechazado o como venta es lo que le enseña a la campaña a traer mejores contactos.",
      ]),
      espacio(),

      // ── 3
      h1("3. Qué gana usted (dígalo antes de pedir nada)"),
      pm([["La agenda ya no se arma a mano."], " Registrar la gestión con su próxima acción hace que aparezca sola en Mi agenda y en Mi día."]),
      pm([["Esa media hora diaria son tres o cuatro llamadas más."], " Palabras del gerente: la agenda «nace automáticamente con un clic»."]),
      pm([["El reporte diario sale en PDF"], " con un botón, en vez de armarse en Excel al final del día."]),
      pm([["La cotización se arma sobre el membrete real"], ", con los equipos y precios del catálogo, y queda archivada en el cliente."]),
      pm([["Toda la historia del cliente está en una sola pantalla"], ": lo que se le cotizó antes, lo que compró, a qué precio y quién lo atendió."]),
      espacio(),

      // ── 4
      h1("4. Recorrido en pantalla (el orden del menú es el orden del día)"),
      p("Hacerlo en vivo con una cuenta real, no con diapositivas. El menú está ordenado a propósito, de lo más urgente a lo de consulta.", { color: GRIS }),
      espacio(),
      tabla(
        ["Menú", "Para qué", "Cuándo se usa"],
        [
          ["Mi día", "Lo vencido, lo de hoy y lo recién asignado", "Al abrir la sesión, cada mañana"],
          ["Mi agenda", "El mes completo; se arrastra para reprogramar", "Para planificar la semana"],
          ["Mis oportunidades", "Toda su cartera de trabajo, en tabla o en tablero", "Es lo que hay que revisar a diario"],
          ["Mi gestión", "Sus números: embudo, cierres, metas", "Para saber cómo va"],
          ["Mi cartera", "Ficha de cada cliente", "Consulta puntual"],
        ],
        [22, 44, 34],
      ),
      espacio(),
      h2("Dónde se registra una gestión (el corazón de todo)"),
      p("En la oportunidad, el formulario son tres preguntas y toma menos de un minuto:"),
      numerada("¿Qué hiciste? — llamada, WhatsApp, correo, visita, showroom."),
      numerada("¿Qué pasó? — la nota de lo que conversaron, y en qué quedó (no contestó, pidió cotización, evaluando, quiere comprar…)."),
      numerada("¿Qué sigue? — la próxima acción, con fecha y hora. Esto es lo que viaja a la agenda."),
      espacio(),
      recuadro("Insistir en esto tres veces si hace falta", [
        "Si no completa el paso 3, esa oportunidad desaparece de su día. No hay recordatorio que la rescate: el sistema solo sabe lo que usted le dijo.",
        "El interés (alto potencial / medio / bajo) y el monto estimado no son decorado. Son los campos con los que gerencia decide dónde poner el esfuerzo de marketing.",
      ]),
      espacio(),

      // ── 5
      h1("5. Central: su parte de la cadena"),
      pm([["Todo contacto entrante sigue entrando por Central"], " y se asigna desde ahí. Eso no cambia."]),
      pm([["El informe de cierre llega a la bandeja de Central"], " cuando el comercial cierra una venta. Es el documento que habilita facturar y despachar."]),
      pm([["La numeración de informes arranca hoy en el N.º 001-2026."], " Cada informe emitido gasta un número y queda registrado."]),
      pm([["Si un lead lleva demasiado tiempo sin asignar"], ", el sistema avisa por correo. No hay que vigilarlo a mano."]),
      espacio(),

      // ── 6
      h1("6. Reglas que el sistema sí exige"),
      tabla(
        ["Regla", "Por qué"],
        [
          ["Rechazar una oportunidad pide el motivo, obligatorio", "Sin motivo no se aprende nada del cliente perdido"],
          ["Una cotización emitida no se edita ni se borra", "Es un documento con número; si hay error, se emite otra"],
          ["Un precio por debajo del piso requiere aprobación de gerencia", "El sistema lo marca solo y avisa"],
          ["Reasignar la cartera de un cliente lo decide gerencia", "El comercial no se reasigna clientes entre sí"],
        ],
        [52, 48],
      ),
      espacio(),

      // ── 7
      h1("7. Lo que NO hay que hacer"),
      vineta("No volver al Excel. Desde el viernes el CRM tiene la última versión de su cartera y el Excel ya no se sincroniza. Si alguien sigue anotando allí, esa información se pierde.", { bold: true }),
      vineta("No dejar la gestión “para registrarla después”. Se olvida, y lo que no está registrado no existe para Central ni para gerencia."),
      vineta("No inventar datos para salir del paso. Un cliente sin RUC se deja sin RUC; un dato inventado es peor que un dato faltante."),
      vineta("No compartir credenciales entre comerciales. Cada gestión queda firmada con el usuario que la registró."),
      espacio(),

      // ── 8
      h1("8. Cierre de la reunión"),
      h2("Credenciales"),
      pm([
        "Entregar a cada persona su usuario y contraseña ",
        ["y hacer firmar el cargo de recepción"],
        " en el momento, aunque el formato sea provisional (indicación expresa del gerente). Correos: ",
        ["central@efameinsa.com"],
        " y ",
        ["comercial1@ a comercial5@efameinsa.com"],
        ".",
      ]),
      espacio(),
      h2("Grupo de WhatsApp"),
      pm([
        "Crear el grupo al terminar, con los comerciales, Central, ",
        ["Lesly y el gerente"],
        ". Ahí se reportan incidencias con captura de pantalla. Lo que se acuerde ahí se regulariza después por correo.",
      ]),
      espacio(),
      h2("Seguimiento de la primera semana"),
      p("Revisar con cada comercial, al cierre del día, que la gestión del día esté registrada. La capacitación teórica se refuerza sobre el uso real: es más efectivo corregir sobre su propia pantalla que explicar en abstracto."),
      espacio(),

      recuadro("Para Santos — no mencionar en la reunión", [
        "El gerente definió esta semana como piloto interno, pero pidió expresamente NO llamarlo piloto delante del equipo: «como piloto mejor ni hables… que trabajen a conciencia». Si se presenta como prueba, no lo van a tomar en serio.",
        "Tampoco anunciar el cambio de dominio. Capacitar con la dirección actual; cuando crm.efameinsa.com esté habilitado, la anterior seguirá funcionando y el cambio será transparente.",
      ], "alerta"),
      espacio(),

      // ── 9
      h1("9. Pendientes que conviene tener presentes"),
      p("No son parte del guion, pero pueden salir como pregunta durante la reunión.", { color: GRIS }),
      espacio(),
      tabla(
        ["Pendiente", "Estado"],
        [
          ["Catálogos comerciales de los equipos", "Las fichas técnicas están cargadas; los catálogos aún no se suben"],
          ["7 equipos sin código cargado (5 LG, 1 Primus, 1 Girbau)", "No se encuentran buscando por código; sí por marca o modelo. Pendiente con Lesly"],
          ["Equipos del mismo modelo con distinto panel (caso CT60)", "Hay que confirmar que ficha, descripción y precio estén alineados por código"],
          ["Dominio crm.efameinsa.com", "En trámite con el proveedor de hosting; no afecta el uso"],
          ["Enviar correos y WhatsApp desde el CRM", "Solicitado por gerencia como mejora futura, no está en esta versión"],
        ],
        [46, 54],
      ),
      espacio(),
      espacio(),
      new Paragraph({
        spacing: { before: 300 },
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: "D8D3D1" } },
        children: [new TextRun({ text: "Santos Lenin Vilcachagua Ayala", font: FUENTE, size: 20, bold: true, color: CARBON })],
      }),
      p("Corporación Efameinsa Ingeniería S.A. · 24 de agosto de 2026", { color: GRIS, size: 18 }),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(SALIDA, buffer);
console.log(`✓ ${SALIDA}`);
