"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";

// El stock del almacén (migración 0117). Las reglas —quién puede, qué serie se
// acepta, a qué estado puede pasar cada máquina— viven en la base. Desde la
// 0585 el almacén sigue al pedido: la serie registrada en un pedido reserva la
// máquina, quitarla la libera y la salida la despacha.

export interface ResultadoCarga {
  error: string | null;
  cargadas?: number;
  repetidas?: string[];
  invalidas?: string[];
}

const limpiar = (m: string) => m.replace(/^.*?:\s*(?=[A-ZÁÉÍÓÚÑ¿])/, "");

function revalidarAlmacen() {
  revalidatePath("/operaciones/stock");
  revalidatePath("/operaciones/catalogo");
  revalidatePath("/comercial/stock");
}

/**
 * Carga varias máquinas de una vez, pegando la lista de series.
 *
 * Así es como llega el stock: en una columna de Excel. Un formulario por
 * máquina, con cuarenta máquinas, es la forma segura de que el inventario no se
 * cargue nunca.
 */
export async function cargarSeries(
  productoId: string,
  seriesTexto: string,
  ubicacion: string | null,
): Promise<ResultadoCarga> {
  const series = seriesTexto
    .split(/[\n,;\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (series.length === 0) return { error: "Pegue al menos un número de serie" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cargar_series_inventario", {
    p_producto: productoId,
    p_series: series,
    p_ubicacion: ubicacion,
    p_nota: null,
  });
  if (error) return { error: limpiar(error.message) };

  const r = (data ?? {}) as { cargadas?: number; repetidas?: string[]; invalidas?: string[] };
  revalidarAlmacen();
  return { error: null, cargadas: r.cargadas ?? 0, repetidas: r.repetidas ?? [], invalidas: r.invalidas ?? [] };
}

export async function moverEquipo(
  id: string,
  estado: "disponible" | "reservado" | "despachado" | "baja",
  cuentaId: string | null,
): Promise<{ error: string | null; serie?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mover_equipo_inventario", {
    p_id: id,
    p_estado: estado,
    p_cuenta: cuentaId,
    p_nota: null,
  });
  if (error) return { error: limpiar(error.message) };
  revalidarAlmacen();
  return { error: null, serie: (data as { serie?: string })?.serie };
}

/** De qué empresa es cada máquina: OPEN o EFAMEINSA (Carlos 22-10: «tiene que estar el nombre, si pertenece a Open o Efameinsa»). */
export async function ponerEmpresa(ids: string[], empresa: "OPEN" | "EFAMEINSA" | null): Promise<{ error: string | null }> {
  const perfil = await requerirPerfil();
  if (!(["operaciones", "gerencia", "admin"].includes(perfil.rol) || perfil.es_operaciones)) return { error: "La empresa de cada máquina la pone operaciones" };
  if (ids.length === 0) return { error: "Elija al menos una máquina" };
  const supabase = await createClient();
  const { error } = await supabase.from("inventario_equipos").update({ empresa }).in("id", ids);
  if (error) return { error: limpiar(error.message) };
  revalidarAlmacen();
  return { error: null };
}

export interface SerieDisponible {
  id: string;
  serie: string;
  codigo: string | null;
  marca: string | null;
  modelo: string;
  descripcion: string;
  ubicacion: string | null;
  ingreso: string;
  empresa: string | null;
}

/**
 * Las máquinas disponibles del almacén, para elegir una desde el pedido en vez
 * de escribir la serie a mano (Carlos 22-10: «en lugar de sube, le pone un
 * check para que le dé esta serie al pedido de la Central»).
 */
export async function seriesDisponibles(): Promise<{ error: string | null; series?: SerieDisponible[] }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventario_equipos")
    .select("id, serie, ubicacion, ingreso_at, modelo, descripcion, empresa, productos(sku, marca, modelo, nombre)")
    .eq("estado", "disponible")
    .order("ingreso_at", { ascending: true })
    .limit(1000);
  if (error) return { error: limpiar(error.message) };
  type Fila = {
    id: string; serie: string; ubicacion: string | null; ingreso_at: string; modelo: string | null; descripcion: string | null; empresa: string | null;
    productos: { sku: string | null; marca: string | null; modelo: string | null; nombre: string } | { sku: string | null; marca: string | null; modelo: string | null; nombre: string }[] | null;
  };
  const series = ((data ?? []) as unknown as Fila[]).map((f) => {
    const p = Array.isArray(f.productos) ? f.productos[0] : f.productos;
    return {
      id: f.id,
      serie: f.serie,
      codigo: p?.sku ?? null,
      marca: p?.marca ?? null,
      modelo: f.modelo ?? p?.modelo ?? "",
      descripcion: f.descripcion ?? p?.nombre ?? "",
      ubicacion: f.ubicacion,
      ingreso: f.ingreso_at,
      empresa: f.empresa,
    };
  });
  return { error: null, series };
}

