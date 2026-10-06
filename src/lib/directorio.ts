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

/** Los correos a los que va el aviso de esas áreas, en la empresa del pedido. Sin repetir. */
export function correosDelArea(filas: FilaDirectorio[], areas: AreaDeAviso[], empresa: Empresa): string[] {
  const vistos = new Set<string>();
  for (const f of filas) {
    if (f.activo === false) continue;
    if (!(f.avisos ?? []).some((a) => areas.includes(a as AreaDeAviso))) continue;
    const propio = empresa === "OPEN" ? f.correo_open : f.correo_efameinsa;
    const otro = empresa === "OPEN" ? f.correo_efameinsa : f.correo_open;
    const correo = (propio?.trim() || otro?.trim() || "").toLowerCase();
    if (correo.includes("@")) vistos.add(correo);
  }
  return [...vistos];
}
