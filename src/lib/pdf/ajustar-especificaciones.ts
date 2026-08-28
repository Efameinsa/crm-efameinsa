/**
 * La fila de especificaciones de la ficha, medida de verdad.
 *
 * QUÉ FALLABA. Los anchos de columna del estándar son fijos (18 / 22 / 27 / 32 /
 * 33 / 38 mm) y el contenido no: el modelo de la torre LG —«GIANT C MAX
 * (CWG27MDCRS CDG27MUCPS)»— no entra en los 22 mm de «Modelo». Primero se salía
 * de la casilla y tapaba «Capacidad»; después, al cortarlo, quedó en cinco
 * renglones y con un guion que @react-pdf mete solo al partir una palabra
 * («GIANT C / MAX / (- / CWG27MDCRS / CDG27MUCPS»). Las dos cosas se ven mal en
 * un documento que va al cliente.
 *
 * CÓMO QUEDA, con lo que pidió Darwin el 28-08:
 *
 *   · Ninguna columna pasa de CUATRO renglones.
 *   · Ninguna palabra se parte: nunca aparece un guion de corte.
 *   · Si a una columna le falta ancho, se lo presta la que va sobrada —«un par
 *     de letras de Capacidad»—, y si a la que presta le queda justo, su rótulo
 *     se acomoda en dos renglones («Controles / Automático»), que es aceptable.
 *   · Si nada de eso alcanza, recién ahí se achica la letra, y en último caso se
 *     corta la palabra —sin guion— por el paréntesis o la barra.
 *
 * Todo se decide MIDIENDO con los anchos reales de la Helvetica-Bold, que es la
 * fuente de la fila. Estimarlo con un ancho medio de letra fue lo que dejó pasar
 * el desborde: 0.62 em es el ancho de la minúscula, y un modelo en mayúsculas
 * con dígitos anda por 0.70.
 */

/** Anchos de la Helvetica-Bold en milésimas de em (tabla AFM del tipo). */
const ANCHO_GLIFO: Record<string, number> = {
  " ": 278, "!": 333, '"': 474, "#": 556, $: 556, "%": 889, "&": 722, "'": 238,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611, "@": 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 333, "\\": 278, "]": 333, "^": 584, _: 556, "`": 333,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278,
  k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333,
  u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  "{": 389, "|": 280, "}": 389, "~": 584,
  "°": 400, º: 365, "ª": 365, "²": 333, "”": 500, "“": 500, "–": 556, "—": 1000, "·": 278,
};
const ANCHO_POR_DEFECTO = 611;

/** Las vocales con tilde miden lo mismo que sin ella. */
const sinTilde = (c: string) => c.normalize("NFD").replace(/\p{Diacritic}/gu, "") || c;

export function anchoDeTexto(texto: string, tamano: number): number {
  let em = 0;
  for (const c of texto) em += ANCHO_GLIFO[c] ?? ANCHO_GLIFO[sinTilde(c)] ?? ANCHO_POR_DEFECTO;
  return (em / 1000) * tamano;
}

const MM = 2.8346; // puntos por milímetro
/** `paddingHorizontal: 2` a cada lado de la casilla. */
const PADDING_PT = 4;

/**
 * Los pedazos indivisibles de un texto: sus renglones propios, sus palabras, y
 * dentro de una palabra los cortes que ya trae escritos —el guion, la barra, el
 * paréntesis que cierra—. Ahí se puede pasar de renglón sin agregar nada, que
 * es como se lee «Digital-Multifunción» o «GLP/NATURAL» en la ficha en papel.
 */
interface Pedazo {
  texto: string;
  /** Va pegado al anterior: el corte era dentro de la misma palabra. */
  pegado: boolean;
}

function palabras(texto: string): Pedazo[][] {
  return texto.split("\n").map((renglon) =>
    renglon
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((palabra) =>
        palabra.split(/(?<=[-/)–])(?=.)/).map((trozo, i) => ({ texto: trozo, pegado: i > 0 })),
      ),
  );
}

/** El pedazo más ancho que no se puede partir sin cortar una palabra. */
export function anchoDeLaPalabraMasLarga(texto: string, tamano: number): number {
  return Math.max(0, ...palabras(texto).flat().map((p) => anchoDeTexto(p.texto, tamano)));
}

