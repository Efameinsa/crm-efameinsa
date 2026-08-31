// ============================================================
// CRM EFAMEINSA · Leer una ficha técnica .docx tal como está
// ============================================================
// La lectura del Word de Lesly —sus títulos, subtítulos, viñetas y datos— vive
// acá y no dentro del paso 3 del pipeline porque hay dos programas que la
// necesitan: `fichas-v-03-extraer.mjs`, que lee el catálogo entero, y los
// scripts de reparación, que vuelven sobre una ficha ya cargada sin pisarle las
// correcciones a mano que se le hicieron después. Que la lectura sea UNA sola no
// es un lujo: `reparar-subtitulos-fichas.mjs` dejó escrito el porqué —copiar la
// lectura «mejorándola» fue lo que se llevó puestas las medidas de la SECA758—.
//
// Los bloques que devuelve son los que imprime el PDF de cotización:
//   titulo     — el rótulo subrayado / en mayúsculas que abre una sección
//   subtitulo  — el rótulo en negrita de adentro (TAMBOR, PUERTA…)
//   vineta     — cada ítem de la lista
//   dato       — «Largo : 1100 mm», que se maqueta en dos columnas

// ---------- utilidades de XML ----------

const sinEtiquetas = (xml) =>
  xml
    // Los CÓDIGOS DE CAMPO de Word no son texto de la ficha: son la instrucción
    // que Word ejecuta para dibujar algo. `<w:instrText>` guardaba
    // «INCLUDEPICTURE "C:\Users\COMERC~3\AppData\…\wps1.png" \* MERGEFORMATINET»
    // —la imagen vinculada del Word de la LAVTMAX17, hecho con WPS— y esa línea
    // salió impresa arriba de las características en una cotización real
    // (28-08). Lo mismo con `<w:delText>`, que es texto YA borrado con control
    // de cambios.
    .replace(/<w:instrText[\s\S]*?<\/w:instrText>/g, "")
    .replace(/<w:delText[\s\S]*?<\/w:delText>/g, "")
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

/**
 * Texto plano de una tabla, celda por celda.
 *
 * Cada párrafo de la celda es un renglón y se conserva como tal: pegados uno
 * tras otro salían modelos inventados —«TITAN MAXTITAN LIGHT» en la LAVTMAX17,
 * «GIANT C MAX(CWG27MDCRSCDG27MUCPS)» en la LAVTGIA13, que además se salía de
 * su casilla y tapaba la de al lado (visto en una cotización real el 28-08)—.
 * En la ficha en papel son dos líneas: son dos máquinas, la lavadora y la
 * secadora de la torre.
 */
function celdasDeTabla(xmlTabla) {
  return [...xmlTabla.matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map((m) =>
    [...m[1].matchAll(/<w:p(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/w:p>)/g)]
      .map((p) => limpio(sinEtiquetas(p[1] ?? "")))
      .filter(Boolean)
      .join("\n") || limpio(sinEtiquetas(m[1])),
  );
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

/**
 * El texto de los CUADROS DE TEXTO no es el texto de la ficha.
 *
 * QUÉ SALÍA MAL (visto el 29-08 por Darwin en dos cotizaciones reales, la
 * Presu_511-26 y la Presu_512-26): la ficha de la SECNDE imprimía «Modelo /
 * 2023» catorce veces seguidas antes de las características, y la SECMAX152 y
 * la SECGIA10 lo mismo un par de veces. Esas dos palabras no están en el cuerpo
 * del Word: viven en cuadros de texto flotantes que Lesly puso encima de la
 * foto, como una etiqueta. Y salían el DOBLE de veces que cuadros hay porque
 * Word guarda cada forma dos veces —«mc:Choice» con la versión moderna y
 * «mc:Fallback» con la misma forma en el formato viejo, para que la abra un
 * Word antiguo—, y leyendo el XML con expresiones regulares se leen las dos.
 *
 * Y ADEMÁS DESCOLOCABA AL PÁRRAFO QUE LOS CONTIENE. Un cuadro de texto es un
 * <w:p> dentro de otro <w:p>, y la expresión que corta párrafos es perezosa: el
 * párrafo de afuera terminaba en el </w:p> del de adentro y los dos textos
 * quedaban pegados. Así nació «2413011176000121031010468610Modelo»: el código
 * de barras de la plantilla UniMac con la etiqueta de encima pegada al final.
 *
 * Se vacía el contenido de cada cuadro DEJANDO LA MISMA CANTIDAD DE ESPACIOS:
 * el resto del extractor ubica tablas e imágenes por su posición dentro del XML
 * («tablaDe»), así que correr los caracteres rompería lo que hoy funciona.
 *
 * Las fotos no se pierden: se buscan aparte, recorriendo el XML entero, y en
 * las fichas convertidas de .doc la imagen de la forma VML está fuera del
 * <w:txbxContent>.
 */
const sinCuadrosDeTexto = (xml) =>
  xml.replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g, (caja) => " ".repeat(caja.length));

function parrafosDe(xml) {
  const parrafos = [];
  // Los cuadros de texto se vacían antes de recorrer los párrafos: lo que
  // flota encima de la hoja no es el hilo del documento.
  const flujo = sinCuadrosDeTexto(xml);
  const re = /<w:p(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/w:p>)/g;
  let m;
  while ((m = re.exec(flujo)) !== null) {
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

/**
 * Lee el cuerpo de la ficha: los datos de cabecera y los bloques, en el mismo
 * orden en el que están en el Word.
 *
 * Devuelve también las filas de tabla y `tablaDe`, que el paso 3 necesita para
 * separar la foto del equipo de la papelería y de la tabla de condiciones.
 */
export function leerFichaDeXml(xml) {
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
    // Un título NUMERADO sigue siendo un título. Las fichas de torre abren cada
    // máquina con «I. LAVADORA» y «II. SECADORA» como lista numerada, en
    // negrita: impresas como viñeta, la cotización empezaba con un «• LAVADORA»
    // suelto arriba de las características (visto el 28-08 en la LAVTGIA13).
    const tituloNumerado = esVineta && p.negrita && mayusculas && texto.length <= 30 && !/[.:;,]$/.test(texto);
    if (tituloNumerado) {
      seccionActual = texto;
      bloques.push({ t: "titulo", texto });
      continue;
    }

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
  // Vienen en negrita, así que según la ficha caen en viñeta o en subtítulo: se
  // miran los dos, o la SECNDE sigue abriendo con «2413011176000121031010468610».
  const primerTitulo = bloques.findIndex((b) => b.t === "titulo");
  if (primerTitulo > 0) {
    for (let i = primerTitulo - 1; i >= 0; i--) {
      const b = bloques[i];
      if ((b.t === "vineta" || b.t === "subtitulo") && /^[\d\s.,\-/]+$/.test(b.texto)) bloques.splice(i, 1);
    }
  }

  return { cabecera, bloques, filas, tablaDe };
}
