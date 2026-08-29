import { redirect } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { InventarioAlmacen, type ModeloStock } from "@/components/crm/inventario-almacen";

export const dynamic = "force-dynamic";

/**
 * El almacén (migración 0117).
 *
 * «Cuántas máquinas hay disponibles de cada modelo, con su número de serie,
 * para saber si se puede prometer entrega inmediata al cotizar» (28-08).
 *
 * Se arma sobre el catálogo, no aparte: un modelo sin stock también aparece
 * —en cero—, porque «no tengo» es una respuesta tan útil como «tengo tres», y
 * un almacén que solo lista lo que hay obliga a buscar en dos sitios para
 * contestar una sola pregunta.
 */
export default async function InventarioPage() {
  const perfil = await requerirPerfil();
  if (!["operaciones", "gerencia", "admin"].includes(perfil.rol)) redirect("/comercial");

  const supabase = await createClient();
  const [{ data: productos }, { data: maquinas }] = await Promise.all([
    supabase
      .from("productos")
      .select("id, sku, marca, modelo, nombre, capacidad, categoria, segmento, ficha")
      .eq("activo", true)
      .order("marca")
      .order("modelo"),
    supabase
      .from("inventario_equipos")
      .select("id, producto_id, serie, estado, ubicacion, ingreso_at, cuentas:reservado_para(razon_social)")
      .order("serie"),
  ]);

  const porProducto = new Map<string, ModeloStock["maquinas"]>();
  for (const m of maquinas ?? []) {
    const lista = porProducto.get(m.producto_id as string) ?? [];
    lista.push({
      id: m.id as string,
      serie: m.serie as string,
      estado: m.estado as ModeloStock["maquinas"][number]["estado"],
      ubicacion: (m.ubicacion as string | null) ?? null,
      ingresoAt: m.ingreso_at as string,
      reservadoPara: (m.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? null,
    });
    porProducto.set(m.producto_id as string, lista);
  }

  const texto = (ficha: Record<string, unknown> | null, clave: string) =>
    typeof ficha?.[clave] === "string" && ficha[clave] ? (ficha[clave] as string) : null;

  const modelos: ModeloStock[] = (productos ?? []).map((p) => {
    const suyas = porProducto.get(p.id as string) ?? [];
    const ficha = (p.ficha ?? null) as Record<string, unknown> | null;
    return {
      productoId: p.id as string,
      sku: (p.sku as string | null) ?? null,
      marca: p.marca as string,
      modelo: p.modelo as string,
      nombre: p.nombre as string,
      capacidad: (p.capacidad as string | null) ?? null,
      categoria: (p.categoria as string | null) ?? null,
      segmento: p.segmento as "industrial" | "semi_industrial",
      calentamiento: texto(ficha, "calentamiento"),
      montaje: texto(ficha, "montaje"),
      disponibles: suyas.filter((x) => x.estado === "disponible").length,
      reservados: suyas.filter((x) => x.estado === "reservado").length,
      despachados: suyas.filter((x) => x.estado === "despachado").length,
      maquinas: suyas,
    };
  });

  // Los que tienen stock arriba: el almacén se mira para ver qué hay.
  modelos.sort((a, b) => b.disponibles + b.reservados - (a.disponibles + a.reservados));

  return (
    <SeccionPanel titulo="El almacén">
      <InventarioAlmacen modelos={modelos} />
    </SeccionPanel>
  );
}
