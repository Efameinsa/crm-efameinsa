import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { IDENTIDAD_SERIE, PUNTOS_IMPORTANTES, NOTAS, IGV, ENTREGA_POR_DEFECTO } from "./series";
import { clasificarFicha } from "@/lib/ficha-tecnica";
import { encajarEnCaja } from "./medir-imagen";
import { ajustarEspecificaciones } from "./ajustar-especificaciones";

// Sin partir palabras con guion. @react-pdf corta por sílabas cuando no entra
// la palabra entera, y en la cabecera de la ficha salía "Panel computa-rizado"
// y "Controles Au-tomático". Reportado el 24-08: «no debe tener "-"; si falta
// espacio, la palabra entera va abajo». Devolver la palabra sin trocear es la
// forma que da @react-pdf de apagarlo: pasa entera a la línea siguiente.
Font.registerHyphenationCallback((palabra) => [palabra]);

// Estructura calcada de las cotizaciones reales de ambas razones sociales
// (Descargas/PROYECTO CRM EFAMEINSA/modelos de cotizacion): carta formal con
// membrete por serie, bloque del cliente, tabla de ítems con desglose de IGV,
// ficha técnica por equipo, condiciones, cuentas bancarias (OPEN),
// "Importante:"/"Nota:" y firma del comercial.
// Helvetica = fuente base de @react-pdf sin incrustar TTF (equivalente a Arial).

const CARBON = "#2C2E35";
const GRIS = "#6B6B6B";
const BORDE = "#B9B4B2";
const FILA_GRIS = "#EDEAE9";

/* ── Norma de maquetación de la ficha de producto ────────────────────────────
   `docs/14-estandar-ficha-cotizacion.md`. Los tres juegos de reglas que
   entregó Darwin el 27-08 (lavadoras y secadoras, coches, prensa de planchado)
   son la misma norma con tres juegos de columnas; acá viven sus números.

   El ancho útil de la hoja es exactamente 170 mm: A4 (210) menos 20 mm de
   margen a cada lado. Esos 20 mm no son arbitrarios — el membrete está
   construido a esa distancia, y el borde izquierdo de la tabla tiene que
   coincidir con el logo o la desalineación se ve al imprimir. */
const ANCHO_TABLA = 170;
const COLUMNA_IMAGENES = 60;
const COLUMNA_DESCRIPCION = 110;
const PADDING_CELDA = 1.9;
const GRIS_ENCABEZADO = "#767171";
const BORDE_FICHA = "#1A1A1A";

/** Cajas de las tres imágenes de la ficha, en mm (ancho × alto máximo).
 *  La imagen se escala hasta tocar el primer lado que llegue al límite: por eso
 *  el logo UNIMAC sale de 27 × 12.3 y el SIDI MONDIAL de 20.4 × 14, y los dos
 *  son correctos. Ver `encajarEnCaja`. */
const CAJA_LOGO = { ancho: 27, alto: 14 };
const CAJA_PRODUCTO = { ancho: 54, alto: 96 };
const CAJA_PANEL = { ancho: 35, alto: 32 };
/** Separación entre una imagen y la siguiente dentro de la columna. */
const AIRE_ENTRE_BLOQUES = 8;

/** Juegos de columnas de especificaciones (suman 170 mm exactos). */
const COLUMNAS_EQUIPO_6 = [18, 22, 27, 32, 33, 38];
const COLUMNAS_EQUIPO_4 = [41, 31, 51, 47];
const COLUMNAS_COCHE = [25, 29, 29, 87];

/**
 * Reparto para un juego de columnas que no es ninguno de los tres previstos
 * (un equipo al que le falta el calentamiento, por ejemplo). La norma lo deja
 * escrito: se conserva la suma de 170 mm, se reparte en proporción al rótulo
 * más largo de cada columna y ninguna baja de 18 mm.
 */
function repartirColumnas(rotulos: string[]): number[] {
  const MINIMO = 18;
  const pesos = rotulos.map((r) => Math.max(r.length, 1));
  const fijas = new Array(rotulos.length).fill(false);
  const anchos = new Array(rotulos.length).fill(0);

  for (;;) {
    const disponible = ANCHO_TABLA - anchos.reduce((a, b, i) => a + (fijas[i] ? b : 0), 0);
    const pesoLibre = pesos.reduce((a, p, i) => a + (fijas[i] ? 0 : p), 0);
    let seFijoAlguna = false;
    for (let i = 0; i < rotulos.length; i++) {
      if (fijas[i]) continue;
      anchos[i] = (pesos[i] / pesoLibre) * disponible;
      if (anchos[i] < MINIMO) {
        anchos[i] = MINIMO;
        fijas[i] = true;
        seFijoAlguna = true;
      }
    }
    if (!seFijoAlguna) break;
  }
  // El redondeo no puede robarle milímetros al total: lo que sobre o falte se
  // le devuelve a la columna más ancha, que es donde menos se nota.
  return ajustarASuma(anchos);
}

/**
 * Alto aproximado de la descripción, en milímetros.
 *
 * Hace falta para decidir si el bloque de imágenes se puede centrar en
 * vertical. @react-pdf no sabe partir una celda con el contenido centrado: al
 * centrar una ficha larga, la descripción entera se iba a la página siguiente y
 * la primera quedaba con la foto sola (visto el 27-08 en la RX180). Así que se
 * centra solo cuando la ficha entra en una página, que es justo el caso en el
 * que se notaba el problema —la foto arriba y media celda vacía debajo—.
 *
 * La estimación es a ojo de buen cubero pero por lo alto: 110 mm de ancho a
 * 9 pt dan unos 62 caracteres por línea, y cada línea ocupa 4.1 mm.
 */
function altoEstimadoDescripcion(bloques: BloqueFicha[]): number {
  const ANCHO_CARACTERES = 62;
  const ALTO_LINEA = 4.1;
  let mm = 0;
  for (const b of bloques) {
    if (b.t === "titulo") mm += 9.5;
    else if (b.t === "subtitulo") mm += 8.5;
    else if (b.t === "dato") mm += ALTO_LINEA + 1;
    else mm += Math.max(1, Math.ceil(b.texto.length / ANCHO_CARACTERES)) * ALTO_LINEA + 1;
  }
  return mm;
}

/** Alto libre de la fila del cuerpo en la primera página de la ficha. */
const ALTO_FILA_CUERPO = 268 - (29.4 + 10.5 + 9.5 + 9.5) - 2 * PADDING_CELDA;

/** Ancho de cada rótulo conocido en su juego de columnas completo. */
const ANCHO_CANONICO: Record<string, number> = {
  Marca: 18,
  Modelo: 22,
  Capacidad: 27,
  Calentamiento: 32,
  "Panel computarizado": 33,
  "Controles Automático": 38,
  Volumen: 29,
  "Stock / Colores": 87,
  Color: 29,
};

/** Redondea a un decimal sin que el total deje de ser 170 mm exactos. */
function ajustarASuma(anchos: number[]): number[] {
  const redondeados = anchos.map((a) => Math.round(a * 10) / 10);
  const masAncha = redondeados.indexOf(Math.max(...redondeados));
  redondeados[masAncha] += Math.round((ANCHO_TABLA - redondeados.reduce((a, b) => a + b, 0)) * 10) / 10;
  return redondeados;
}

