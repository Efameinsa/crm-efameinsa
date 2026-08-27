import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { IDENTIDAD_SERIE, PUNTOS_IMPORTANTES, NOTAS, IGV, ENTREGA_POR_DEFECTO } from "./series";
import { clasificarFicha } from "@/lib/ficha-tecnica";

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
  categoria: string | null;
  calentamiento: string | null; // solo secadoras a gas
  panel: string | null; // "Digital-Multifunción"
  controles: string | null; // "220V/60Hz/1Ph"
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
      paddingTop: 92,
      paddingBottom: 78,
      paddingHorizontal: 48,
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
    membrete: { position: "absolute", top: 26, left: 48, right: 48 },
    membreteFila: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    logo: { width: 150 },
    logoBloque: { flexDirection: "column" },
    wordmark: { fontSize: 15, fontFamily: "Helvetica-Bold", color: acento },
    membreteRazon: { fontSize: 7.5, color: CARBON, marginTop: 2 },
    membreteSub: { fontSize: 8, color: GRIS, marginTop: 2 },
    membreteLinea: { borderBottomWidth: 1.2, borderBottomColor: acento, marginTop: 5 },

    pie: { position: "absolute", bottom: 24, left: 48, right: 48 },
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

    /* Ficha por ítem */
    ficha: { borderWidth: 0.8, borderColor: CARBON, marginTop: 16 },
    fichaTitulo: { fontSize: 9.5, fontFamily: "Helvetica-Bold", padding: 6 },
    specTh: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#FFFFFF", paddingVertical: 4, paddingHorizontal: 5, textAlign: "center" },
    specTd: { fontSize: 9, fontFamily: "Helvetica-Bold", paddingVertical: 4, paddingHorizontal: 5, textAlign: "center" },
    // Rótulo de máquina dentro de una torre ("I. LAVADORA"): un escalón por
    // encima de CARACTERISTICAS, como en el impreso.
    maquinaTitulo: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4 },
    caracTitulo: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 3 },
    // Subtítulo dentro de CARACTERISTICAS: negrita, sin viñeta y sangrado a la
    // altura del texto de las viñetas, como en la ficha en papel.
    caracSubtitulo: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginLeft: 12, marginBottom: 2 },
    caracBullet: { flexDirection: "row", marginBottom: 1 },
    caracPunto: { width: 12, textAlign: "center" },
    caracTexto: { flex: 1, fontSize: 8.5, textAlign: "justify", lineHeight: 1.3 },

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
  firma,
}: CotizacionPdfProps) {
  const identidad = IDENTIDAD_SERIE[serie];
  const estilos = crearEstilos(identidad.acento);

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
           mismo — "can't wrap between pages".) ── */}
      {items
        .filter((item) => {
          // Un equipo escrito a mano (todavía no está en el catálogo, migración
          // 0062) no tiene nada que poner en la ficha: su página saldría en
          // blanco delante del cliente. Mejor no generarla — el equipo igual
          // aparece en la tabla de la propuesta con su precio.
          const tieneAlgoQueDecir =
            item.caracteristicas.length > 0 ||
            item.disenoConstruccion.length > 0 ||
            item.dimensiones.length > 0 ||
            item.medidas.length > 0 ||
            Boolean(item.panel || item.controles || item.calentamiento);
          return tieneAlgoQueDecir;
        })
        .map((item, i) => {
          // Columnas de especificación como en los modelos reales: Calentamiento
          // solo aparece en secadoras a gas; si el producto no tiene ficha de
          // panel/controles se muestra la categoría.
          const columnas: { titulo: string; valor: string }[] = [
            { titulo: "Marca", valor: item.marca },
            { titulo: "Modelo", valor: item.modelo },
            { titulo: "Capacidad", valor: item.capacidad ?? "—" },
          ];
          if (item.calentamiento) columnas.push({ titulo: "Calentamiento", valor: item.calentamiento });
          if (item.panel) columnas.push({ titulo: "Panel computarizado", valor: item.panel });
          if (item.controles) columnas.push({ titulo: "Controles Automático", valor: item.controles });
          if (!item.panel && !item.controles) columnas.push({ titulo: "Categoría", valor: item.categoria ?? "—" });
          const anchoCol = `${100 / columnas.length}%`;

          const tieneDetalle =
            item.caracteristicas.length > 0 ||
            item.disenoConstruccion.length > 0 ||
            item.dimensiones.length > 0 ||
            item.medidas.length > 0;

          return (
            <Page key={i} size="A4" style={estilos.page}>
              {membrete}
              {pie}
              <View style={estilos.ficha}>
              <Text style={estilos.fichaTitulo}>
                ITEM {ROMANOS[i] ?? i + 1}.- {item.nombre.toUpperCase()}
              </Text>
              <View style={[estilos.thFila, { borderTopWidth: 0.8, borderTopColor: CARBON }]}>
                {columnas.map((c, j) => (
                  <Text key={j} style={[estilos.specTh, { width: anchoCol }]}>
                    {c.titulo}
                  </Text>
                ))}
              </View>
              <View style={[estilos.tdFila, { borderTopColor: BORDE }]}>
                {columnas.map((c, j) => (
                  <Text key={j} style={[estilos.specTd, { width: anchoCol }]}>
                    {c.valor}
                  </Text>
                ))}
              </View>

              {(tieneDetalle || item.fotoBuffer) && (
                <View style={{ flexDirection: "row", borderTopWidth: 0.8, borderTopColor: BORDE }}>
                  {/* A la izquierda va la foto y nada más; las dimensiones, las
                      medidas y la descripción van todas a la derecha. Es como
                      lo corrigió el ing. Carlos el 24-08 mirando el PDF
                      impreso, y coincide con los modelos en papel.

                      Antes las medidas iban abajo de la foto para aprovechar el
                      hueco y evitar que una ficha larga se desbordara. Ese
                      riesgo baja solo con este orden: en la columna ancha cada
                      viñeta ocupa menos líneas que en la angosta, así que el
                      alto total de la ficha no sube. */}
                  {item.fotoBuffer && (
                    // 38%: proporción ideal entre foto y texto (pedido de
                    // Santos 26-08, con la imagen de referencia). El 53%
                    // anterior dejaba el panel de foto demasiado grande.
                    <View style={{ width: "38%", padding: 10, justifyContent: "flex-start" }}>
                      {/* Logo del fabricante, foto del equipo y foto del panel
                          de control, en ese orden — como en la ficha original
                          (pedido 26-08, con la referencia que armó Darwin de
                          la SECU1202 al lado). Antes solo salía la foto. */}
                      {item.logoMarcaBuffer && (
                        // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML
                        <Image src={item.logoMarcaBuffer} style={{ width: "40%", alignSelf: "center", marginBottom: 8 }} />
                      )}
                      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML */}
                      <Image src={item.fotoBuffer} style={{ width: "100%" }} />
                      {item.panelImagenBuffer && (
                        // 54% (90% -40%, pedido de Santos 26-08 con la
                        // SECUT055V al lado: el panel salía gigante frente a
                        // la foto del equipo).
                        // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no <img> HTML
                        <Image src={item.panelImagenBuffer} style={{ width: "54%", alignSelf: "center", marginTop: 8 }} />
                      )}
                    </View>
                  )}
                  <View
                    style={{
                      flex: 1,
                      padding: 8,
                      borderLeftWidth: item.fotoBuffer ? 0.8 : 0,
                      borderLeftColor: BORDE,
                    }}
                  >
                    {/* Una torre lavadora-secadora son DOS máquinas y su ficha
                        trae un bloque para cada una. Se imprimen separadas y
                        rotuladas —"I. LAVADORA", "II. SECADORA"— como el
                        documento en papel. Un equipo normal tiene una sola
                        sección sin rótulo y sale exactamente igual que antes. */}
                    {(item.secciones ?? [
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
                    ]).map((sec, s) => {
                      // Bloques con viñetas + su título. El rótulo de dos de
                      // ellos no es fijo entre plantillas (ver
                      // extraer-ficha-tecnica.mjs), así que se imprime el que
                      // trajo la ficha y solo se cae al de siempre cuando no
                      // se guardó ninguno. El ORDEN tampoco es fijo —
                      // reportado 26-08 con la LAV040, que abre con "DISEÑO DE
                      // CONSTRUCCIÓN" en vez de "AUTOMATIZACIÓN…"— así que se
                      // reordena según `ordenSecciones` cuando la ficha lo trae.
                      const porClave = {
                        caracteristicas: { titulo: sec.caracteristicasTitulo ?? "CARACTERÍSTICAS", lineas: sec.caracteristicas },
                        disenoConstruccion: { titulo: "DISEÑO DE CONSTRUCCIÓN", lineas: sec.disenoConstruccion },
                        dimensiones: { titulo: sec.dimensionesTitulo ?? "DIMENSIONES DE LA MÁQUINA", lineas: sec.dimensiones },
                        medidas: { titulo: sec.medidasTitulo ?? "MEDIDAS GENERALES", lineas: sec.medidas },
                      };
                      const orden = sec.ordenSecciones ?? ["caracteristicas", "disenoConstruccion", "dimensiones", "medidas"];
                      const bloques = orden.map((clave) => porClave[clave]).filter((b) => b.lineas.length > 0);
                      return (
                        <View key={s} style={s > 0 ? { marginTop: 10 } : undefined}>
                          {sec.titulo && (
                            <Text style={estilos.maquinaTitulo}>
                              {ROMANOS[s] ?? s + 1}. {sec.titulo}
                            </Text>
                          )}
                          {bloques.map((b, bi) => (
                            <View key={b.titulo} style={bi > 0 ? { marginTop: 8 } : undefined}>
                              <Text style={estilos.caracTitulo}>{b.titulo}</Text>
                              {/* TAMBOR, PUERTA, PANEL FRONTAL… son el título del
                                  bloque que viene debajo, no una característica.
                                  Con viñeta salían al mismo nivel que sus propias
                                  características y el cliente leía el nombre de
                                  la pieza como si fuera una prestación. */}
                              {clasificarFicha(b.lineas).map((c, j) =>
                                c.esSubtitulo ? (
                                  <Text key={j} style={[estilos.caracSubtitulo, j > 0 ? { marginTop: 5 } : {}]}>
                                    {c.texto}
                                  </Text>
                                ) : (
                                  <View key={j} style={estilos.caracBullet}>
                                    <Text style={estilos.caracPunto}>•</Text>
                                    <Text style={estilos.caracTexto}>{c.texto}</Text>
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
              </View>
            </Page>
          );
        })}

      {/* ── Página final: condiciones, validez, cuentas, importante/nota y firma ── */}
      <Page size="A4" style={estilos.page}>
        {membrete}
        {pie}

        {condiciones && (
          <View wrap={false}>
            <Text style={estilos.seccionSubrayada}>Condiciones comerciales:</Text>
            <Text style={estilos.parrafo}>{condiciones}</Text>
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
