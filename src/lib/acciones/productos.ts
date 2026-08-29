"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { bloquesATexto, textoABloques, type BloqueFicha } from "@/lib/ficha-texto";

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
  /** Las tres casillas del encabezado que viven dentro de la ficha y no en la
   *  tabla de productos: son columnas de la hoja técnica, no datos sueltos. */
  calentamiento: string | null;
  panel: string | null;
  controles: string | null;
  montaje: string | null;
  colores: string[];
  /** La descripción impresa, en el texto de la pantalla. */
  fichaTexto: string;
}

/** Arma la ficha nueva SOBRE la que ya estaba, sin perder lo que no se edita. */
function mezclarFicha(anterior: Record<string, unknown>, datos: DatosEquipo) {
  return {
    ...anterior,
    bloques: textoABloques(datos.fichaTexto),
    calentamiento: datos.calentamiento?.trim() || null,
    panel: datos.panel?.trim() || null,
    controles: datos.controles?.trim() || null,
    montaje: datos.montaje?.trim() || null,
    colores: datos.colores.map((c) => c.trim()).filter(Boolean),
  };
}

function revisar(datos: DatosEquipo): string | null {
  if (datos.nombre.trim().length < 3) return "El nombre necesita al menos tres letras";
  if (datos.marca.trim() === "" || datos.modelo.trim() === "") return "Marca y modelo son obligatorios";
  return null;
}

export async function guardarEquipo(id: string, datos: DatosEquipo): Promise<{ error: string | null }> {
  const mal = revisar(datos);
  if (mal) return { error: mal };

  const supabase = await createClient();
  const { data: actual } = await supabase.from("productos").select("ficha").eq("id", id).maybeSingle();
  if (!actual) return { error: "Ese equipo ya no está en el catálogo" };

  const ficha = mezclarFicha((actual.ficha ?? {}) as Record<string, unknown>, datos);
  if ((ficha.bloques as unknown[]).length === 0) {
    return { error: "La ficha no puede quedar vacía: es lo que sale impreso" };
  }

  const { error } = await supabase
    .from("productos")
    .update({
      nombre: datos.nombre.trim(),
      marca: datos.marca.trim(),
      modelo: datos.modelo.trim(),
      sku: datos.sku?.trim().toUpperCase() || null,
      categoria: datos.categoria?.trim() || null,
      capacidad: datos.capacidad?.trim() || null,
      segmento: datos.segmento,
      activo: datos.activo,
      ficha,
    })
    .eq("id", id);

  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };
  revalidatePath("/operaciones/catalogo");
  return { error: null };
}

/**
 * Cargar un equipo nuevo con LA MISMA HOJA con la que se corrige uno existente
 * (pedido del 28-08). Antes eran dos formularios distintos —uno para crear, con
 * los cuatro cajones viejos, y otro para editar—, y dos formas de escribir la
 * misma ficha es la manera segura de que las fichas nuevas salgan distintas de
 * las que ya están.
 */
export async function crearEquipoDesdeFicha(
  datos: DatosEquipo,
  precioBase: number | null,
): Promise<{ error: string | null; id?: string }> {
  const mal = revisar(datos);
  if (mal) return { error: mal };

  const supabase = await createClient();
  const ficha = mezclarFicha({}, datos);
  if ((ficha.bloques as unknown[]).length === 0) {
    return { error: "Escriba la ficha: sin ella la cotización sale con la hoja técnica vacía" };
  }

  const { data, error } = await supabase
    .from("productos")
    .insert({
      nombre: datos.nombre.trim(),
      marca: datos.marca.trim(),
      modelo: datos.modelo.trim(),
      sku: datos.sku?.trim().toUpperCase() || null,
      categoria: datos.categoria?.trim() || null,
      capacidad: datos.capacidad?.trim() || null,
      segmento: datos.segmento,
      activo: datos.activo,
      ficha,
    })
    .select("id")
    .single();
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  if (precioBase && precioBase > 0) {
    const tier = datos.segmento === "semi_industrial" ? "optimo" : "base";
    const { error: ep } = await supabase.rpc("fijar_precio_producto", {
      p_producto: data.id,
      p_tier: tier,
      p_precio: precioBase,
    });
    if (ep) return { error: "El equipo se creó, pero el precio no: " + ep.message };
  }

  revalidatePath("/operaciones/catalogo");
  return { error: null, id: data.id as string };
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

/**
 * Guardar la ruta de la foto recién subida (migración 0121).
 *
 * El archivo lo sube el navegador directo al almacenamiento —ya acomodado a la
 * caja de la ficha y comprimido, ver `foto-producto.ts`—; acá solo queda dejar
 * dicho en el equipo dónde está. Se guarda con el prefijo «storage:» para que
 * el PDF sepa de dónde leerla: sin prefijo son las 296 que vinieron con el
 * proyecto, en `public/productos/`.
 */
export async function fijarFotoProducto(id: string, ruta: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("productos").update({ foto_path: `storage:${ruta}` }).eq("id", id);
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };
  revalidatePath("/operaciones/catalogo");
  return { error: null };
}

