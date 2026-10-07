/**
 * Lo que no toca la base del directorio (0410): las áreas cuyos avisos se
 * mandan por correo y a qué correo va cada uno. Aparte para que lo use también
 * la pantalla, sin arrastrar el cliente de servidor.
 */
export type AreaDeAviso = "finanzas" | "almacen" | "postventa" | "central";
export type Empresa = "EFAMEINSA" | "OPEN";

export const AREAS_DE_AVISO: { clave: AreaDeAviso; etiqueta: string }[] = [
  { clave: "finanzas", etiqueta: "Finanzas" },
  { clave: "almacen", etiqueta: "Almacén" },
  { clave: "postventa", etiqueta: "Postventa" },
  { clave: "central", etiqueta: "Central" },
];

export interface FilaDirectorio {
  nombre: string;
  correo_efameinsa: string | null;
  correo_open: string | null;
  avisos: string[] | null;
  activo?: boolean | null;
}

export interface Destinatario {
  nombre: string;
  correo: string;
  /** Por cuál de las áreas pedidas le toca (la primera que tenga marcada). */
  area: AreaDeAviso;
}

/** Quiénes reciben el aviso de esas áreas, con su correo en la empresa del pedido. Sin repetir. */
export function destinatariosDelArea(filas: FilaDirectorio[], areas: AreaDeAviso[], empresa: Empresa): Destinatario[] {
  const vistos = new Map<string, Destinatario>();
  for (const f of filas) {
    if (f.activo === false) continue;
    const area = areas.find((a) => (f.avisos ?? []).includes(a));
    if (!area) continue;
    const propio = empresa === "OPEN" ? f.correo_open : f.correo_efameinsa;
    const otro = empresa === "OPEN" ? f.correo_efameinsa : f.correo_open;
    const correo = (propio?.trim() || otro?.trim() || "").toLowerCase();
    if (correo.includes("@") && !vistos.has(correo)) vistos.set(correo, { nombre: f.nombre, correo, area });
  }
  return [...vistos.values()];
}

/** Los correos a los que va el aviso de esas áreas, en la empresa del pedido. Sin repetir. */
export function correosDelArea(filas: FilaDirectorio[], areas: AreaDeAviso[], empresa: Empresa): string[] {
  return destinatariosDelArea(filas, areas, empresa).map((d) => d.correo);
}

/**
 * A QUIÉN SE PUEDE ESCRIBIR DESDE EL CRM A MANO: solo a direcciones de la
 * empresa. El botón «Enviar por correo» de la apertura es interno (la apertura
 * va al almacén y a Finanzas); lo que se le manda al cliente lo envía postventa
 * desde su correo (Carlos, 09-09), así que una dirección de afuera se rechaza.
 */
const DOMINIOS_PROPIOS = ["efameinsa.com", "openinvestments.com.pe"];
const CORREOS_EXTRA = ["corporacionefameinsa.sa@gmail.com"];

export function esCorreoDeLaEmpresa(correo: string): boolean {
  const c = correo.trim().toLowerCase();
  if (!/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,}$/.test(c)) return false;
  return CORREOS_EXTRA.includes(c) || DOMINIOS_PROPIOS.includes(c.split("@")[1]);
}
