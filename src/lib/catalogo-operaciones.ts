import type { createClient } from "@/lib/supabase/server";

/**
 * El catálogo visto por quien lo mantiene.
 *
 * La pantalla de productos que existía listaba los activos y sus precios, y ya.
 * Para vender alcanza; para MANTENERLO no, porque las tres preguntas de quien
 * lo cuida no se contestan mirando una tabla:
 *
 *   · ¿Encuentra el comercial lo que va a cotizar? — se contesta buscando con
 *     el mismo buscador que usa él, no leyendo una lista alfabética.
 *   · ¿Sale bien impreso? — se contesta viendo el PDF, no la fila.
 *   · ¿Qué está incompleto o escrito de dos formas? — no se ve nunca, porque lo
 *     que falta no aparece en una lista de lo que hay.
 *
 * Esto arma lo necesario para las tres.
 */

export interface EquipoCatalogo {
  id: string;
  sku: string | null;
  marca: string;
  modelo: string;
  nombre: string;
  categoria: string | null;
  segmento: "industrial" | "semi_industrial";
  capacidad: string | null;
  activo: boolean;
  fotoPath: string | null;
  /** De la ficha, que es donde vive el vocabulario con el que se pide el equipo. */
  calentamiento: string | null;
  montaje: string | null;
  panel: string | null;
  descripcion: string | null;
  colores: string[];
  caracteristicas: number;
  tieneFicha: boolean;
  precios: { tier: string; precio: number }[];
  /** Cuántas hay en el almacén (0117); null si ese modelo todavía no se cargó. */
  disponibles: number | null;
}

export interface SaludCatalogo {
  activos: number;
  inactivos: number;
  sinPrecio: number;
  sinFicha: number;
  sinFoto: number;
  /** «lavadora» y «Lavadora» conviviendo: dos categorías donde hay una. */
  categoriasRepetidas: { normalizada: string; formas: string[]; equipos: number }[];
  /** Cuántos equipos tienen cada tier de precio cargado. */
  porTier: { tier: string; n: number }[];
}

function texto(ficha: Record<string, unknown> | null, clave: string): string | null {
  const v = ficha?.[clave];
  return typeof v === "string" && v ? v : null;
}

function lista(ficha: Record<string, unknown> | null, clave: string): string[] {
  const v = ficha?.[clave];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function cargarCatalogo(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ equipos: EquipoCatalogo[]; salud: SaludCatalogo }> {
  // Se piden TODOS, incluidos los inactivos: un equipo apagado por error es
  // invisible para el comercial y hasta hoy también lo era para quien podría
  // volver a prenderlo.
  const [{ data }, { data: stock }] = await Promise.all([
    supabase
    .from("productos")
    .select("id, sku, marca, modelo, nombre, categoria, segmento, capacidad, activo, foto_path, ficha, precios_producto(tier, precio, vigente_hasta)")
    .order("marca")
    .order("modelo"),
    supabase.rpc("stock_por_producto"),
  ]);
  const enAlmacen = new Map<string, number>(
    ((stock ?? []) as { producto_id: string; disponibles: number }[]).map((x) => [x.producto_id, x.disponibles]),
  );

  const equipos: EquipoCatalogo[] = (data ?? []).map((p) => {
    const ficha = (p.ficha ?? null) as Record<string, unknown> | null;
    const precios = ((p.precios_producto ?? []) as { tier: string; precio: number; vigente_hasta: string | null }[])
      .filter((x) => x.vigente_hasta === null)
      .map((x) => ({ tier: x.tier, precio: Number(x.precio) }));
    return {
      id: p.id as string,
      sku: (p.sku as string | null) ?? null,
      marca: p.marca as string,
      modelo: p.modelo as string,
      nombre: p.nombre as string,
      categoria: (p.categoria as string | null) ?? null,
      segmento: p.segmento as "industrial" | "semi_industrial",
      capacidad: (p.capacidad as string | null) ?? null,
      activo: Boolean(p.activo),
      fotoPath: (p.foto_path as string | null) ?? null,
      calentamiento: texto(ficha, "calentamiento"),
      montaje: texto(ficha, "montaje"),
      panel: texto(ficha, "panel"),
      descripcion: texto(ficha, "descripcion"),
      colores: lista(ficha, "colores"),
      caracteristicas: lista(ficha, "caracteristicas").length + lista(ficha, "dimensiones").length,
      tieneFicha: ficha != null && Object.keys(ficha).length > 0,
      precios,
      disponibles: enAlmacen.has(p.id as string) ? (enAlmacen.get(p.id as string) ?? 0) : null,
    };
  });

  const activos = equipos.filter((e) => e.activo);

  // Categorías escritas de dos formas. Es el error que más caro sale: parte el
  // catálogo en dos montones que ningún filtro vuelve a juntar.
  const porCategoria = new Map<string, { formas: Set<string>; equipos: number }>();
  for (const e of activos) {
    if (!e.categoria) continue;
    const clave = e.categoria.toLowerCase();
    const x = porCategoria.get(clave) ?? { formas: new Set<string>(), equipos: 0 };
    x.formas.add(e.categoria);
    x.equipos += 1;
    porCategoria.set(clave, x);
  }

  const tiers = new Map<string, number>();
  for (const e of activos) for (const p of e.precios) tiers.set(p.tier, (tiers.get(p.tier) ?? 0) + 1);

  return {
    equipos,
    salud: {
      activos: activos.length,
      inactivos: equipos.length - activos.length,
      sinPrecio: activos.filter((e) => e.precios.length === 0).length,
      sinFicha: activos.filter((e) => !e.tieneFicha).length,
      sinFoto: activos.filter((e) => !e.fotoPath).length,
      categoriasRepetidas: [...porCategoria.entries()]
        .filter(([, x]) => x.formas.size > 1)
        .map(([normalizada, x]) => ({ normalizada, formas: [...x.formas], equipos: x.equipos })),
      porTier: [...tiers.entries()].map(([tier, n]) => ({ tier, n })).sort((a, b) => b.n - a.n),
    },
  };
}
