// Matemática de los gráficos de distribución del CLTV (histograma + caja y
// bigotes). Va aparte del componente para poder probarla: lo que aquí se
// calcula es lo que después se dibuja, y un error de escala no se ve a simple
// vista en un SVG.
//
// LA IDEA CENTRAL — UN SOLO EJE PARA LOS DOS GRÁFICOS.
// El histograma y la caja miden lo mismo (dólares de valor de vida del
// cliente) pero antes se dibujaban en ejes distintos: el histograma en tramos
// categóricos de igual ancho y la caja en escala logarítmica continua. Así no
// hay manera de relacionarlos con la vista, que es justamente para lo que
// sirve ponerlos uno encima del otro.
//
// La escala común es la de los TRAMOS DE NEGOCIO: cada tramo ocupa el mismo
// ancho en pantalla y dentro de cada uno se interpola en logaritmo. La
// posición `u` que devuelve `escalaTramos` va de 0 a la cantidad de tramos, y
// el tramo i-ésimo ocupa exactamente el intervalo [i, i+1]. De ahí sale todo:
// las barras son los enteros, y la caja, los bigotes y la curva se colocan en
// ese mismo `u`.

/** Un tramo del histograma tal como lo devuelve `finanzas_marketing()`. */
export type TramoCltv = { tramo: string; desde: number; hasta: number; clientes: number };

/** Redondeo "bonito" hacia abajo sobre la escalera 1-2-5 (114 → 100). */
export function pisoBonito(valor: number): number {
  if (!(valor > 0)) return 1;
  const escalon = 10 ** Math.floor(Math.log10(valor));
  const candidatos = [1, 2, 5, 10].map((m) => m * escalon);
  return candidatos.filter((c) => c <= valor).pop() ?? escalon;
}

/** Redondeo "bonito" hacia arriba sobre la escalera 1-2-5 (194.400 → 200.000). */
export function techoBonito(valor: number): number {
  if (!(valor > 0)) return 1;
  const escalon = 10 ** Math.floor(Math.log10(valor));
  const candidatos = [1, 2, 5, 10].map((m) => m * escalon);
  return candidatos.find((c) => c >= valor) ?? escalon * 10;
}

/**
 * Bordes reales del eje. El primer tramo viene abierto por abajo (`desde` 0)
 * y el último por arriba (`hasta` mil millones), así que se cierran con un
 * piso y un techo redondos alrededor de los datos: sin eso no se puede
 * interpolar en logaritmo ni saber dónde termina el eje.
 */
export function bordesTramos(tramos: TramoCltv[], minimo: number, maximo: number): number[] {
  if (!tramos.length) return [];
  const bordes = tramos.map((t) => t.desde);
  bordes[0] = Math.min(pisoBonito(minimo), tramos[0].hasta / 10);
  bordes.push(Math.max(techoBonito(maximo), tramos[tramos.length - 1].desde * 2));
  return bordes;
}

/**
 * Escala compartida: dólares → posición `u` en [0, cantidad de tramos].
 * Cada tramo ocupa una unidad y dentro de él se interpola en logaritmo, que
 * es como se reparten de verdad los valores (de 2,5k a 5k hay tanto "salto"
 * como de 5k a 10k).
 */
export function escalaTramos(bordes: number[]): (valor: number) => number {
  const n = bordes.length - 1;
  const logs = bordes.map((b) => Math.log(Math.max(b, 1e-9)));
  return (valor: number) => {
    const v = Math.min(Math.max(valor, bordes[0]), bordes[n]);
    let i = 0;
    while (i < n - 1 && v >= bordes[i + 1]) i++;
    const ancho = logs[i + 1] - logs[i] || 1;
    return i + (Math.log(v) - logs[i]) / ancho;
  };
}

