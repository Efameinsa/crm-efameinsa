/**
 * Validación de RUC y DNI peruanos.
 *
 * El número va impreso en la cotización y de ahí pasa a la orden de compra, la
 * guía y la factura. Un dígito mal tecleado no lo detecta nadie hasta que
 * contabilidad rechaza el expediente, así que conviene atajarlo al escribirlo.
 *
 * El RUC trae dígito verificador (módulo 11), o sea que un error de tipeo se
 * detecta sin consultar a SUNAT. El DNI no tiene verificador: de ese solo se
 * puede comprobar el largo.
 */

export type TipoDocumento = "RUC" | "DNI" | "CE" | "SIN_DOC";

/** Pesos del módulo 11 de SUNAT, aplicados a los 10 primeros dígitos. */
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function rucValido(valor: string): boolean {
  const n = valor.replace(/\D/g, "");
  if (n.length !== 11) return false;
  // Los dos primeros dígitos son el tipo de contribuyente. SUNAT usa 10, 15,
  // 16, 17 (persona natural y sucesiones) y 20 (persona jurídica).
  if (!["10", "15", "16", "17", "20"].includes(n.slice(0, 2))) return false;

  const suma = PESOS.reduce((t, peso, i) => t + peso * Number(n[i]), 0);
  const resto = suma % 11;
  const esperado = (11 - resto) % 10;
  return esperado === Number(n[10]);
}

export function dniValido(valor: string): boolean {
  return /^\d{8}$/.test(valor.replace(/\D/g, ""));
}

/** El carné de extranjería no tiene formato fijo; solo se exige algo razonable. */
export function ceValido(valor: string): boolean {
  const n = valor.trim();
  return n.length >= 8 && n.length <= 12;
}

/**
 * Devuelve el motivo por el que el documento no sirve, o null si está bien.
 * El texto es el que ve el comercial, así que dice qué hacer.
 */
export function errorDocumento(tipo: TipoDocumento, valor: string): string | null {
  const limpio = valor.trim();
  if (tipo === "SIN_DOC") return null;
  if (!limpio) return "Escriba el número, o marque «Sin documento»";

  if (tipo === "RUC") {
    const n = limpio.replace(/\D/g, "");
    if (n.length !== 11) return `El RUC tiene 11 dígitos; escribió ${n.length}`;
    if (!rucValido(n)) return "Ese RUC no existe: revise los dígitos";
    return null;
  }
  if (tipo === "DNI") {
    const n = limpio.replace(/\D/g, "");
    if (!dniValido(n)) return `El DNI tiene 8 dígitos; escribió ${n.length}`;
    return null;
  }
  if (tipo === "CE") {
    if (!ceValido(limpio)) return "El carné de extranjería tiene entre 8 y 12 caracteres";
    return null;
  }
  return null;
}
