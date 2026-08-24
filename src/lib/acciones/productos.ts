"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