/**
 * Bigotes de Tukey: llegan hasta el dato más lejano que caiga dentro de una
 * vez y media el rango intercuartílico; lo que queda fuera son ATÍPICOS y se
 * dibuja punto por punto.
 *
 * Este es el cambio que hace visible el sesgo. Con bigotes hasta el mínimo y
 * el máximo, los dos lados medían casi lo mismo en escala logarítmica y la
 * caja parecía simétrica, cuando en realidad no hay ningún cliente atípico
 * por abajo y hay decenas por arriba. Esa asimetría —un bigote corto y un
 * reguero de puntos a la derecha— es el hallazgo.
 */
export function bigotesTukey(
  valoresOrdenados: number[],
  q1: number,
  q3: number,
): { inferior: number; superior: number; atipicos: number[] } {
  const valla = 1.5 * (q3 - q1);
  const vallaInf = q1 - valla;
  const vallaSup = q3 + valla;
  const dentro = valoresOrdenados.filter((v) => v >= vallaInf && v <= vallaSup);
  return {
    inferior: dentro[0] ?? q1,
    superior: dentro[dentro.length - 1] ?? q3,
    atipicos: valoresOrdenados.filter((v) => v < vallaInf || v > vallaSup),
  };
}

/** Desviación estándar muestral. */
function desviacion(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1));
}

function cuantil(ordenados: number[], p: number): number {
  if (!ordenados.length) return 0;
  const i = (ordenados.length - 1) * p;
  const bajo = Math.floor(i);
  const alto = Math.ceil(i);
  return ordenados[bajo] + (ordenados[alto] - ordenados[bajo]) * (i - bajo);
}

/**
 * Ancho de banda de Silverman, con un piso.
 *
 * El piso existe porque los precios se repiten (muchas cotizaciones caen en
 * cifras redondas), y con el ancho que sale de la fórmula la curva dibuja esos
 * montones como picos y sierras. La curva está para enseñar la FORMA, no el
 * anecdotario de qué precio se repitió; 0,35 de tramo es lo mínimo para que se
 * lea como una campana y para que la curva no le saque tanta altura a las
 * barras, con las que comparte escala.
 */
export function anchoDeBanda(muestras: number[], piso = 0.35): number {
  const ordenados = [...muestras].sort((a, b) => a - b);
  const iqr = cuantil(ordenados, 0.75) - cuantil(ordenados, 0.25);
  const escala = Math.min(desviacion(muestras) || Infinity, iqr / 1.34 || Infinity);
  const silverman = 0.9 * (Number.isFinite(escala) ? escala : 1) * muestras.length ** (-1 / 5);
  return Math.max(silverman, piso);
}

/**
 * Curva de densidad (núcleo gaussiano) sobre la MISMA posición `u` en la que
 * se dibujan las barras.
 *
 * Se estima sobre `u` y no sobre los dólares a propósito: así la curva y las
 * barras quedan en la misma unidad —clientes por tramo— y se pueden superponer
 * sin trucos de escala, porque cada tramo mide exactamente 1 en `u`. `y` es,
 * literalmente, cuántos clientes cabría esperar en un tramo centrado ahí.
 */
export function curvaDensidad(
  posiciones: number[],
  tramos: number,
  opciones: { puntos?: number; ancho?: number } = {},
): { u: number; y: number }[] {
  const { puntos = 120 } = opciones;
  if (!posiciones.length) return [];
  const b = opciones.ancho ?? anchoDeBanda(posiciones);
  const curva: { u: number; y: number }[] = [];
  for (let i = 0; i <= puntos; i++) {
    const u = (i * tramos) / puntos;
    let suma = 0;
    for (const p of posiciones) {
      const z = (u - p) / b;
      suma += Math.exp(-0.5 * z * z);
    }
    // n · f(u), con f la densidad estimada: como cada tramo mide 1, esto ya
    // está en "clientes por tramo" y se compara con la altura de las barras.
    curva.push({ u, y: suma / (b * Math.sqrt(2 * Math.PI)) });
  }
  return curva;
}