/**
 * Anchos de la fila de especificaciones.
 *
 * Los tres juegos del estándar salen tal cual. Para una combinación que no está
 * prevista —una lavadora sin calentamiento cargado, por ejemplo— se estiran los
 * anchos canónicos de cada columna hasta volver a sumar 170: así la ficha
 * conserva las proporciones de la norma en vez de repartir por largo de rótulo,
 * que le daba 54 mm a «Controles Automático» y 25 a «Capacidad». El reparto por
 * rótulo queda para las columnas que no son ninguna de las conocidas.
 */
function anchosEspecificaciones(rotulos: string[], esCoche: boolean): number[] {
  if (esCoche && rotulos.length === 4) return COLUMNAS_COCHE;
  if (rotulos.length === 6) return COLUMNAS_EQUIPO_6;
  if (rotulos.length === 4 && rotulos[2] === "Calentamiento") return COLUMNAS_EQUIPO_4;
  if (rotulos.every((r) => ANCHO_CANONICO[r])) {
    const base = rotulos.map((r) => ANCHO_CANONICO[r]);
    const factor = ANCHO_TABLA / base.reduce((a, b) => a + b, 0);
    return ajustarASuma(base.map((b) => b * factor));
  }
  return repartirColumnas(rotulos);
}

/**
 * Un renglón de la descripción, con el papel que cumple en la ficha original.
 *
 *   titulo    — rótulo subrayado que abre una sección
 *   subtitulo — rótulo en negrita de adentro (TAMBOR, PUERTA…)
 *   vineta    — un ítem de la lista
 *   dato      — «Largo : 1100 mm», que se maqueta en dos columnas
 */
export type BloqueFicha =
  | { t: "titulo"; texto: string }
  | { t: "subtitulo"; texto: string }
  | { t: "vineta"; texto: string }
  | { t: "dato"; rotulo: string; valor: string };

export interface SeccionFicha {
  /** "LAVADORA", "SECADORA". Null en un equipo de una sola máquina. */
  titulo: string | null;
  caracteristicas: string[];
  /** Rótulo real de la ficha ("AUTOMATIZACIÓN, SEGURIDAD Y CONTROL" en
   *  Alliance/UniMac); si falta, se imprime "CARACTERÍSTICAS". */
  caracteristicasTitulo: string | null;
  /**
   * Bloque "DISEÑO DE CONSTRUCCIÓN" de la ficha original (TAMBOR, PUERTA,
   * PANELES…) — se imprime aparte de CARACTERÍSTICAS cuando la ficha lo trae
   * separado. Ausente en la mayoría de productos todavía sin reprocesar.
   */
  disenoConstruccion: string[];
  dimensiones: string[];
  /** Rótulo real de la ficha ("ESPECIFICACIONES TÉCNICAS" en la plantilla
   *  Alliance/UniMac); si falta, se usa el de la plantilla LG/GMP. */
  dimensionesTitulo: string | null;
  medidas: string[];
  /** Rótulo real de la ficha ("DIMENSIONES GENERALES" en Alliance/UniMac). */
  medidasTitulo: string | null;
  /**
   * Orden real de los 4 bloques en la ficha en papel — no es fijo entre
   * plantillas: la de UT120/UT170 abre con "AUTOMATIZACIÓN…" y la de la
   * LAV040 abre con "DISEÑO DE CONSTRUCCIÓN" (reportado 26-08, con la ficha
   * de la LAV040 al lado). Si falta, se usa el orden de siempre.
   */
  ordenSecciones: ("caracteristicas" | "disenoConstruccion" | "dimensiones" | "medidas")[] | null;
}

export interface ItemPdf {
  nombre: string;
  marca: string;
  modelo: string;
  capacidad: string | null;
  /** «Apilable» / «No apilable», solo en los LG que lo declaran. */
  montaje?: string | null;
  categoria: string | null;
  calentamiento: string | null; // solo secadoras a gas
  panel: string | null; // "Digital-Multifunción"
  controles: string | null; // "220V/60Hz/1Ph"
  /**
   * Colores en los que existe el equipo (coches de transporte, principalmente).
   * Sale de `ficha.colores`, sincronizado desde el maestro2 (columna EQUIPO,
   * "COLOR: AZUL/WHITE/GREY…") — reportado 26-08 con la CO402: el dato ya
   * estaba en la ficha (descripcion_maestro) pero nunca se mostraba en la
   * cotización.
   */
  colores: string[];
  /**
   * El color que se eligió para ESTE cliente (`cotizacion_items.color`,
   * migración 0088). Cuando existe, la ficha dice «Color: Blanco» en vez de
   * listar los disponibles, y la foto es la de ese color.
   */
  color: string | null;
  caracteristicas: string[];
  caracteristicasTitulo: string | null;
  disenoConstruccion: string[];
  dimensiones: string[]; // "Volumen del tambor: 207 litros", …
  dimensionesTitulo: string | null;
  medidas: string[]; // "Ancho: 686 mm", …
  medidasTitulo: string | null;
  ordenSecciones: ("caracteristicas" | "disenoConstruccion" | "dimensiones" | "medidas")[] | null;
  /**
   * Equipos que son DOS máquinas en una: las torres lavadora-secadora traen en
   * su ficha un bloque para cada una. Cuando existe, se imprime así —"I.
   * LAVADORA" y "II. SECADORA", cada una con lo suyo— igual que el documento en
   * papel. Aplanarlas se leía como si todo fuera de la lavadora, que fue el
   * reporte del área comercial del 24-08.
   */
  secciones?: SeccionFicha[];
  /**
   * La descripción LEÍDA DE LA FICHA TAL COMO ESTÁ: una lista ordenada de
   * bloques con su tipo, en el mismo orden en que aparecen en el Word de Lesly
   * (`scripts/fichas-v-03-extraer.mjs`).
   *
   * Manda sobre los cuatro cajones de arriba —características, diseño,
   * especificaciones, medidas—, que reordenaban la ficha y perdían todo lo que
   * no encajara en ellos. Pedido de Darwin el 27-08: «reconoce sus títulos,
   * subtítulos y cada ítem con su viñeta, con su misma estructura, y ponlo
   * fielmente en la cotización».
   */
  bloques?: BloqueFicha[];
  fotoBuffer: Buffer | null;
  /** Logo del fabricante (UniMac…), junto a la foto — por producto, no por
   *  marca: la foto de un equipo puede traer el logo ya impreso encima, y
   *  agregarlo de nuevo lo duplica (visto en la 1SECU1701, 26-08). Null
   *  salvo que alguien haya confirmado que hace falta para ese producto. */
  logoMarcaBuffer: Buffer | null;
  /** Foto del panel de control (ej. UniLinc Touch), compartida entre todos
   *  los equipos que usan el mismo panel — null cuando no hay archivo
   *  cargado para ese panel todavía (26-08). */
  panelImagenBuffer: Buffer | null;
  cantidad: number;
  precio_unitario: number;
}

