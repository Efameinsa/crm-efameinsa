import { tipoEquipo } from "./stock-importaciones";

/**
 * EL «RESUMEN GENERAL DE STOCK», COMO LO ARMA IMPORTACIONES (reunión Santos–Lesly, 22-10-2026).
 *
 * Importaciones entregaba todos los lunes a las comerciales un informe impreso:
 * «está separado por proveedor… primero Primus, luego viene Unimac; todo lo que
 * es lavadora, luego separa por secadoras; luego viene GMP y así sucesivamente».
 * Cada proveedor con su total («TOTAL EQUIPOS ALLIANCE 106»). Y el de LG aparte,
 * consolidado por modelo con los totales («la SMG me dijo que se tiene que
 * consolidar o mostrar los totales por modelo»).
 *
 * Lesly: «todo lo que hemos subido debe salir así… dos documentos». Desde ahora
 * lo arma el CRM con lo que hay en el almacén: ella sube su Excel cada semana y
 * el informe sale solo. Este archivo solo ordena y agrupa; no toca la base ni
 * sabe de costos.
 */

export interface FilaStockGeneral {
  /** El código interno de Importaciones (I25014). */
  item: string | null;
  /** El código del catálogo del CRM (LAV2801). */
  codigo: string | null;
  modelo: string;
  descripcion: string;
  serie: string | null;
  /** 1 por máquina con serie; las piezas sin serie (mesas, coches) traen su cantidad. */
  cantidad: number;
  ubicacion: string | null;
  marca: string | null;
  proveedor: string | null;
  esLg: boolean;
}

const mayus = (t: unknown) => String(t ?? "").trim().toUpperCase().replace(/\s+/g, " ");

const MARCAS_ALLIANCE = ["PRIMUS", "UNIMAC", "SPEED QUEEN", "HUEBSCH", "IPSO"];

/** ALLIANCE, GMP, SAILSTAR, SIDI MONDIAL… El nombre con el que Importaciones titula cada hoja. */
export function proveedorDe(f: Pick<FilaStockGeneral, "proveedor" | "marca">): string {
  const p = mayus(f.proveedor);
  const m = mayus(f.marca);
  if (/ALLIANCE/.test(p) || (!p && MARCAS_ALLIANCE.includes(m))) return "ALLIANCE";
  if (p === "GM" || m === "GM") return "GMP";
  if (p) return p;
  return m || "OTROS";
}

/** PRIMUS, UNIMAC… con el error de tipeo «GM» corregido. */
export function marcaDe(f: Pick<FilaStockGeneral, "marca" | "esLg" | "proveedor">): string {
  const m = mayus(f.marca);
  if (m === "GM") return "GMP";
  if (m) return m;
  return f.esLg ? "LG" : mayus(f.proveedor) || "—";
}

export function disponibleDe(f: Pick<FilaStockGeneral, "ubicacion">): string {
  return mayus(f.ubicacion) || "PLANTA";
}

export const esExhibicion = (f: Pick<FilaStockGeneral, "ubicacion">) => /EXHIB/i.test(f.ubicacion ?? "");

const ORDEN_PROVEEDORES = ["ALLIANCE", "GMP", "SAILSTAR", "SIDI MONDIAL"];
const ORDEN_TIPOS = ["lavadora", "secadora", "rodillo", "prensa", "mesa de planchado", "calderín", "coche", "equipo"];
const TITULO_TIPO: Record<string, string> = {
  lavadora: "LAVADORAS",
  secadora: "SECADORAS",
  rodillo: "RODILLOS PLANCHADORES / CALANDRIAS",
  prensa: "PRENSAS",
  "mesa de planchado": "MESAS DE PLANCHADO",
  "calderín": "CALDERINES",
  coche: "COCHES Y CARROS",
  equipo: "OTROS EQUIPOS",
};

const tipoDe = (f: FilaStockGeneral) => tipoEquipo(`${f.descripcion} ${f.modelo}`);

function ordenar<T>(lista: T[], claves: ((x: T) => string | number)[]): T[] {
  return [...lista].sort((a, b) => {
    for (const k of claves) {
      const va = k(a);
      const vb = k(b);
      if (va === vb) continue;
      if (typeof va === "number" && typeof vb === "number") return va - vb;
      return String(va).localeCompare(String(vb), "es", { numeric: true });
    }
    return 0;
  });
}

const posicion = (orden: string[], v: string) => {
  const i = orden.indexOf(v);
  return i < 0 ? orden.length : i;
};

export const unidades = (filas: Pick<FilaStockGeneral, "serie" | "cantidad">[]) => filas.reduce((a, f) => a + (f.serie ? 1 : f.cantidad), 0);

/** Una pieza sin serie y con cantidad 0 (el Excel la lista aunque no quede ninguna) no es stock. */
const hayStock = (f: Pick<FilaStockGeneral, "serie" | "cantidad">) => !!f.serie || f.cantidad > 0;

// ------------------------------------------------------------ industriales