/**
 * Reparte el texto en renglones que entren en `anchoPt`, como lo haría el
 * maquetador: sin partir palabras. Los saltos que ya trae el texto se respetan.
 */
export function enRenglones(texto: string, anchoPt: number, tamano: number): string[] {
  const renglones: string[] = [];
  for (const linea of palabras(texto)) {
    let actual = "";
    for (const pedazo of linea) {
      const prueba = actual ? `${actual}${pedazo.pegado ? "" : " "}${pedazo.texto}` : pedazo.texto;
      if (actual && anchoDeTexto(prueba, tamano) > anchoPt) {
        renglones.push(actual);
        actual = pedazo.texto;
      } else {
        actual = prueba;
      }
    }
    renglones.push(actual);
  }
  return renglones.filter((r) => r !== "" || renglones.length === 1);
}

/** Última defensa: cortar una palabra que no entra ni sola. Sin guion. */
function partirPalabra(palabra: string, anchoPt: number, tamano: number): string[] {
  // Primero por los bordes naturales de un código: el paréntesis, la barra.
  const trozos = palabra.split(/(?<=[)\/\-–])(?=.)/);
  const salida: string[] = [];
  for (const trozo of trozos) {
    let actual = "";
    for (const c of trozo) {
      if (actual && anchoDeTexto(actual + c, tamano) > anchoPt) {
        salida.push(actual);
        actual = c;
      } else {
        actual += c;
      }
    }
    if (actual) salida.push(actual);
  }
  return salida;
}

export const MAX_RENGLONES = 4;

export interface Casilla {
  titulo: string;
  valor: string;
}

export interface CasillaAjustada {
  titulo: string;
  valor: string;
  tamanoTitulo: number;
  tamanoValor: number;
}

/** Ancho, en mm, que necesita la palabra más larga de la casilla a ese cuerpo. */
function anchoQuePide(casilla: Casilla, tamanoTitulo: number, tamanoValor: number): number {
  const necesario = Math.max(
    anchoDeLaPalabraMasLarga(casilla.titulo, tamanoTitulo),
    anchoDeLaPalabraMasLarga(casilla.valor, tamanoValor),
  );
  return (necesario + PADDING_PT) / MM;
}

/** El texto ya repartido y el cuerpo de letra con el que entra en su casilla. */
function acomodar(
  texto: string,
  anchoMm: number,
  base: number,
  minimo: number,
): { texto: string; tamano: number } {
  const disponible = anchoMm * MM - PADDING_PT;
  for (let tamano = base; tamano >= minimo - 0.01; tamano -= 0.5) {
    const cabenLasPalabras = anchoDeLaPalabraMasLarga(texto, tamano) <= disponible;
    const renglones = enRenglones(texto, disponible, tamano);
    if (cabenLasPalabras && renglones.length <= MAX_RENGLONES) {
      return { texto: renglones.join("\n"), tamano };
    }
  }
  // Ni a la letra mínima: se corta la palabra, sin guion, y se acepta el alto.
  const renglones = palabras(texto)
    .flat()
    .flatMap(({ texto: pedazo }) =>
      anchoDeTexto(pedazo, minimo) <= disponible ? [pedazo] : partirPalabra(pedazo, disponible, minimo),
    );
  return { texto: renglones.join("\n"), tamano: minimo };
}

/**
 * Reparte los 170 mm entre las columnas y acomoda cada casilla.
 *
 * Se parte de los anchos del estándar y solo se mueve lo necesario: la columna
 * a la que le falta ancho se lo pide a las que van sobradas, sin que ninguna
 * baje de lo que necesita para no cortar sus propias palabras.
 */