/**
 * La ficha de un equipo del catálogo, para usarla de referencia al cargar uno
 * nuevo (28-08: «debe salir un producto de referencia, o sea toda esa ventana
 * ya llenada, para que el gestor solo edite las letras que ya están»).
 *
 * Se elige el equipo del tipo pedido con la ficha MÁS COMPLETA: es el que menos
 * le falta por escribir a quien está cargando. No se copia el código ni la foto
 * —esos son de la máquina, no de la plantilla— y el nombre, la marca y el
 * modelo vienen para reemplazarse, no para dejarse.
 */
export async function fichaDeReferencia(categoria: string): Promise<{
  error: string | null;
  referencia?: {
    de: string;
    nombre: string;
    marca: string;
    modelo: string;
    capacidad: string | null;
    segmento: "industrial" | "semi_industrial";
    calentamiento: string | null;
    panel: string | null;
    controles: string | null;
    montaje: string | null;
    colores: string[];
    fichaTexto: string;
  };
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("productos")
    .select("nombre, marca, modelo, capacidad, segmento, ficha")
    .eq("activo", true)
    .eq("categoria", categoria)
    .limit(40);

  const candidatos = (data ?? [])
    .map((p) => {
      const ficha = (p.ficha ?? {}) as Record<string, unknown>;
      const bloques = Array.isArray(ficha.bloques) ? (ficha.bloques as BloqueFicha[]) : [];
      return { p, ficha, bloques };
    })
    .filter((c) => c.bloques.length > 0)
    .sort((a, b) => b.bloques.length - a.bloques.length);

  const mejor = candidatos[0];
  if (!mejor) return { error: "Todavía no hay ningún equipo de ese tipo para usar de referencia" };

  const texto = (k: string) =>
    typeof mejor.ficha[k] === "string" && mejor.ficha[k] ? (mejor.ficha[k] as string) : null;

  return {
    error: null,
    referencia: {
      de: `${mejor.p.marca} ${mejor.p.modelo}`,
      nombre: mejor.p.nombre as string,
      marca: mejor.p.marca as string,
      modelo: mejor.p.modelo as string,
      capacidad: (mejor.p.capacidad as string | null) ?? null,
      segmento: mejor.p.segmento as "industrial" | "semi_industrial",
      calentamiento: texto("calentamiento"),
      panel: texto("panel"),
      controles: texto("controles"),
      montaje: texto("montaje"),
      colores: Array.isArray(mejor.ficha.colores)
        ? (mejor.ficha.colores as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      fichaTexto: bloquesATexto(mejor.bloques),
    },
  };
}

/**
 * Quitar un equipo del catálogo.
 *
 * BORRAR NO SIEMPRE SE PUEDE, y es mejor decirlo que dejar que la base lo
 * rechace con su propio idioma. Si el equipo ya se cotizó alguna vez, sus
 * líneas viven dentro de cotizaciones que se le mandaron a clientes: borrarlo
 * dejaría esas cotizaciones sin qué imprimir. En ese caso no se borra, se
 * apaga —«fuera del catálogo»— que es lo que de verdad se quiere: que el
 * comercial deje de encontrarlo.
 */
export async function eliminarEquipo(id: string): Promise<{ error: string | null; apagado?: boolean }> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("cotizacion_items")
    .select("id", { count: "exact", head: true })
    .eq("producto_id", id);

  if ((count ?? 0) > 0) {
    const { error } = await supabase.from("productos").update({ activo: false }).eq("id", id);
    if (error) return { error: error.message.replace(/^.*?:\s*/, "") };
    revalidatePath("/operaciones/catalogo");
    return {
      error: null,
      apagado: true,
    };
  }

  // Los precios cuelgan del equipo y no tienen sentido sin él.
  await supabase.from("precios_producto").delete().eq("producto_id", id);
  const { error } = await supabase.from("productos").delete().eq("id", id);
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };
  revalidatePath("/operaciones/catalogo");
  return { error: null, apagado: false };
}

/** Cuántas veces se cotizó este equipo: decide si se puede borrar o solo apagar. */
export async function vecesCotizado(id: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("cotizacion_items")
    .select("id", { count: "exact", head: true })
    .eq("producto_id", id);
  return count ?? 0;
}
