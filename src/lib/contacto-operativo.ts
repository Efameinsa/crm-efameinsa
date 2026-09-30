/**
 * EL CONTACTO ESCRITO A MANO SE SUMA A LA FICHA (0352).
 *
 * Ing. Carlos, 30-09: «tú hoy día ingresas algo manual, tiene que sumar al
 * contacto. Para que no quede en el limbo esta nueva persona de contacto de
 * logística». Lesly: puede ser un técnico o el electricista del cliente, que
 * no es contacto comercial. Por eso entra como contacto OPERATIVO: está en la
 * ficha, pero no es el principal ni sale en la cotización.
 *
 * Acá vive lo que no toca la base: sacar el nombre y el celular de un texto
 * libre («Juan Pérez (almacén), 987 654 321 — recibe de 2 a 5 pm») y las
 * etiquetas que se muestran.
 */

export type CategoriaContacto = "comercial" | "operativo";

/** De qué formulario salió (contactos.origen). */
export type OrigenContacto = "apertura" | "direccion_verificada" | "programar_despacho" | "despacho";

export const ETIQUETA_ORIGEN: Record<string, string> = {
  apertura: "en la apertura al almacén",
  direccion_verificada: "al verificar quién recibe",
  programar_despacho: "al programar el despacho",
  despacho: "al registrar el despacho",
};

/** Los últimos 9 dígitos: así se compara un celular con o sin +51, espacios o guiones. */
export function ultimos9(telefono: string | null | undefined): string {
  return (telefono ?? "").replace(/\D/g, "").slice(-9);
}

// Un número: dígitos con espacios, puntos o guiones entre medio, 6 a 15 dígitos.
const NUMERO = /\+?\d[\d .-]{4,}\d/g;
// Lo que se antepone al nombre al contar cómo se coordinó.
const PREFIJO = /^(?:coordin\S*|habl\S*|llam\S*|se\s+coordin\S*)?\s*(?:con\s+)?(?:el|la)?\s+/i;
// «cel.», «celular», «telf.» pegados al número.
const RUIDO_FINAL = /[\s,;:·\-—–/]*(?:cel(?:ular)?|telf?|tel[eé]fono|n[º°o]?)\.?[\s:]*$/i;
const SEPARADORES = /^[\s,;:·\-—–/|]+|[\s,;:·\-—–/|]+$/g;

/**
 * Nombre, cargo y celular desde un texto libre. Sin un número de 6 dígitos o
 * más no hay nada que sumar (null). El nombre sale de lo escrito ANTES del
 * número (o después, si antes no hay letras); lo que va entre paréntesis o
 * después de la primera coma es el cargo: «Juan Pérez (almacén)»,
 * «Juan Pérez, técnico del cliente».
 */
export function separarNombreYCelular(texto: string | null | undefined): { nombre: string | null; cargo: string | null; telefono: string } | null {
  const t = (texto ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const numero = [...t.matchAll(NUMERO)].find((m) => {
    const d = m[0].replace(/\D/g, "").length;
    return d >= 6 && d <= 15;
  });
  if (!numero || numero.index === undefined) return null;
  const telefono = numero[0].trim();
  const antes = t.slice(0, numero.index);
  const despues = t.slice(numero.index + numero[0].length);
  const tieneLetras = (s: string) => /\p{L}{2}/u.test(s);
  let crudo = tieneLetras(antes) ? antes : despues.split(/[—–]| - /)[0];
  crudo = crudo.replace(RUIDO_FINAL, "").replace(SEPARADORES, "").replace(PREFIJO, "").trim();
  if (!tieneLetras(crudo)) return { nombre: null, cargo: null, telefono };

  let cargo: string | null = null;
  const paren = crudo.match(/\(([^)]*)\)/);
  if (paren) {
    cargo = paren[1].trim() || null;
    crudo = crudo.replace(paren[0], " ");
  }
  const coma = crudo.indexOf(",");
  if (coma > 0) {
    cargo = cargo ?? (crudo.slice(coma + 1).replace(SEPARADORES, "").trim() || null);
    crudo = crudo.slice(0, coma);
  }
  const nombre = crudo.replace(/\s+/g, " ").replace(SEPARADORES, "").trim();
  return { nombre: tieneLetras(nombre) ? nombre : null, cargo, telefono };
}

/** Lo que la ficha dice debajo de un operativo: «Lo sumó Rubí · 30 set. 2026 · en la apertura al almacén». */
export function textoAgregado(c: { agregado?: { nombre: string | null } | null; agregado_at?: string | null; origen?: string | null }): string {
  const partes: string[] = [];
  if (c.agregado?.nombre) partes.push(`Lo sumó ${c.agregado.nombre}`);
  if (c.agregado_at)
    partes.push(new Date(c.agregado_at).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", year: "numeric" }));
  if (c.origen) partes.push(ETIQUETA_ORIGEN[c.origen] ?? c.origen);
  return partes.join(" · ");
}
