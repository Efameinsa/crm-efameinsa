/**
 * EL DATO PARA CONTACTAR AL CLIENTE SIN ABRIR LA FICHA (comerciales, 02-10).
 *
 * En la ventana de la agenda, al lado del nombre del cliente: «JESUS GARCIA ·
 * 932 262 669». Un solo dato —el del contacto principal—, de preferencia un
 * celular; si el cliente no tiene ningún teléfono, el correo. Para ver los
 * demás está la ficha completa.
 */

export interface ContactoFila {
  telefono: string | null;
  email: string | null;
  es_principal: boolean | null;
  categoria?: string | null;
  created_at?: string | null;
}

export type ContactoRapido = { tipo: "telefono"; valor: string; marcar: string } | { tipo: "email"; valor: string };

// Un celular peruano, con o sin 51 delante, con espacios, puntos o guiones
// entre los grupos: «925540748», «51925540748», «+51 925 540 748».
const CELULAR = /(?<!\d)(?:\+?51[\s.-]?)?(9\d{2})[\s.-]?(\d{3})[\s.-]?(\d{3})(?!\d)/;

/**
 * El número que se muestra de lo escrito en el campo. Hay 133 contactos con
 * varios números en el mismo campo («926230863 (Whatsapp) / 902484698
 * (llamadas)», «981207330 981312852 908932643»): sale el primer celular; si no
 * hay celular, el primer tramo tal cual («01-3603100 ANX 1141»).
 */
export function telefonoParaMostrar(texto: string | null | undefined): { valor: string; marcar: string; celular: boolean } | null {
  const t = (texto ?? "").replace(/\s+/g, " ").trim();
  if (!/\d{3}/.test(t.replace(/[\s.-]/g, ""))) return null;
  const cel = t.match(CELULAR);
  if (cel) {
    const nueve = `${cel[1]}${cel[2]}${cel[3]}`;
    return { valor: `${cel[1]} ${cel[2]} ${cel[3]}`, marcar: `+51${nueve}`, celular: true };
  }
  const tramo = t.split(/\s*(?:[/,;|]|\sy\s|\so\s)\s*/)[0].trim() || t;
  return { valor: tramo, marcar: tramo.replace(/\s*anx.*$/i, "").replace(/[^\d+]/g, ""), celular: false };
}

/**
 * El contacto principal manda (es el mismo orden de la columna «Teléfono» de
 * la cartera, 0219); entre los demás, el que tenga celular antes que un fijo,
 * y los contactos operativos —el técnico o quien recibe en obra— al final.
 */
export function contactoRapido(contactos: ContactoFila[] | null | undefined): ContactoRapido | null {
  const lista = [...(contactos ?? [])].sort((a, b) => {
    const pa = a.es_principal ? 0 : 1;
    const pb = b.es_principal ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const oa = a.categoria === "operativo" ? 1 : 0;
    const ob = b.categoria === "operativo" ? 1 : 0;
    if (oa !== ob) return oa - ob;
    const ca = telefonoParaMostrar(a.telefono)?.celular ? 0 : 1;
    const cb = telefonoParaMostrar(b.telefono)?.celular ? 0 : 1;
    if (ca !== cb) return ca - cb;
    return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
  });
  for (const c of lista) {
    const tel = telefonoParaMostrar(c.telefono);
    if (tel) return { tipo: "telefono", valor: tel.valor, marcar: tel.marcar };
  }
  const correo = lista.find((c) => c.email && c.email.includes("@"))?.email?.trim();
  return correo ? { tipo: "email", valor: correo } : null;
}
