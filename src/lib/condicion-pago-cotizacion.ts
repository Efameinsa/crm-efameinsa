/**
 * LA FORMA DE PAGO Y EL SALDO TIENEN QUE DECIR LO MISMO (Gabriela, 02-10-2026).
 *
 * La Presu_990-26 salió con «30 % con la O/C / 70 % antes del despacho» cuando
 * lo acordado era al contado. Son los dos valores que el cotizador trae ya
 * escritos, y nadie los tocó: la pantalla no avisaba que seguían igual y la
 * confirmación no los mostraba. Y si se elegía «Contado», el saldo seguía
 * diciendo «70 % antes del despacho»: el PDF se contradecía delante del
 * cliente.
 *
 * Por eso: elegir una forma de pago de la lista trae su saldo (salvo que el
 * saldo se haya escrito a mano), y la confirmación dice qué va impreso y avisa
 * si quedó lo que viene por defecto o si las dos líneas se contradicen.
 */

export const FORMA_PAGO_POR_DEFECTO = "30 % con la O/C";
export const SALDO_POR_DEFECTO = "70 % antes del despacho";

/** El saldo que corresponde a cada forma de la lista. Vacío = no hay saldo. */
export const SALDO_DE_LA_FORMA: Record<string, string> = {
  "30 % con la O/C": "70 % antes del despacho",
  "50 % con la O/C": "50 % antes del despacho",
  "50 % adelanto, 50 % contra entrega": "",
  "100 % contra entrega": "",
  Contado: "",
  "Crédito 15 días": "",
  "Crédito 30 días": "",
};

/**
 * El saldo que queda al cambiar la forma de pago. Solo se reemplaza si el
 * saldo actual está vacío o es uno de los que pone la lista: lo escrito a mano
 * se respeta.
 */
export function saldoAlCambiarForma(nuevaForma: string, saldoActual: string): string {
  if (!(nuevaForma in SALDO_DE_LA_FORMA)) return saldoActual;
  const actual = saldoActual.trim();
  const automatico = actual === "" || Object.values(SALDO_DE_LA_FORMA).includes(actual);
  return automatico ? SALDO_DE_LA_FORMA[nuevaForma] : saldoActual;
}

/** Formas que se pagan de una vez (o a crédito): un saldo «antes del despacho» las contradice. */
const SIN_SALDO = /contado|100\s*%|cr[ée]dito/i;

/**
 * Lo que la confirmación tiene que advertir sobre el pago, o null si no hay
 * nada que decir. No frena: lo acordado puede ser raro y aun así correcto.
 */
export function avisoCondicionPago(formaPago: string, saldo: string): string | null {
  const forma = formaPago.trim();
  const resto = saldo.trim();
  if (!forma && !resto) return "No lleva forma de pago: el cliente no va a leer cómo pagar.";
  if (forma === FORMA_PAGO_POR_DEFECTO && resto === SALDO_POR_DEFECTO) {
    return "La forma de pago es la que trae el cotizador por defecto (30 % con la O/C, 70 % antes del despacho). ¿Es lo que acordó con el cliente?";
  }
  if (forma && resto && SIN_SALDO.test(forma) && /\d\s*%/.test(resto)) {
    return `Dice «${forma}» y el saldo dice «${resto}»: se contradicen. Borre el saldo o cambie la forma de pago.`;
  }
  return null;
}