// ------------------------------------------------------------ lo que está por llegar (0586)

export interface Proyeccion {
  id: string;
  codigo: string | null;
  descripcion: string;
  cantidad: number;
  fechaEstimada: string | null;
  proveedor: string | null;
  referencia: string | null;
  nota: string | null;
  estado: "en_camino" | "llego" | "cancelada";
}

async function soloOperaciones(): Promise<string | null> {
  const perfil = await requerirPerfil();
  if (["operaciones", "gerencia", "admin"].includes(perfil.rol) || perfil.es_operaciones) return null;
  return "Lo que está por llegar lo anota operaciones (Lesly) con lo que le pasa Importaciones.";
}

/**
 * Carlos (22-10): «quiero ver la proyección de lo que está llegando… con fecha…
 * que no se sume a los totales». Lesly lo anota con lo que le pasa Importaciones.
 */
export async function guardarProyeccion(datos: {
  codigo: string;
  descripcion: string;
  cantidad: number;
  fechaEstimada: string | null;
  proveedor: string | null;
  referencia: string | null;
  nota: string | null;
}): Promise<{ error: string | null }> {
  const sinPermiso = await soloOperaciones();
  if (sinPermiso) return { error: sinPermiso };
  const descripcion = datos.descripcion.trim();
  const codigo = datos.codigo.trim().toUpperCase() || null;
  if (!descripcion && !codigo) return { error: "Escriba el código o qué equipo viene" };
  if (!Number.isInteger(datos.cantidad) || datos.cantidad <= 0) return { error: "¿Cuántas unidades vienen?" };
  const supabase = await createClient();
  let productoId: string | null = null;
  let descripcionFinal = descripcion;
  if (codigo) {
    const { data: p } = await supabase.from("productos").select("id, nombre").ilike("sku", codigo).maybeSingle();
    productoId = p?.id ?? null;
    if (!descripcionFinal) descripcionFinal = p?.nombre ?? codigo;
  }
  const { error } = await supabase.from("stock_proyectado").insert({
    producto_id: productoId,
    codigo,
    descripcion: descripcionFinal,
    cantidad: datos.cantidad,
    fecha_estimada: datos.fechaEstimada || null,
    proveedor: datos.proveedor?.trim() || null,
    referencia: datos.referencia?.trim() || null,
    nota: datos.nota?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };
  revalidarAlmacen();
  return { error: null };
}

export async function marcarProyeccion(id: string, estado: Proyeccion["estado"]): Promise<{ error: string | null }> {
  const sinPermiso = await soloOperaciones();
  if (sinPermiso) return { error: sinPermiso };
  const supabase = await createClient();
  const { error } = await supabase
    .from("stock_proyectado")
    .update({ estado, llego_at: estado === "llego" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { error: limpiar(error.message) };
  revalidarAlmacen();
  return { error: null };
}

/**
 * El cotejo del catálogo con el almacén (Carlos 22-10: «¿ya se actualizó el stock
 * que había en el CRM con esto?»): los equipos que no vinieron en el Excel dejan
 * de mostrar la cifra vieja «(ref.)». Se corre solo al subir, y a mano desde aquí.
 */
export async function cotejarCatalogo(): Promise<{ error: string | null; puestosEnCero?: number }> {
  const sinPermiso = await soloOperaciones();
  if (sinPermiso) return { error: sinPermiso };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("catalogo_cotejar_con_almacen");
  if (error) return { error: limpiar(error.message) };
  revalidarAlmacen();
  return { error: null, puestosEnCero: (data as { puestos_en_cero?: number })?.puestos_en_cero ?? 0 };
}