export interface SeccionIndustrial {
  titulo: string;
  filas: FilaStockGeneral[];
  total: number;
}

export interface BloqueProveedor {
  proveedor: string;
  secciones: SeccionIndustrial[];
  total: number;
}

/** Proveedor → tipo → máquinas (marca, modelo, ítem, serie), con totales. */
export function armarIndustriales(filas: FilaStockGeneral[]): { bloques: BloqueProveedor[]; total: number } {
  const porProveedor = new Map<string, FilaStockGeneral[]>();
  for (const f of filas) {
    if (f.esLg || !hayStock(f)) continue;
    const p = proveedorDe(f);
    porProveedor.set(p, [...(porProveedor.get(p) ?? []), f]);
  }
  const bloques: BloqueProveedor[] = ordenar([...porProveedor.keys()], [(p) => posicion(ORDEN_PROVEEDORES, p), (p) => p]).map((proveedor) => {
    const porTipo = new Map<string, FilaStockGeneral[]>();
    for (const f of porProveedor.get(proveedor)!) {
      const t = tipoDe(f);
      porTipo.set(t, [...(porTipo.get(t) ?? []), f]);
    }
    const secciones = ordenar([...porTipo.keys()], [(t) => posicion(ORDEN_TIPOS, t), (t) => t]).map((tipo) => {
      const fs = ordenar(porTipo.get(tipo)!, [(f) => marcaDe(f), (f) => f.modelo, (f) => f.item ?? "", (f) => f.serie ?? ""]);
      return { titulo: TITULO_TIPO[tipo] ?? tipo.toUpperCase(), filas: fs, total: unidades(fs) };
    });
    return { proveedor, secciones, total: secciones.reduce((a, s) => a + s.total, 0) };
  });
  return { bloques, total: bloques.reduce((a, b) => a + b.total, 0) };
}

// ------------------------------------------------------------ LG

const SISTEMA_LG = /\bC[WD][GT]\d\dM[A-Z]{3}S\b/g;

/** «TITAN LIGHT STACK LOWER» / «TITAN MAX SINGLE», como en la hoja de Importaciones. */
export function etiquetaModeloLg(f: Pick<FilaStockGeneral, "modelo" | "descripcion">): string {
  const base = mayus(f.modelo).replace(SISTEMA_LG, "").replace(/\s+/g, " ").trim() || "LG";
  const d = mayus(f.descripcion);
  const apilable = /APIL/.test(d) && !/NO\s+APIL/.test(d);
  return `${base} ${apilable ? "STACK LOWER" : "SINGLE"}`;
}

export interface ModeloLg {
  modelo: string;
  codigo: string | null;
  descripcion: string;
  stock: number;
  series: string[];
}

export interface SeccionLg {
  titulo: string;
  modelos: ModeloLg[];
  total: number;
}

const TITULO_LG: Record<string, string> = {
  secadora: "SECADORA SEMI INDUSTRIAL",
  lavadora: "LAVADORA SEMI INDUSTRIAL",
};

function consolidar(filas: FilaStockGeneral[]): ModeloLg[] {
  const mapa = new Map<string, ModeloLg>();
  for (const f of filas) {
    const modelo = etiquetaModeloLg(f);
    const clave = f.codigo ?? modelo;
    const m = mapa.get(clave) ?? { modelo, codigo: f.codigo, descripcion: f.descripcion, stock: 0, series: [] };
    m.stock += f.serie ? 1 : f.cantidad;
    if (f.serie) m.series.push(f.serie);
    mapa.set(clave, m);
  }
  return ordenar([...mapa.values()], [(m) => m.modelo, (m) => m.codigo ?? ""]);
}

/** Secadoras y lavadoras consolidadas por modelo, y la exhibición aparte (no se cuenta dos veces). */
export function armarLg(filas: FilaStockGeneral[]): { secciones: SeccionLg[]; total: number } {
  const lg = filas.filter((f) => f.esLg && hayStock(f));
  const porTipo = new Map<string, FilaStockGeneral[]>();
  for (const f of lg) {
    const t = esExhibicion(f) ? "exhibición" : tipoDe(f);
    porTipo.set(t, [...(porTipo.get(t) ?? []), f]);
  }
  const orden = ["secadora", "lavadora"];
  const claves = ordenar([...porTipo.keys()].filter((t) => t !== "exhibición"), [(t) => posicion(orden, t), (t) => t]);
  const secciones: SeccionLg[] = claves.map((t) => {
    const modelos = consolidar(porTipo.get(t)!);
    return { titulo: TITULO_LG[t] ?? `${t.toUpperCase()} LG`, modelos, total: modelos.reduce((a, m) => a + m.stock, 0) };
  });
  const exhib = porTipo.get("exhibición");
  if (exhib?.length) {
    const modelos = consolidar(exhib);
    secciones.push({ titulo: "EXHIBICIÓN EQUIPOS LG", modelos, total: modelos.reduce((a, m) => a + m.stock, 0) });
  }
  return { secciones, total: secciones.reduce((a, s) => a + s.total, 0) };
}