export function ajustarEspecificaciones(
  casillas: Casilla[],
  anchosBase: number[],
  opciones: { baseTitulo?: number; minTitulo?: number; baseValor?: number; minValor?: number } = {},
): { anchos: number[]; casillas: CasillaAjustada[] } {
  const { baseTitulo = 9.5, minTitulo = 8, baseValor = 10, minValor = 7.5 } = opciones;
  const total = anchosBase.reduce((a, b) => a + b, 0);
  const anchos = [...anchosBase];

  // Lo que cada columna pide para escribirse con el cuerpo de letra normal, y
  // lo que necesita como piso: la palabra más larga a la letra más chica, y
  // nunca menos de 14 mm, que es donde el rótulo deja de leerse.
  const comodo = casillas.map((c) => anchoQuePide(c, baseTitulo, baseValor));
  const piso = casillas.map((c) => Math.max(14, anchoQuePide(c, minTitulo, minValor)));
  // Una columna presta hasta quedarse en lo que ella misma pide (o en su piso,
  // si pide más de lo que tiene).
  const sobrante = (i: number) => Math.max(0, anchos[i] - Math.max(piso[i], Math.min(comodo[i], anchos[i])));

  // PASO 1 · lo necesario: que ninguna palabra quede cortada.
  for (let vuelta = 0; vuelta < 500; vuelta++) {
    const falta = anchos.map((a, i) => Math.max(0, comodo[i] - a));
    const iPeor = falta.indexOf(Math.max(...falta));
    if (falta[iPeor] <= 0.05) break;
    const iDonante = anchos
      .map((_, i) => (i === iPeor ? -1 : sobrante(i)))
      .reduce((mejor, s, i, arr) => (s > arr[mejor] ? i : mejor), 0);
    if (sobrante(iDonante) <= 0.05) break;
    const paso = Math.min(0.5, falta[iPeor], sobrante(iDonante));
    anchos[iDonante] -= paso;
    anchos[iPeor] += paso;
  }

  /* PASO 2 · con lo que sobre, bajarle renglones a la casilla más alta. Lo que
     molesta no son los milímetros sino el alto: «GIANT C / MAX / (- /
     CWG27MDCRS / CDG27MUCPS» ocupaba cinco. Se le da ancho a la columna con más
     renglones mientras alguna tenga de sobra y eso le sirva para bajar uno. */
  // Se cuentan los renglones del VALOR, no los del rótulo: que «Controles
  // Automático» se acomode en dos renglones es correcto y está aceptado.
  const renglonesDe = (i: number) =>
    acomodar(casillas[i].valor, anchos[i], baseValor, minValor).texto.split("\n").length;
  const rendidas = new Set<number>();
  const noPrestan = new Set<number>();
  for (let vuelta = 0; vuelta < 200; vuelta++) {
    const lineas = anchos.map((_, i) => (rendidas.has(i) ? 0 : renglonesDe(i)));
    const iPeor = lineas.indexOf(Math.max(...lineas));
    if (lineas[iPeor] <= 1) break;
    const iDonante = anchos
      .map((_, i) => (i === iPeor || rendidas.has(i) || noPrestan.has(i) ? -1 : sobrante(i)))
      .reduce((mejor, s, i, arr) => (s > arr[mejor] ? i : mejor), 0);
    if (sobrante(iDonante) <= 0.05) break;
    const antes = renglonesDe(iPeor);
    const antesDonante = renglonesDe(iDonante);
    const paso = Math.min(0.5, sobrante(iDonante));
    anchos[iDonante] -= paso;
    anchos[iPeor] += paso;
    // Nadie presta si al prestar se le parte a él: sería arreglar una casilla
    // rompiendo la de al lado.
    if (renglonesDe(iDonante) > antesDonante) {
      anchos[iDonante] += paso;
      anchos[iPeor] -= paso;
      noPrestan.add(iDonante);
      continue;
    }
    // Si con 4 mm más no bajó ni un renglón, esa columna ya no tiene arreglo
    // por ancho: se devuelve lo prestado y se pasa a la siguiente.
    if (renglonesDe(iPeor) >= antes && anchos[iPeor] - anchosBase[iPeor] > 4) {
      anchos[iPeor] -= paso;
      anchos[iDonante] += paso;
      rendidas.add(iPeor);
    }
  }

  // El total no se toca: es el ancho útil de la hoja.
  const suma = anchos.reduce((a, b) => a + b, 0);
  if (Math.abs(suma - total) > 0.01) anchos[anchos.indexOf(Math.max(...anchos))] += total - suma;

  return {
    anchos: anchos.map((a) => Math.round(a * 10) / 10),
    casillas: casillas.map((c, i) => {
      const titulo = acomodar(c.titulo, anchos[i], baseTitulo, minTitulo);
      const valor = acomodar(c.valor, anchos[i], baseValor, minValor);
      return { titulo: titulo.texto, valor: valor.texto, tamanoTitulo: titulo.tamano, tamanoValor: valor.tamano };
    }),
  };
}
