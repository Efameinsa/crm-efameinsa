/**
 * Quién escribió, en una línea, para el aviso que Central le pasa a otra área.
 *
 * Central, 23-10 (buzón cd7ed2a1): avisó a C5 de un prospecto de la web que ya
 * era su cliente y a C5 le llegó solo «City: Huarmey · Llenó el formulario de
 * Google…»: el texto del formulario, sin nombre, teléfono ni correo. La ficha
 * tiene varios contactos (INVERSIONES GENERALES HILMOT, cinco) y el comercial no
 * sabía a quién llamar. El aviso tiene que decir QUIÉN, no solo QUÉ.
 */
export interface DatosDeQuienEscribe {
  nombre_contacto?: string | null;
  razon_social?: string | null;
  telefono?: string | null;
  email?: string | null;
  num_doc?: string | null;
}

const soloDigitos = (s: string) => s.replace(/\D/g, "");

/** «Escribió: Ego Gomero · tel. +51972842887 · egomero27@gmail.com» o null si no hay nada. */
export function lineaQuienEscribe(l: DatosDeQuienEscribe | null | undefined): string | null {
  if (!l) return null;
  const nombre = l.nombre_contacto?.trim() || "";
  const empresa = l.razon_social?.trim() || "";
  const partes = [
    nombre || empresa,
    empresa && nombre && empresa.toLowerCase() !== nombre.toLowerCase() ? empresa : "",
    l.num_doc?.trim() ? `doc. ${l.num_doc.trim()}` : "",
    l.telefono?.trim() ? `tel. ${l.telefono.trim()}` : "",
    l.email?.trim() || "",
  ].filter(Boolean);
  return partes.length ? `Escribió: ${partes.join(" · ")}` : null;
}

/**
 * El detalle con quién escribió al principio, si no lo trae ya. Va en el
 * servidor para que no se pierda aunque Central reescriba el texto del diálogo.
 */
export function conQuienEscribe(detalle: string, l: DatosDeQuienEscribe | null | undefined): string {
  const linea = lineaQuienEscribe(l);
  if (!linea) return detalle;
  const tel = soloDigitos(l?.telefono ?? "").slice(-9);
  const yaLoTrae =
    detalle.startsWith("Escribió:") ||
    (tel.length >= 6 && soloDigitos(detalle).includes(tel)) ||
    (!!l?.email?.trim() && detalle.toLowerCase().includes(l.email.trim().toLowerCase()));
  return yaLoTrae ? detalle : `${linea}. ${detalle}`;
}
