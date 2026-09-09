/**
 * CUÁNDO DOS FICHAS SON EL MISMO CLIENTE, para mostrarlas juntas.
 *
 * EL PROBLEMA, 09-09. La señorita de postventa: «derivaron dos veces la misma
 * solicitud». En su bandeja GRUPO SANTA ELENA salía tres veces —tres fichas
 * distintas— pidiendo el mismo mantenimiento de la misma centrífuga de Chancay,
 * y ninguna decía que las otras existían. No era Central derivando de más: el
 * cliente entra por WhatsApp sin RUC y, cuando el celular viene mal tipeado, el
 * CRM le abre ficha nueva (la causa se corrigió en la migración 0201). Pero las
 * fichas que ya se partieron siguen partidas, y la pantalla tiene que decirlo.
 *
 * LA REGLA. Manda el `cuentaId`, que es el dato duro. Después, las fichas que se
 * llaman IGUAL se juntan: «igual» es sin tildes, sin puntuación y sin la forma
 * societaria, así que «GRUPO SANTA ELENA» y «GRUPO SANTA ELENA S.A.» son uno
 * solo. Lo que está escrito DISTINTO no se junta: «NEWREST» y «NEWRESTO» siguen
 * separados, porque adivinar un dedazo es inventar, y esto pinta un aviso en una
 * pantalla operativa —tiene que acertar—.
 *
 * Vive acá, y no dentro del componente, para poder probarla: el riesgo de esta
 * regla no es que junte de menos, es que junte de más.
 */

const sinTildes = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

/**
 * Las siglas del tipo de empresa, que no distinguen a nadie. Es la misma idea
 * que `tokens_empresa` en la base (0144), recortada a lo que acá hace falta:
 * allá se descarta, acá se junta, así que se quitan SOLO estas. «PERU»,
 * «GRUPO» o «CORPORACION» se quedan — sacarlos juntaría «NEWREST» con
 * «NEWREST PERU», y eso ya es otra empresa hasta que alguien diga lo contrario.
 */
const FORMA_LEGAL = new Set(["SA", "SAC", "SRL", "EIRL", "SCRL", "SAA", "LTDA", "CIA"]);

/**
 * El nombre con el que dos fichas del mismo cliente se reconocen entre sí.
 *
 * Los puntos se BORRAN antes de separar en palabras, no se cambian por espacio:
 * «S.A.C.» tiene que quedar en «SAC» para poder reconocerlo. Partiéndolo daba
 * «S A C» —tres palabras de una letra que no están en la lista— y «GRUPO SANTA
 * ELENA S.A.» seguía siendo distinto de «GRUPO SANTA ELENA», que es justo lo
 * que esto vino a resolver. Lo cazó la prueba, no la pantalla.
 */
export function nombreDeCliente(s: string): string {
  return sinTildes(s.replace(/\./g, ""))
    .split(" ")
    .filter((p) => p && !FORMA_LEGAL.has(p))
    .join(" ");
}

export interface GrupoDeCliente<T> {
  /** El nombre más completo de las fichas que se juntaron. */
  cliente: string;
  /** Cada ficha del grupo, con su enlace propio al historial. */
  fichas: { id: string; nombre: string }[];
  casos: T[];
}

export function agruparPorCliente<T extends { cuentaId?: string | null; cliente: string }>(
  casos: T[],
): GrupoDeCliente<T>[] {
  // 1 · Una entrada por FICHA. Lo que no tiene ficha se agrupa por su nombre.
  const porFicha = new Map<string, GrupoDeCliente<T>>();
  for (const c of casos) {
    const clave = c.cuentaId ?? `nombre:${sinTildes(c.cliente)}`;
    const g = porFicha.get(clave);
    if (g) g.casos.push(c);
    else
      porFicha.set(clave, {
        cliente: c.cliente,
        fichas: c.cuentaId ? [{ id: c.cuentaId, nombre: c.cliente }] : [],
        casos: [c],
      });
  }

  // 2 · Las fichas que se llaman igual son el mismo cliente.
  const grupos = new Map<string, GrupoDeCliente<T>>();
  for (const g of porFicha.values()) {
    const clave = nombreDeCliente(g.cliente) || sinTildes(g.cliente) || g.cliente;
    const ya = grupos.get(clave);
    if (!ya) {
      grupos.set(clave, g);
      continue;
    }
    ya.casos.push(...g.casos);
    ya.fichas.push(...g.fichas);
    // Se muestra el nombre más completo: «GRUPO SANTA ELENA S.A.» dice más que
    // «GRUPO SANTA ELENA», y es el de la ficha que tiene el RUC.
    if (g.cliente.length > ya.cliente.length) ya.cliente = g.cliente;
  }
  return [...grupos.values()];
}