export interface CotizacionPdfProps {
  logoBuffer: Buffer;
  serie: "EFAMEINSA" | "OPEN";
  /** "5-26" (correlativo-año corto, como los modelos). NULL en un borrador:
   *  el número se asigna al enviar la cotización (migración 0064). */
  numeroDocumento: string | null;
  fecha: string; // "14 de agosto de 2026"
  cliente: {
    razon_social: string;
    tipo_doc: string;
    num_doc: string | null;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
    atencion: string | null;
  };
  items: ItemPdf[];
  moneda: string;
  condiciones: string | null;
  vigenciaDias: number;
  /** Cláusula de entrega, punto 1 de "Importante". NULL = la de por defecto
   *  (en nuestras instalaciones). Se elige por cotización desde el 24-08. */
  entregaLugar: string | null;
  /* ── Las cuatro condiciones comerciales (migración 0094) ──────────────────
     Se guardaban desde el 27-08 y NO se imprimían: la tabla que las llevaba al
     pie de cada ficha se había quitado ese mismo día por repetir el precio del
     resumen, y quedaron esperando dónde ponerlas. Darwin lo resolvió el 28-08
     —«en las cotizaciones que se generan en pdf no aparecen estas cositas»—:
     van en las condiciones de la última página, cada una en su renglón
     rotulado. Es donde el estándar decía que tenían que estar (docs/14 §
     "Tres cosas se apartan de la norma").

     Cada una es independiente: la que venga vacía no imprime su renglón, que
     es lo que pide el estándar para un dato todavía sin acordar. Las
     cotizaciones anteriores al 27-08 no tienen ninguna y su bloque sale solo
     con el texto libre, como siempre. */
  tiempoEntrega: string | null;
  garantia: string | null;
  formaPago: string | null;
  saldo: string | null;
  firma: {
    nombre: string;
    cargo: string | null;
    telefono: string | null;
    celular: string | null;
    email: string | null;
  };
}

function crearEstilos(acento: string) {
  return StyleSheet.create({
    page: {
      // 29.4 mm hasta el borde superior de la tabla, 20 mm de margen lateral y
      // nada por debajo de los 268 mm (297 − 29). Son las tres medidas duras
      // del estándar: el borde de la tabla cae sobre el logo del membrete y el
      // colchón inferior es el mismo que el superior, que es lo que da simetría
      // a la hoja impresa.
      paddingTop: 83.4,
      paddingBottom: 82.2,
      paddingHorizontal: 56.7,
      fontSize: 10,
      fontFamily: "Helvetica",
      color: CARBON,
      lineHeight: 1.45,
    },

    /* Membrete y pie (fijos en todas las páginas).
       Se dibujan con el logo en alta resolución (2345 px de ancho) y texto
       vectorial, replicando la papelería oficial. Se probó con la papelería
       escaneada y se descartó: al ser una imagen se veía borrosa al ampliar
       y, sobre todo, su contenido venía pegado a la izquierda con relleno a
       la derecha, así que el pie ocupaba media hoja y la línea quedaba corta.
       Dibujado sale nítido a cualquier zoom y ocupa el ancho real. */
    membrete: { position: "absolute", top: 26, left: 56.7, right: 56.7 },
    membreteFila: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    logo: { width: 150 },
    logoBloque: { flexDirection: "column" },
    wordmark: { fontSize: 15, fontFamily: "Helvetica-Bold", color: acento },
    membreteRazon: { fontSize: 7.5, color: CARBON, marginTop: 2 },
    membreteSub: { fontSize: 8, color: GRIS, marginTop: 2 },
    membreteLinea: { borderBottomWidth: 1.2, borderBottomColor: acento, marginTop: 5 },

    pie: { position: "absolute", bottom: 24, left: 56.7, right: 56.7 },
    pieWeb: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: acento, letterSpacing: 0.2 },
    // La línea va DEBAJO de la web y encima de la dirección, como el papel.
    pieLinea: { borderBottomWidth: 0.8, borderBottomColor: BORDE, marginTop: 2, marginBottom: 4 },
    pieTexto: { fontSize: 8, color: CARBON, lineHeight: 1.35 },

    /* Encabezado de la carta */
    titulo: {
      textAlign: "center",
      fontSize: 12,
      fontFamily: "Helvetica-Bold",
      textDecoration: "underline",
      marginBottom: 16,
    },
    fecha: { marginBottom: 14 },
    clienteBloque: { marginBottom: 10 },
    negrita: { fontFamily: "Helvetica-Bold" },
    atencion: { fontFamily: "Helvetica-Bold", marginBottom: 10 },
    parrafo: { textAlign: "justify", marginBottom: 14 },
    /* Un párrafo que sigue pegado al de abajo: el texto libre de condiciones
       cuando debajo va la línea de la garantía, para que se lean como un solo
       bloque y no como dos secciones. */
    parrafoJunto: { textAlign: "justify", marginBottom: 6 },
    /* Los renglones de lo acordado (entrega, garantía, pago, saldo): juntos
       entre sí —son una sola lista, no cuatro párrafos— y separados de lo que
       sigue igual que un párrafo. */
    condicionesLista: { marginBottom: 14 },
    condicionLinea: { marginBottom: 2 },

    /* Tabla resumen */
    resumenTitulo: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 6 },
    tabla: { borderWidth: 0.8, borderColor: CARBON },
    thFila: { flexDirection: "row", backgroundColor: CARBON, color: "#FFFFFF" },
    th: { fontSize: 8.5, fontFamily: "Helvetica-Bold", paddingVertical: 5, paddingHorizontal: 5, textAlign: "center" },
    tdFila: { flexDirection: "row", borderTopWidth: 0.8, borderTopColor: CARBON },
    td: { fontSize: 9, paddingVertical: 5, paddingHorizontal: 5 },
    cItem: { width: "8%", textAlign: "center" },
    cDesc: { width: "46%" },
    cCant: { width: "10%", textAlign: "center" },
    cPrecio: { width: "18%", textAlign: "right" },
    cSub: { width: "18%", textAlign: "right" },
    totalFila: { flexDirection: "row", borderTopWidth: 0.8, borderTopColor: CARBON },
    totalEtiqueta: { width: "82%", fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "right", paddingVertical: 5, paddingHorizontal: 5 },
    totalValor: { width: "18%", fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "right", paddingVertical: 5, paddingHorizontal: 5 },
    totalDestacado: { backgroundColor: FILA_GRIS },

    /* ── Ficha por ítem — norma de maquetación ─────────────────────────────
       Todas las medidas salen de docs/14-estandar-ficha-cotizacion.md, que a
       su vez se midió sobre las fichas en papel. Van en milímetros a propósito:
       es un documento para imprimir, y con porcentajes el ancho de la tabla
       cambiaba con el margen de la hoja. No cambiar ningún número de acá sin
       volver a correr `node scripts/auditar-ficha-cotizacion.mjs`. */
    fichaTabla: { width: `${ANCHO_TABLA}mm`, borderWidth: 0.5, borderColor: BORDE_FICHA },

    filaTitulo: { minHeight: "10.5mm", justifyContent: "center", paddingLeft: 8 },
    textoTitulo: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#000000" },

    filaEspec: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: BORDE_FICHA },
    celdaEspec: { minHeight: "9.5mm", justifyContent: "center", alignItems: "center", paddingHorizontal: 2 },
    bordeIzquierdo: { borderLeftWidth: 0.5, borderLeftColor: BORDE_FICHA },
    // Interlineado corto a propósito: «Panel computarizado» y «Controles
    // Automático» ocupan dos líneas —es el comportamiento esperado, no un
    // error— y con el interlineado por defecto la fila crecía de 9.5 a 10.4 mm
    // y empujaba hacia abajo toda la ficha.
    textoEncabezado: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF", textAlign: "center", lineHeight: 1.15 },
    textoValor: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#000000", textAlign: "center", lineHeight: 1.15 },

    filaCuerpo: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: BORDE_FICHA },
    celdaImagenes: {
      width: `${COLUMNA_IMAGENES}mm`,
      paddingTop: `${PADDING_CELDA}mm`,
      paddingBottom: `${PADDING_CELDA}mm`,
      paddingHorizontal: `${PADDING_CELDA}mm`,
      alignItems: "center",
    },
    celdaDescripcion: {
      width: `${COLUMNA_DESCRIPCION}mm`,
      paddingTop: `${PADDING_CELDA}mm`,
      paddingBottom: `${PADDING_CELDA}mm`,
      paddingHorizontal: `${PADDING_CELDA}mm`,
      borderLeftWidth: 0.5,
      borderLeftColor: BORDE_FICHA,
    },

    // Rótulo de máquina dentro de una torre ("I. LAVADORA"): un escalón por
    // encima del título de sección, como en el impreso.
    maquinaTitulo: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 4, color: "#000000" },
    seccionTitulo: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      textDecoration: "underline",
      lineHeight: 1.3,
      marginBottom: 6,
      color: "#000000",
    },
    // Subtítulo dentro de una sección (TAMBOR, PUERTA, PROGRAMADOR DUAL
    // DIGITAL…): negrita y SIN sangría — va al ras del título de sección, no a
    // la altura de las viñetas. Medido en la ficha de la UT055.
    subtitulo: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 4, color: "#000000" },
    vineta: { flexDirection: "row", paddingLeft: "6.35mm", marginTop: 1.5, marginBottom: 1.5 },
    vinetaPunto: { width: "6.35mm", fontSize: 9, color: "#000000" },
    vinetaTexto: { flex: 1, fontSize: 9, lineHeight: 1.28, textAlign: "justify", color: "#000000" },
    // Listas de «dato : valor» (dimensiones y medidas): tabla invisible de dos
    // columnas con los dos puntos alineados en vertical. El estándar lo exige
    // explícitamente —«prohibido alinear con espacios o tabulaciones»— porque
    // con espacios la columna se descuadra en cuanto cambia una palabra.
    datoRotulo: { width: "42.8mm", fontSize: 9, lineHeight: 1.28, color: "#000000" },
    datoValor: { flex: 1, fontSize: 9, lineHeight: 1.28, color: "#000000" },

    /* Secciones finales */
    seccionSubrayada: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      textDecoration: "underline",
      marginBottom: 8,
    },
    validez: {
      textAlign: "center",
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      textDecoration: "underline",
      marginTop: 18,
      marginBottom: 14,
    },
    listaNumerada: { flexDirection: "row", marginBottom: 3 },
    listaNumero: { width: 18 },
    listaTexto: { flex: 1, textAlign: "justify" },
    notaTexto: { flex: 1, fontSize: 8.5, textAlign: "justify", color: GRIS },

    /* Cuentas bancarias (OPEN) */
    cuentasTitulo: { textAlign: "center", fontSize: 11, fontFamily: "Helvetica-Bold", textDecoration: "underline", marginTop: 18, marginBottom: 10 },
    bancoTh: { fontSize: 8.5, fontFamily: "Helvetica-Bold", paddingVertical: 4, paddingHorizontal: 5, backgroundColor: FILA_GRIS, textAlign: "center" },
    bancoTd: { fontSize: 8.5, paddingVertical: 4, paddingHorizontal: 5 },
    bBanco: { width: "18%" },
    bMoneda: { width: "16%" },
    bCorriente: { width: "30%" },
    bCci: { width: "36%" },

    /* Firma */
    cierre: { marginTop: 20 },
    firmaBloque: { marginTop: 26, flexDirection: "row", gap: 14, alignItems: "flex-start" },
    firmaLogo: { width: 110 },
    firmaWordmark: { fontSize: 11, fontFamily: "Helvetica-Bold" },
    firmaDatos: { fontSize: 9 },
  });
}

