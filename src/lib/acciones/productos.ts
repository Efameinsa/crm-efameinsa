"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { textoABloques } from "@/lib/ficha-texto";

/** Una viñeta por línea, que es como se pega desde la ficha en Word. */
function lineas(formData: FormData, campo: string): string[] {
  return String(formData.get(campo) ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-•·*\s]+/, "").trim())
    .filter((l) => l.length > 2);
}

function texto(formData: FormData, campo: string): string | null {
  return String(formData.get(campo) ?? "").trim() || null;
}

export async function crearProducto(formData: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const marca = String(formData.get("marca") ?? "").trim();
  const modelo = String(formData.get("modelo") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const segmento = String(formData.get("segmento") ?? "");
  const categoria = String(formData.get("categoria") ?? "").trim() || null;
  const capacidad = String(formData.get("capacidad") ?? "").trim() || null;
  const sku = String(formData.get("sku") ?? "").trim().toUpperCase() || null;

  if (!marca || !modelo || !nombre) return { error: "Marca, modelo y nombre son obligatorios" };
  if (segmento !== "industrial" && segmento !== "semi_industrial") {
    return { error: "Segmento inválido" };
  }

  // La ficha se escribe acá, copiándola de un equipo parecido y corrigiendo lo
  // que cambia. Es el camino que acordó el ing. Carlos el 24-08 en reemplazo
  // del equipo escrito a mano dentro de la cotización: el equipo entra UNA vez
  // al catálogo, con su ficha, y desde ahí lo cotiza cualquiera. Así la
  // descripción que ve el cliente es siempre la misma y el expediente de
  // contabilidad cuadra (cotización, orden, guía, factura).
  const caracteristicas = lineas(formData, "caracteristicas");
  const dimensiones = lineas(formData, "dimensiones");
  const medidas = lineas(formData, "medidas");

  // Sin características, el PDF sale con la página de especificaciones en
  // blanco — exactamente lo que pasó con la LG TITAN-18 el 24-08.
  if (caracteristicas.length === 0) {
    return { error: "Pegue al menos una característica: sin ficha, la cotización sale con la hoja técnica vacía" };
  }

  const ficha = {
    caracteristicas,
    dimensiones,
    medidas,
    calentamiento: texto(formData, "calentamiento"),
    panel: texto(formData, "panel"),
    controles: texto(formData, "controles"),
  };

  const { data: producto, error } = await supabase
    .from("productos")
    .insert({ sku, marca, modelo, nombre, segmento, categoria, capacidad, ficha })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // Tiers según segmento (R5): semi-industrial 3 niveles, industrial 1 nivel base.
  const tiers = segmento === "semi_industrial" ? (["optimo", "medio", "deseado"] as const) : (["base"] as const);

  for (const tier of tiers) {
    const precio = formData.get(`precio_${tier}`);
    if (precio && Number(precio) > 0) {
      const { error: errorPrecio } = await supabase
        .from("precios_producto")
        .insert({ producto_id: producto.id, tier, precio: Number(precio) });
      if (errorPrecio) return { error: errorPrecio.message };
    }
  }

  revalidatePath("/admin/productos");
  return { error: null };
}

/**
 * Editar un equipo del catálogo (migración 0119).
 *
 * La ficha se guarda MEZCLADA sobre la que ya estaba, no reemplazada: en
 * `ficha` viven además cosas que esta pantalla no toca —las fotos por color de
 * los coches, el orden de las secciones, la marca del maestro, las dos torres
 * lavadora-secadora con su bloque por máquina—. Escribir un objeto nuevo encima
 * borraría todo eso sin avisar.
 */

export interface DatosEquipo {
  nombre: string;
  marca: string;
  modelo: string;
  sku: string | null;
  categoria: string | null;
  capacidad: string | null;
  segmento: "industrial" | "semi_industrial";
  activo: boolean;
  /** La descripción impresa, en el texto de la pantalla. */
  fichaTexto: string;
}

export async function guardarEquipo(id: string, datos: DatosEquipo): Promise<{ error: string | null }> {
  if (datos.nombre.trim().length < 3) return { error: "El nombre necesita al menos tres letras" };
  if (datos.marca.trim() === "" || datos.modelo.trim() === "") return { error: "Marca y modelo son obligatorios" };

  const supabase = await createClient();
  const { data: actual } = await supabase.from("productos").select("ficha").eq("id", id).maybeSingle();
  if (!actual) return { error: "Ese equipo ya no está en el catálogo" };

  const bloques = textoABloques(datos.fichaTexto);
  if (bloques.length === 0) return { error: "La ficha no puede quedar vacía: es lo que sale impreso" };

  const ficha = { ...((actual.ficha ?? {}) as Record<string, unknown>), bloques };

  const { error } = await supabase
    .from("productos")
    .update({
      nombre: datos.nombre.trim(),
      marca: datos.marca.trim(),
      modelo: datos.modelo.trim(),
      sku: datos.sku?.trim() || null,
      categoria: datos.categoria?.trim() || null,
      capacidad: datos.capacidad?.trim() || null,
      segmento: datos.segmento,
      activo: datos.activo,
      ficha,
    })
    .eq("id", id);

  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };
  revalidatePath("/operaciones/catalogo");
  revalidatePath("/operaciones/inventario");
  return { error: null };
}

export async function fijarPrecio(
  productoId: string,
  tier: string,
  precio: number,
): Promise<{ error: string | null; anterior?: number | null; sinCambio?: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fijar_precio_producto", {
    p_producto: productoId,
    p_tier: tier,
    p_precio: precio,
  });
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };
  revalidatePath("/operaciones/catalogo");
  const r = (data ?? {}) as { anterior?: number | null; sin_cambio?: boolean };
  return { error: null, anterior: r.anterior ?? null, sinCambio: Boolean(r.sin_cambio) };
}
