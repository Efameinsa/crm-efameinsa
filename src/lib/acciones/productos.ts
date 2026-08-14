"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function crearProducto(formData: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const marca = String(formData.get("marca") ?? "").trim();
  const modelo = String(formData.get("modelo") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const segmento = String(formData.get("segmento") ?? "");
  const categoria = String(formData.get("categoria") ?? "").trim() || null;
  const capacidad = String(formData.get("capacidad") ?? "").trim() || null;

  if (!marca || !modelo || !nombre) return { error: "Marca, modelo y nombre son obligatorios" };
  if (segmento !== "industrial" && segmento !== "semi_industrial") {
    return { error: "Segmento inválido" };
  }

  const { data: producto, error } = await supabase
    .from("productos")
    .insert({ marca, modelo, nombre, segmento, categoria, capacidad })
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