function formatoMonto(v: number): string {
  return v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Parte «Largo: 43 5/16" (1100 mm)» en rótulo y valor para la tabla invisible
 * de dos columnas de dimensiones y medidas. Devuelve null cuando la línea no
 * tiene esa forma —pasa en fichas viejas— y entonces sale como viñeta normal.
 */
function partirDato(linea: string): [string, string] | null {
  const i = linea.indexOf(":");
  if (i <= 0 || i === linea.length - 1) return null;
  return [linea.slice(0, i).trim(), linea.slice(i + 1).trim()];
}

const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function CotizacionPdf({
  logoBuffer,
  serie,
  numeroDocumento,
  fecha,
  cliente,
  items,
  moneda,
  condiciones,
  vigenciaDias,
  entregaLugar,
  tiempoEntrega,
  garantia,
  formaPago,
  saldo,
  firma,
}: CotizacionPdfProps) {
  const identidad = IDENTIDAD_SERIE[serie];
  const estilos = crearEstilos(identidad.acento);

  // El orden es el de la tabla del estándar (docs/14 § 3), que es el orden en
  // el que se negocia: cuándo llega, cuánto la cubro, cómo se paga y qué queda
  // pendiente. Lo que no se acordó no ocupa un renglón vacío en el documento.
  const condicionesAcordadas = (
    [
      ["Tiempo de entrega", tiempoEntrega],
      ["Garantía", garantia],
      ["Forma de pago", formaPago],
      ["Saldo", saldo],
    ] as [string, string | null][]
  ).filter((c): c is [string, string] => Boolean(c[1]?.trim()));

  const subtotal = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  const igv = subtotal * IGV;
  const total = subtotal + igv;
  const simbolo = moneda === "USD" ? "US$" : "S/";

  // Membrete calcado del papel oficial: logo a la izquierda con la razón
  // social debajo, el rubro a la derecha, y la línea de la marca cruzando el
  // ancho completo.
  const membrete = (
    <View style={estilos.membrete} fixed>
      <View style={estilos.membreteFila}>
        {identidad.usaLogo ? (
          <View style={estilos.logoBloque}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML */}
            <Image src={logoBuffer} style={estilos.logo} />
            <Text style={estilos.membreteRazon}>{identidad.nombreLegal}</Text>
          </View>
        ) : (
          <View style={estilos.logoBloque}>
            <Text style={estilos.wordmark}>{identidad.nombreLegal}</Text>
            <Text style={estilos.membreteSub}>{identidad.subtitulo}</Text>
          </View>
        )}
        {identidad.usaLogo && (
          // Ancho holgado y 7.5 pt para que el rubro entre en UNA línea, como
          // en el papel: con menos espacio Helvetica lo partía en "Equipos
          // Indus-/triales." y quedaba feo.
          <Text style={[estilos.membreteSub, { width: 330, textAlign: "right", fontSize: 7.5 }]}>
            {identidad.subtitulo}
          </Text>
        )}
      </View>
      <View style={estilos.membreteLinea} />
    </View>
  );

  // Pie: la web en granate, la línea debajo cruzando toda la hoja, y los
  // datos de contacto abajo — el mismo orden que el papel impreso.
  const pie = (
    <View style={estilos.pie} fixed>
      {serie === "EFAMEINSA" && <Text style={estilos.pieWeb}>{identidad.pie[0]}</Text>}
      <View style={estilos.pieLinea} />
      {identidad.pie.slice(serie === "EFAMEINSA" ? 1 : 0).map((linea, i) => (
        <Text key={i} style={estilos.pieTexto}>
          {linea}
        </Text>
      ))}
    </View>
  );

  return (
    <Document>
      <Page size="A4" style={estilos.page}>
        {membrete}
        {pie}

        {/* Sin número = borrador. Se dice con todas las letras para que no
            haya forma de confundir una impresión de trabajo con el documento
            que se le mandó al cliente (migración 0064). */}
        <Text style={estilos.titulo}>
          {numeroDocumento ? `COTIZACION N° ${numeroDocumento}` : "COTIZACION — BORRADOR SIN NUMERAR"}
        </Text>
        <Text style={estilos.fecha}>Lima, {fecha}</Text>

        <View style={estilos.clienteBloque}>
          <Text>Señores:</Text>
          <Text style={estilos.negrita}>{cliente.razon_social}</Text>
          {cliente.tipo_doc !== "SIN_DOC" && cliente.num_doc && (
            <Text>
              {cliente.tipo_doc}: {cliente.num_doc}
            </Text>
          )}
          {cliente.direccion && <Text>{cliente.direccion}</Text>}
          {cliente.telefono && (
            <Text>
              <Text style={estilos.negrita}>Teléfono: </Text>
              {cliente.telefono}
            </Text>
          )}
          {cliente.email && (
            <Text>
              <Text style={estilos.negrita}>Correo: </Text>
              {cliente.email}
            </Text>
          )}
        </View>

        {cliente.atencion && <Text style={estilos.atencion}>Atención: {cliente.atencion}</Text>}

        <Text style={estilos.parrafo}>
          Por medio de la presente nos es grato hacer llegar nuestros saludos y a la vez presentar
          la siguiente propuesta técnica económica.
        </Text>

        {/* ── Resumen económico ── */}
        <Text style={estilos.resumenTitulo}>RESUMEN:</Text>
        <View style={estilos.tabla}>
          <View style={estilos.thFila}>
            <Text style={[estilos.th, estilos.cItem]}>ÍTEM</Text>
            <Text style={[estilos.th, estilos.cDesc, { textAlign: "left" }]}>DESCRIPCIÓN</Text>
            <Text style={[estilos.th, estilos.cCant]}>CANT.</Text>
            <Text style={[estilos.th, estilos.cPrecio]}>P. UNITARIO {simbolo}</Text>
            <Text style={[estilos.th, estilos.cSub]}>SUBTOTAL {simbolo}</Text>
          </View>
          {items.map((item, i) => (
            <View key={i} style={estilos.tdFila}>
              <Text style={[estilos.td, estilos.cItem]}>{ROMANOS[i] ?? i + 1}</Text>
              <Text style={[estilos.td, estilos.cDesc]}>
                {item.nombre.toUpperCase()}
                {"\n"}
                <Text style={{ color: GRIS, fontSize: 8.5 }}>
                  MARCA: {item.marca.toUpperCase()} · MODELO: {item.modelo.toUpperCase()}
                  {item.capacidad ? ` · ${item.capacidad}` : ""}
                  {/* El color elegido va también en la tabla de precios: es la
                      página que el cliente lee, y dos coches del mismo modelo
                      en colores distintos se distinguen solo por acá. */}
                  {/* En LG la misma máquina se vende apilable y no apilable:
                      sin esto, el cliente no sabe cuál le están cotizando. */}
                  {item.montaje ? ` · ${item.montaje.toUpperCase()}` : ""}
                  {item.color ? ` · COLOR: ${item.color.toUpperCase()}` : ""}
                </Text>
              </Text>
              <Text style={[estilos.td, estilos.cCant]}>{item.cantidad}</Text>
              <Text style={[estilos.td, estilos.cPrecio]}>{formatoMonto(item.precio_unitario)}</Text>
              <Text style={[estilos.td, estilos.cSub]}>{formatoMonto(item.cantidad * item.precio_unitario)}</Text>
            </View>
          ))}
          <View style={estilos.totalFila}>
            <Text style={estilos.totalEtiqueta}>SUB TOTAL {simbolo}</Text>
            <Text style={estilos.totalValor}>{formatoMonto(subtotal)}</Text>
          </View>
          <View style={estilos.totalFila}>
            <Text style={estilos.totalEtiqueta}>I.G.V. (18%) {simbolo}</Text>
            <Text style={estilos.totalValor}>{formatoMonto(igv)}</Text>
          </View>
          <View style={[estilos.totalFila, estilos.totalDestacado]}>
            <Text style={estilos.totalEtiqueta}>TOTAL INCLUIDO IGV A PAGAR {simbolo}</Text>
            <Text style={[estilos.totalValor, { color: identidad.acento }]}>{formatoMonto(total)}</Text>
          </View>
        </View>
      </Page>

      {/* ── Ficha técnica: un equipo por página, como los modelos reales.
           (Con las fichas dentro de la página de la carta, una ficha más alta
           que la página hacía que react-pdf comprimiera el texto encima de sí
           mismo — "can't wrap between pages".)

           La maquetación es la del estándar (docs/14): tabla de 170 mm con
           cuatro filas —título, encabezado gris, valores y cuerpo— y la tabla
           de condiciones comerciales cerrando el ítem. Una ficha larga continúa
           en la página siguiente con la celda de imágenes vacía, que es
           exactamente lo que hace react-pdf al partir la fila. ── */}
      {items
        .filter((item) => {
          // Un equipo escrito a mano (todavía no está en el catálogo, migración
          // 0062) no tiene nada que poner en la ficha: su página saldría en
          // blanco delante del cliente. Mejor no generarla — el equipo igual
          // aparece en la tabla de la propuesta con su precio.
          const tieneAlgoQueDecir =
            // La descripción leída del Word manda sobre los cuatro cajones
            // viejos, y desde el 27-08 la mayoría de las fichas solo trae esto.
            // Sin mirarlo, los coches por color —que no tienen panel ni
            // calentamiento— salían sin su página de ficha.
            (item.bloques?.length ?? 0) > 0 ||
            item.caracteristicas.length > 0 ||
            item.disenoConstruccion.length > 0 ||
            item.dimensiones.length > 0 ||
            item.medidas.length > 0 ||
            item.colores.length > 0 ||
            Boolean(item.panel || item.controles || item.calentamiento);
          return tieneAlgoQueDecir;
        })
        .map((item, i) => {
          /* ── Familia de ficha ──
             El estándar distingue dos. Los coches de transporte y accesorios no
             tienen logo de fábrica ni panel de control que mostrar: llevan
             cuatro columnas —la última, ancha, para los colores de stock— y una
             sola imagen centrada también en vertical. Todo lo demás es un
             EQUIPO: hasta tres imágenes alineadas arriba y el juego de columnas
             que le corresponda según lo que tenga cargado. */
          const esCoche =
            (item.categoria ?? "").toLowerCase() === "coche" ||
            (!item.panel && !item.controles && !item.calentamiento && item.colores.length > 0);

          const columnas: { titulo: string; valor: string }[] = esCoche
            ? [
                { titulo: "Marca", valor: item.marca },
                { titulo: "Modelo", valor: item.modelo },
                { titulo: "Volumen", valor: item.capacidad ?? "" },
                // El color elegido manda sobre la lista de disponibles: al
                // cliente se le está ofreciendo ESE, y la foto ya es la de ese
                // color.
                {
                  titulo: item.color ? "Color" : "Stock / Colores",
                  valor: item.color ?? item.colores.join(" / "),
                },
              ]
            : [
                { titulo: "Marca", valor: item.marca },
                { titulo: "Modelo", valor: item.modelo },
                ...(item.capacidad ? [{ titulo: "Capacidad", valor: item.capacidad }] : []),
                ...(item.calentamiento ? [{ titulo: "Calentamiento", valor: item.calentamiento }] : []),
                ...(item.panel ? [{ titulo: "Panel computarizado", valor: item.panel }] : []),
                ...(item.controles ? [{ titulo: "Controles Automático", valor: item.controles }] : []),
                ...(item.color ? [{ titulo: "Color", valor: item.color }] : []),
              ];
          /* Los anchos del estándar son el punto de partida; si a una columna no
             le entra su contenido, se lo presta la que va sobrada y cada casilla
             queda repartida en cuatro renglones como mucho, sin cortar palabras
             (28-08, mirando el modelo de la torre LG). */
          const espec = ajustarEspecificaciones(
            columnas,
            anchosEspecificaciones(
              columnas.map((c) => c.titulo),
              esCoche,
            ),
          );
          const anchosEspec = espec.anchos;


          /* Imágenes: cada una escalada hasta tocar el primer lado de su caja.
             En los coches solo va la foto del producto. */
          const imagenes: { datos: Buffer; ancho: number; alto?: number }[] = [];
          if (!esCoche && item.logoMarcaBuffer) {
            imagenes.push({
              datos: item.logoMarcaBuffer,
              ...encajarEnCaja(item.logoMarcaBuffer, CAJA_LOGO.ancho, CAJA_LOGO.alto),
            });
          }
          if (item.fotoBuffer) {
            imagenes.push({
              datos: item.fotoBuffer,
              ...encajarEnCaja(item.fotoBuffer, CAJA_PRODUCTO.ancho, CAJA_PRODUCTO.alto),
            });
          }
          if (!esCoche && item.panelImagenBuffer) {
            imagenes.push({
              datos: item.panelImagenBuffer,
              ...encajarEnCaja(item.panelImagenBuffer, CAJA_PANEL.ancho, CAJA_PANEL.alto),
            });
          }

          // ¿La ficha entra en una sola página? De eso depende cómo se centra
          // en vertical el bloque de imágenes (ver más abajo).
          //
          // Con la ficha vieja —la que todavía no se releyó del Word y no tiene
          // `bloques`— se estima igual, con sus cuatro listas: dar por hecho que
          // no cabe dejaba la foto de un coche a media celda por debajo del
          // centro (visto el 27-08 al cargar el catálogo).
          const bloquesParaMedir: BloqueFicha[] =
            item.bloques ??
            [
              ...(item.secciones ?? [
                {
                  caracteristicas: item.caracteristicas,
                  disenoConstruccion: item.disenoConstruccion,
                  dimensiones: item.dimensiones,
                  medidas: item.medidas,
                },
              ]).flatMap((s) => [...s.caracteristicas, ...s.disenoConstruccion, ...s.dimensiones, ...s.medidas]),
            ].map((texto) => ({ t: "vineta", texto }));
          const cabeEnUnaPagina = altoEstimadoDescripcion(bloquesParaMedir) <= ALTO_FILA_CUERPO;
          /** Alto del bloque de imágenes con sus separaciones, en mm. */
          const altoBloqueImagenes = imagenes.every((i) => i.alto)
            ? imagenes.reduce((suma, i) => suma + (i.alto ?? 0), 0) + AIRE_ENTRE_BLOQUES * (imagenes.length - 1)
            : null;

          // OJO CON `bloques`: hoy las 121 fichas del catálogo imprimen desde
          // ahí, no desde los cuatro cajones viejos. Sin nombrarlo acá, un
          // equipo cuya ficha es solo `bloques` Y todavía no tiene foto salía
          // con el encabezado —marca, modelo, capacidad— y SIN una sola línea
          // de descripción: la fila del cuerpo no se dibujaba. Se ve al cargar
          // un equipo nuevo, que es justo cuando todavía no tiene foto
          // (encontrado el 28-08 probando la hoja editable).
          const tieneDetalle =
            (item.bloques?.length ?? 0) > 0 ||
            item.caracteristicas.length > 0 ||
            item.disenoConstruccion.length > 0 ||
            item.dimensiones.length > 0 ||
            item.medidas.length > 0;

          return (
            <Page key={i} size="A4" style={estilos.page}>
              {membrete}
              {pie}
              <View style={estilos.fichaTabla}>
                {/* Fila 1 — título del ítem */}
                <View style={estilos.filaTitulo}>
                  <Text style={estilos.textoTitulo}>
                    ITEM {ROMANOS[i] ?? i + 1}.- {item.nombre.toUpperCase()}
                  </Text>
                </View>

                {/* Fila 2 — encabezado de especificaciones */}
                <View style={[estilos.filaEspec, { backgroundColor: GRIS_ENCABEZADO }]}>
                  {columnas.map((c, j) => (
                    <View
                      key={j}
                      style={[
                        estilos.celdaEspec,
                        { width: `${anchosEspec[j]}mm` },
                        ...(j > 0 ? [estilos.bordeIzquierdo] : []),
                      ]}
                    >
                      <Text style={[estilos.textoEncabezado, { fontSize: espec.casillas[j].tamanoTitulo }]}>
                        {espec.casillas[j].titulo}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Fila 3 — valores */}
                <View style={estilos.filaEspec}>
                  {columnas.map((c, j) => (
                    <View
                      key={j}
                      style={[
                        estilos.celdaEspec,
                        { width: `${anchosEspec[j]}mm` },
                        ...(j > 0 ? [estilos.bordeIzquierdo] : []),
                      ]}
                    >
                      <Text style={[estilos.textoValor, { fontSize: espec.casillas[j].tamanoValor }]}>
                        {espec.casillas[j].valor}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Fila 4 — imágenes (60 mm) y descripción (110 mm) */}
                {(tieneDetalle || imagenes.length > 0) && (
                  <View style={estilos.filaCuerpo}>
                    {/* A la izquierda van las imágenes y nada más; dimensiones,
                        medidas y descripción van todas a la derecha. Es como lo
                        corrigió el ing. Carlos el 24-08 mirando el PDF impreso,
                        y coincide con los modelos en papel.

                        La celda existe SIEMPRE, aunque el equipo no tenga foto:
                        es la que dibuja el divisor vertical de la fila, y el
                        estándar lo mantiene incluso en las páginas de
                        continuación, donde va vacía. */}
                    <View
                      style={[
                        estilos.celdaImagenes,
                        // El bloque de imágenes va centrado —en vertical y en
                        // horizontal— siempre que la ficha entre en una página.
                        // Lo pidió Darwin el 27-08 mirando la RX180: la foto
                        // arriba dejaba media celda vacía debajo y el equipo se
                        // veía descolgado. En una ficha que sigue en la página
                        // siguiente NO se centra: @react-pdf no sabe partir una
                        // celda centrada y se llevaba la descripción entera a la
                        // hoja de atrás, dejando la primera con la foto sola.
                        { justifyContent: cabeEnUnaPagina ? "center" : "flex-start" },
                        // En la ficha que sigue en otra página, la fila ocupa
                        // todo el alto disponible —hasta los 268 mm—, así que
                        // el centro se puede calcular: se baja el bloque la
                        // mitad del hueco que le sobra. Así la foto queda
                        // centrada también en las fichas largas.
                        ...(cabeEnUnaPagina || altoBloqueImagenes === null
                          ? []
                          : [{ paddingTop: `${Math.max(0, (ALTO_FILA_CUERPO - altoBloqueImagenes) / 2)}mm` }]),
                      ]}
                    >
                      {imagenes.map((img, k) => (
                        // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML
                        <Image
                          key={k}
                          src={img.datos}
                          style={{
                            width: `${img.ancho}mm`,
                            ...(img.alto ? { height: `${img.alto}mm` } : {}),
                            // El bloque va centrado, así que ya no hay aire
                            // superior: solo la separación entre imágenes.
                            marginTop: k === 0 ? 0 : `${AIRE_ENTRE_BLOQUES}mm`,
                          }}
                        />
                      ))}
                    </View>

                    <View style={estilos.celdaDescripcion}>
                      {/* La ficha leída tal como está: se imprime en su orden y
                          con sus propios rótulos. Cuando el producto todavía no
                          se reprocesó, se cae al armado por secciones de
                          siempre, que está debajo. */}
                      {item.bloques && item.bloques.length > 0
                        ? item.bloques.map((b, j) => {
                            if (b.t === "titulo")
                              return (
                                <Text key={j} style={[estilos.seccionTitulo, ...(j > 0 ? [{ marginTop: 10 }] : [])]}>
                                  {b.texto}
                                </Text>
                              );
                            if (b.t === "subtitulo")
                              return (
                                <Text key={j} style={estilos.subtitulo}>
                                  {b.texto}
                                </Text>
                              );
                            if (b.t === "dato")
                              return (
                                <View key={j} style={estilos.vineta}>
                                  <Text style={estilos.vinetaPunto}>•</Text>
                                  <Text style={estilos.datoRotulo}>{b.rotulo}</Text>
                                  <Text style={estilos.datoValor}>: {b.valor}</Text>
                                </View>
                              );
                            return (
                              <View key={j} style={estilos.vineta}>
                                <Text style={estilos.vinetaPunto}>•</Text>
                                <Text style={estilos.vinetaTexto}>{b.texto}</Text>
                              </View>
                            );
                          })
                        : null}
                      {/* Una torre lavadora-secadora son DOS máquinas y su ficha
                          trae un bloque para cada una. Se imprimen separadas y
                          rotuladas —"I. LAVADORA", "II. SECADORA"— como el
                          documento en papel. Un equipo normal tiene una sola
                          sección sin rótulo y sale exactamente igual que antes. */}
                      {(item.bloques && item.bloques.length > 0
                        ? []
                        : item.secciones ?? [
                        {
                          titulo: null,
                          caracteristicas: item.caracteristicas,
                          caracteristicasTitulo: item.caracteristicasTitulo,
                          disenoConstruccion: item.disenoConstruccion,
                          dimensiones: item.dimensiones,
                          dimensionesTitulo: item.dimensionesTitulo,
                          medidas: item.medidas,
                          medidasTitulo: item.medidasTitulo,
                          ordenSecciones: item.ordenSecciones,
                        },
                      ]
                      ).map((sec, s) => {
                        // Bloques con viñetas + su título. El rótulo de dos de
                        // ellos no es fijo entre plantillas (ver
                        // extraer-ficha-tecnica.mjs), así que se imprime el que
                        // trajo la ficha y solo se cae al de siempre cuando no
                        // se guardó ninguno. El ORDEN tampoco es fijo —
                        // reportado 26-08 con la LAV040, que abre con "DISEÑO DE
                        // CONSTRUCCIÓN" en vez de "AUTOMATIZACIÓN…"— así que se
                        // reordena según `ordenSecciones` cuando la ficha lo trae.
                        const porClave = {
                          caracteristicas: {
                            titulo: sec.caracteristicasTitulo ?? "CARACTERÍSTICAS",
                            lineas: sec.caracteristicas,
                            esListaDeDatos: false,
                          },
                          disenoConstruccion: {
                            titulo: "DISEÑO DE CONSTRUCCIÓN",
                            lineas: sec.disenoConstruccion,
                            esListaDeDatos: false,
                          },
                          dimensiones: {
                            titulo: sec.dimensionesTitulo ?? "DIMENSIONES DE LA MÁQUINA",
                            lineas: sec.dimensiones,
                            esListaDeDatos: true,
                          },
                          medidas: {
                            titulo: sec.medidasTitulo ?? "MEDIDAS GENERALES",
                            lineas: sec.medidas,
                            esListaDeDatos: true,
                          },
                        };
                        const orden = sec.ordenSecciones ?? ["caracteristicas", "disenoConstruccion", "dimensiones", "medidas"];
                        // Una línea vacía en la ficha imprimía una viñeta sola,
                        // colgando debajo de su subtítulo (visto en PANELES de la
                        // UT120L). No es contenido: se descarta.
                        const bloques = orden
                          .map((clave) => ({ ...porClave[clave], lineas: porClave[clave].lineas.filter((l) => l.trim()) }))
                          .filter((b) => b.lineas.length > 0);
                        return (
                          <View key={s} style={s > 0 ? { marginTop: 10 } : undefined}>
                            {sec.titulo && (
                              <Text style={estilos.maquinaTitulo}>
                                {ROMANOS[s] ?? s + 1}. {sec.titulo}
                              </Text>
                            )}
                            {bloques.map((b, bi) => (
                              <View key={b.titulo}>
                                <Text style={[estilos.seccionTitulo, ...(bi > 0 || s > 0 ? [{ marginTop: 10 }] : [])]}>
                                  {b.titulo.toUpperCase()}
                                </Text>
                                {b.esListaDeDatos
                                  ? /* Dimensiones y medidas: tabla invisible de
                                       dos columnas con los dos puntos alineados
                                       en vertical. Una línea que no traiga
                                       «rótulo: valor» sale como viñeta normal. */
                                    b.lineas.map((linea, j) => {
                                      const dato = partirDato(linea);
                                      return (
                                        <View key={j} style={estilos.vineta}>
                                          <Text style={estilos.vinetaPunto}>•</Text>
                                          {dato ? (
                                            <>
                                              <Text style={estilos.datoRotulo}>{dato[0]}</Text>
                                              <Text style={estilos.datoValor}>: {dato[1]}</Text>
                                            </>
                                          ) : (
                                            <Text style={estilos.vinetaTexto}>{linea}</Text>
                                          )}
                                        </View>
                                      );
                                    })
                                  : /* TAMBOR, PUERTA, PANEL FRONTAL… son el título del
                                       bloque que viene debajo, no una característica.
                                       Con viñeta salían al mismo nivel que sus propias
                                       características y el cliente leía el nombre de
                                       la pieza como si fuera una prestación. */
                                    clasificarFicha(b.lineas).map((c, j) =>
                                      c.esSubtitulo ? (
                                        <Text key={j} style={estilos.subtitulo}>
                                          {c.texto}
                                        </Text>
                                      ) : (
                                        <View key={j} style={estilos.vineta}>
                                          <Text style={estilos.vinetaPunto}>•</Text>
                                          <Text style={estilos.vinetaTexto}>{c.texto}</Text>
                                        </View>
                                      ),
                                    )}
                              </View>
                            ))}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* La ficha NO lleva tabla de condiciones al pie.
                    Se probó el 27-08 con precio, tiempo de entrega, garantía,
                    forma de pago y saldo, y Darwin la sacó: esos datos ya van
                    en las condiciones de la cotización y en la firma del
                    comercial, en la última página. Repetirlos por equipo
                    duplicaba el precio que el cliente ya vio en el resumen. */}
              </View>
            </Page>
          );
        })}

      {/* ── Página final: condiciones, validez, cuentas, importante/nota y firma ── */}
      <Page size="A4" style={estilos.page}>
        {membrete}
        {pie}

        {/* Lo acordado, rotulado renglón por renglón, y no dentro de un párrafo
            de texto libre: hasta el 28-08 todo esto vivía revuelto en una sola
            frase —«Entrega: 15 días útiles. Garantía de fábrica.»— que cada
            comercial escribía distinta. El texto libre se queda arriba, para la
            cláusula que no entre en ninguno de los cuatro renglones. */}
        {(condiciones || condicionesAcordadas.length > 0) && (
          <View wrap={false}>
            <Text style={estilos.seccionSubrayada}>Condiciones comerciales:</Text>
            {condiciones && (
              <Text style={condicionesAcordadas.length > 0 ? estilos.parrafoJunto : estilos.parrafo}>
                {condiciones}
              </Text>
            )}
            {condicionesAcordadas.length > 0 && (
              <View style={estilos.condicionesLista}>
                {condicionesAcordadas.map(([rotulo, valor]) => (
                  <Text key={rotulo} style={estilos.condicionLinea}>
                    <Text style={estilos.negrita}>{rotulo}: </Text>
                    {valor}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}

        <Text style={estilos.validez}>VALIDEZ DE LA COTIZACION: {vigenciaDias} DIAS</Text>

        {/* ── Cuentas bancarias (solo OPEN) ── */}
        {identidad.cuentasBancarias && (
          <View wrap={false}>
            <Text style={estilos.cuentasTitulo}>NÚMEROS DE CUENTA BANCARIA</Text>
            <Text style={{ marginBottom: 2 }}>
              <Text style={estilos.negrita}>NOMBRE: </Text>
              {identidad.cuentasBancarias.titular}
            </Text>
            <Text style={{ marginBottom: 8 }}>
              <Text style={estilos.negrita}>RUC: </Text>
              {identidad.cuentasBancarias.ruc}
            </Text>
            <View style={estilos.tabla}>
              <View style={{ flexDirection: "row" }}>
                <Text style={[estilos.bancoTh, estilos.bBanco]}>BANCO</Text>
                <Text style={[estilos.bancoTh, estilos.bMoneda]}>MONEDA</Text>
                <Text style={[estilos.bancoTh, estilos.bCorriente]}>CUENTA CORRIENTE</Text>
                <Text style={[estilos.bancoTh, estilos.bCci]}>CCI</Text>
              </View>
              {identidad.cuentasBancarias.cuentas.map((c, i) => (
                <View key={i} style={[estilos.tdFila, { borderTopColor: BORDE }]}>
                  <Text style={[estilos.bancoTd, estilos.bBanco, estilos.negrita]}>{c.banco}</Text>
                  <Text style={[estilos.bancoTd, estilos.bMoneda]}>{c.moneda}</Text>
                  <Text style={[estilos.bancoTd, estilos.bCorriente]}>{c.corriente}</Text>
                  <Text style={[estilos.bancoTd, estilos.bCci]}>{c.cci}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Importante / Nota ── */}
        <View style={{ marginTop: 18 }} wrap={false}>
          <Text style={estilos.seccionSubrayada}>Importante:</Text>
          {/* El punto 1 es el lugar de entrega, que se elige por cotización
              (migración 0066). Los demás son fijos y vienen de los modelos. */}
          {[entregaLugar ?? ENTREGA_POR_DEFECTO, ...PUNTOS_IMPORTANTES].map((p, i) => (
            <View key={i} style={estilos.listaNumerada}>
              <Text style={estilos.listaNumero}>{i + 1}.</Text>
              <Text style={estilos.listaTexto}>{p}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 12 }} wrap={false}>
          <Text style={estilos.seccionSubrayada}>Nota:</Text>
          {NOTAS.map((n, i) => (
            <View key={i} style={estilos.listaNumerada}>
              <Text style={estilos.listaNumero}>•</Text>
              <Text style={estilos.notaTexto}>{n}</Text>
            </View>
          ))}
        </View>

        {/* ── Cierre y firma ── */}
        <View style={estilos.cierre} wrap={false}>
          <Text style={estilos.parrafo}>
            Agradeciendo su atención a la presente, quedamos de ustedes a la espera de su apreciable
            orden.
          </Text>
          <Text>Atentamente,</Text>

          <View style={estilos.firmaBloque}>
            {identidad.usaLogo ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML
              <Image src={logoBuffer} style={estilos.firmaLogo} />
            ) : (
              <View>
                <Text style={[estilos.firmaWordmark, { color: identidad.acento }]}>{identidad.nombreLegal}</Text>
                <Text style={estilos.membreteSub}>{identidad.subtitulo}</Text>
              </View>
            )}
            <View style={estilos.firmaDatos}>
              <Text style={estilos.negrita}>{firma.nombre}</Text>
              {/* El cargo venía quemado como "Área Comercial". Las firmas
                  reales dicen "Ejecutivo Comercial" y "Ejecutivo Comercial
                  Senior", y el Senior no es adorno: es jerarquía frente al
                  cliente (migración 0058). */}
              <Text style={estilos.negrita}>{firma.cargo ?? "Área Comercial"}</Text>
              {firma.telefono && <Text>Teléfono : {firma.telefono}</Text>}
              {firma.celular && <Text>Celular  : {firma.celular}</Text>}
              {firma.email && <Text>Email    : {firma.email}</Text>}
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
