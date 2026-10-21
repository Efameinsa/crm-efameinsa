"use server";

import { revalidatePath } from "next/cache";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  emparejar,
  leerExcelStock,
  rasgos,
  siguienteCodigoLibre,
  type ProductoCatalogo,
  type Propuesta,
  type SerieOcupada,
} from "@/lib/stock-importaciones";

// El stock de Importaciones, codificado (0576, Lesly y el ing. 21-10). Leer y
// proponer es src/lib/stock-importaciones.ts; esto guarda, decide y sube.

export interface FilaCarga extends Propuesta {
  decision: "pendiente" | "subir" | "no_subir";
  codigoFinal: string | null;
}

export interface CargaStock {
  id: string;
  archivo: string;
  hojas: string[];
  filas: FilaCarga[];
  ausentes: { serie: string; codigo: string | null }[];
  estado: "revisando" | "subida" | "reemplazada";
  resultado: ResultadoSubida | null;
  createdAt: string;
  subidaAt: string | null;
}

export interface ResultadoSubida {
  cargadas: number;
  movidas: number;
  iguales: number;
  creados: string[];
  retirados: string[];
  ocupadas: string[];
  sinDecidir: number;
  referencia: number;
  sacadas: number;
}

async function soloOperaciones(): Promise<string | null> {
  const perfil = await requerirPerfil();
  if (["operaciones", "gerencia", "admin"].includes(perfil.rol) || perfil.es_operaciones) return null;
  return "El stock lo sube operaciones (Lesly).";
}

const limpiarError = (m: string) => m.replace(/^.*?:\s*(?=[A-ZÁÉÍÓÚÑ¿])/, "");

/** El catálogo con lo que hace falta para comparar: la descripción oficial y lo de la ficha. */
export async function productosParaComparar(): Promise<ProductoCatalogo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("productos")
    .select(
      "id, sku, activo, marca, modelo, nombre, dm:ficha->>descripcion_maestro, od:ficha->>origen_descripcion, panel:ficha->>panel, calentamiento:ficha->>calentamiento, nombreFicha:ficha->>nombre_ficha, faltaFicha:ficha->>falta_ficha",
    )
    .not("sku", "is", null);
  type Fila = {
    id: string; sku: string; activo: boolean; marca: string | null; modelo: string | null; nombre: string;
    dm: string | null; od: string | null; panel: string | null; calentamiento: string | null; nombreFicha: string | null; faltaFicha: string | null;
  };
  return ((data ?? []) as unknown as Fila[]).map((p) => ({
    id: p.id,
    sku: p.sku.toUpperCase(),
    activo: p.activo,
    marca: p.marca,
    modelo: p.modelo,
    nombre: p.nombre,
    descripcion: p.dm ?? (p.od && p.od !== "ficha word de Lesly" ? p.od : null),
    panel: p.panel,
    calentamiento: p.calentamiento,
    nombreFicha: p.nombreFicha,
    enPreparacion: p.faltaFicha === "true" && !p.activo,
  }));
}

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * Series que el CRM ya tiene con un cliente (equipo instalado o pedido), con
 * a quién y en qué pedido. Lesly (21-10) fue a buscar a mano para quién era la
 * 2607009967 («antes con la serie verificaba para quién»): acá viene ya.
 */
async function seriesOcupadas(soloEstas?: string[]): Promise<SerieOcupada[]> {
  const admin = createAdminClient();
  let qi = admin
    .from("equipos_instalados")
    .select("serie, cliente_texto, cuenta_id, servicio_id, cuentas(razon_social), servicios_postventa(numero_pedido_erp)")
    .not("serie", "is", null)
    .eq("es_prueba", false);
  let qp = admin
    .from("pedido_equipos")
    .select("serie, servicio_id, servicios_postventa(cuenta_id, numero_pedido_erp, cuentas(razon_social))")
    .not("serie", "is", null)
    .eq("es_prueba", false);
  if (soloEstas) {
    qi = qi.in("serie", soloEstas);
    qp = qp.in("serie", soloEstas);
  }
  const [instalados, pedidos] = await Promise.all([qi, qp]);
  const mapa = new Map<string, SerieOcupada>();
  type Ped = { serie: string; servicio_id: string | null; servicios_postventa: Uno<{ cuenta_id: string | null; numero_pedido_erp: string | null; cuentas: Uno<{ razon_social: string }> }> };
  for (const p of (pedidos.data ?? []) as unknown as Ped[]) {
    const s = uno(p.servicios_postventa);
    mapa.set(String(p.serie).toUpperCase(), {
      serie: String(p.serie).toUpperCase(),
      cliente: uno(s?.cuentas ?? null)?.razon_social ?? null,
      cuentaId: s?.cuenta_id ?? null,
      pedidoId: p.servicio_id,
      pedido: s?.numero_pedido_erp ?? null,
    });
  }
  type Inst = { serie: string; cliente_texto: string | null; cuenta_id: string | null; servicio_id: string | null; cuentas: Uno<{ razon_social: string }>; servicios_postventa: Uno<{ numero_pedido_erp: string | null }> };
  for (const e of (instalados.data ?? []) as unknown as Inst[]) {
    const serie = e.serie.toUpperCase();
    const previo = mapa.get(serie);
    mapa.set(serie, {
      serie,
      cliente: uno(e.cuentas)?.razon_social ?? e.cliente_texto ?? previo?.cliente ?? null,
      cuentaId: e.cuenta_id ?? previo?.cuentaId ?? null,
      pedidoId: e.servicio_id ?? previo?.pedidoId ?? null,
      pedido: uno(e.servicios_postventa)?.numero_pedido_erp ?? previo?.pedido ?? null,
    });
  }
  return [...mapa.values()];
}

export interface DondeEstaSerie {
  serie: string;
  almacen: { estado: string; sku: string | null; ubicacion: string | null } | null;
  cliente: SerieOcupada | null;
}

/** «¿Dónde está esta serie?»: en el almacén, en un pedido o con un cliente (Lesly 21-10). */
export async function buscarSerie(serie: string): Promise<{ error: string | null; resultado?: DondeEstaSerie }> {
  const sinPermiso = await soloOperaciones();
  if (sinPermiso) return { error: sinPermiso };
  const s = serie.trim().toUpperCase();
  if (s.length < 3) return { error: "Escriba la serie completa" };
  const supabase = await createClient();
  const [{ data: inv }, ocupadas] = await Promise.all([
    supabase.from("inventario_equipos").select("estado, ubicacion, productos(sku)").ilike("serie", s).neq("estado", "baja").maybeSingle(),
    seriesOcupadas([s]),
  ]);
  type Inv = { estado: string; ubicacion: string | null; productos: Uno<{ sku: string | null }> };
  const i = inv as unknown as Inv | null;
  return {
    error: null,
    resultado: {
      serie: s,
      almacen: i ? { estado: i.estado, sku: uno(i.productos)?.sku ?? null, ubicacion: i.ubicacion } : null,
      cliente: ocupadas.find((o) => o.serie === s) ?? null,
    },
  };
}

/** Lee el Excel, propone un código por máquina y guarda la propuesta para revisarla. */
export async function analizarExcelStock(formData: FormData): Promise<{ error: string | null; id?: string }> {
  const sinPermiso = await soloOperaciones();
  if (sinPermiso) return { error: sinPermiso };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elija el Excel de stock" };
  if (!/\.xlsx?$/i.test(archivo.name)) return { error: "Tiene que ser un Excel (.xlsx)" };
  if (archivo.size > 15 * 1024 * 1024) return { error: "El Excel pesa demasiado (más de 15 MB)" };

  let lectura: ReturnType<typeof leerExcelStock>;
  try {
    lectura = leerExcelStock(new Uint8Array(await archivo.arrayBuffer()));
  } catch {
    return { error: "No se pudo leer el Excel. ¿Está abierto en otra versión o dañado?" };
  }
  if (lectura.filas.length === 0) {
    // Lesly (21-10 17:00) subió el Excel de REVISIÓN (hojas LÉEME, Máquinas…) y el
    // aviso no le decía cuál era el archivo correcto.
    const hojas = lectura.ignoradas.concat(lectura.hojas);
    const esRevision = hojas.some((h) => /^(m[aá]quinas|l[eé]eme|c[oó]digos nuevos)$/i.test(h));
    return {
      error: esRevision
        ? `«${archivo.name}» es el Excel de revisión, no el de stock. Suba el Excel de stock de Importaciones (el que tiene las hojas «STOCK DE EQUIPOS INDUSTRIALES» y «STOCK DE EQUIPOS LG»).`
        : `En «${archivo.name}» no encontré máquinas. Este Excel trae las hojas ${hojas.map((h) => `«${h}»`).join(", ") || "sin nombre"}; hace falta el Excel de stock de Importaciones, con las hojas «STOCK DE EQUIPOS INDUSTRIALES» y «STOCK DE EQUIPOS LG» (columnas CODIGO, MODELO, SERIE…).`,
    };
  }

  const [productos, ocupadas] = await Promise.all([productosParaComparar(), seriesOcupadas()]);
  const propuestas = emparejar(lectura.filas, productos, ocupadas);
  const filas: FilaCarga[] = propuestas.map((p) => ({
    ...p,
    // Lo que el CRM confirma o encontró sin dudas queda marcado para subir; una
    // serie que ya está con un cliente viene como «no subir» (Lesly 21-10: «ese
    // tengo que sacarlo, pasarlo a vendido»); lo demás, que lo decida Lesly.
    // Un código nuevo que Lesly ya escribió en su Excel es decisión suya: viene marcado para subir.
    decision: p.ocupada
      ? "no_subir"
      : p.estado === "ok" || p.estado === "sugerido" || (p.estado === "nuevo" && !!p.codigoExcel && p.codigo === p.codigoExcel)
        ? "subir"
        : "pendiente",
    codigoFinal: p.codigo,
  }));

  // Las que están disponibles en el almacén y no vinieron en este Excel.
  const supabase = await createClient();
  const enExcel = new Set(filas.map((f) => f.serie).filter(Boolean));
  const { data: almacen } = await supabase.from("inventario_equipos").select("serie, productos(sku)").eq("estado", "disponible");
  type Alm = { serie: string; productos: { sku: string | null } | { sku: string | null }[] | null };
  const ausentes = ((almacen ?? []) as unknown as Alm[])
    .filter((a) => !enExcel.has(a.serie.toUpperCase()))
    .map((a) => ({ serie: a.serie, codigo: (Array.isArray(a.productos) ? a.productos[0] : a.productos)?.sku ?? null }));

  const { data: id, error } = await supabase.rpc("stock_carga_guardar", {
    p_archivo: archivo.name,
    p_hojas: lectura.hojas,
    p_filas: filas,
    p_ausentes: ausentes,
  });
  if (error) return { error: limpiarError(error.message) };
  revalidatePath("/operaciones/stock");
  return { error: null, id: id as string };
}

export async function decidirStock(
  cargaId: string,
  indices: number[],
  decision: "pendiente" | "subir" | "no_subir",
  codigo: string | null,
): Promise<{ error: string | null }> {
  const sinPermiso = await soloOperaciones();
  if (sinPermiso) return { error: sinPermiso };
  const supabase = await createClient();
  const { error } = await supabase.rpc("stock_carga_decidir", {
    p_carga: cargaId,
    p_indices: indices,
    p_decision: decision,
    p_codigo: codigo,
  });
  if (error) return { error: limpiarError(error.message) };
  revalidatePath("/operaciones/stock");
  return { error: null };
}

export async function subirStock(cargaId: string, sacarAusentes: boolean): Promise<{ error: string | null; resultado?: ResultadoSubida }> {
  const sinPermiso = await soloOperaciones();
  if (sinPermiso) return { error: sinPermiso };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stock_carga_subir", { p_carga: cargaId, p_sacar_ausentes: sacarAusentes });
  if (error) return { error: limpiarError(error.message) };
  revalidatePath("/operaciones/stock");
  revalidatePath("/operaciones/catalogo");
  revalidatePath("/comercial/stock");
  return { error: null, resultado: data as ResultadoSubida };
}

export interface SugerenciaCodigo {
  rasgos: ReturnType<typeof rasgos>;
  iguales: { sku: string; activo: boolean; nombre: string }[];
  parecidos: { sku: string; activo: boolean; nombre: string; diferencias: string[] }[];
  tentativo: string;
}

/**
 * «Pongo la descripción y que me genere en automático el código» (Lesly).
 * Si ya hay un código con esa configuración lo dice —para no duplicar—, y si
 * no, propone el siguiente libre de la familia más parecida.
 */
export async function sugerirCodigo(modelo: string, descripcion: string): Promise<{ error: string | null; sugerencia?: SugerenciaCodigo }> {
  const sinPermiso = await soloOperaciones();
  if (sinPermiso) return { error: sinPermiso };
  if (!descripcion.trim() && !modelo.trim()) return { error: "Escriba el modelo o pegue la descripción" };
  const productos = await productosParaComparar();
  const [p] = emparejar(
    [{
      hoja: /\bLG\b/i.test(descripcion) ? "LG" : "INDUSTRIALES",
      fila: 0, item: null, codigoExcel: null,
      modelo: modelo.trim() || (descripcion.match(/MOD(?:ELO)?[.:\s]*([A-Z0-9][A-Z0-9.\-]{2,12})/i)?.[1] ?? ""),
      descripcion, serie: null, capacidad: null, cantidad: 0, ubicacion: null, ingreso: null,
      marca: null,
    }],
    productos,
    [],
  );
  const porSku = new Map(productos.map((x) => [x.sku, x]));
  const info = (sku: string) => ({ sku, activo: porSku.get(sku)?.activo ?? false, nombre: porSku.get(sku)?.nombre ?? "" });
  const iguales = p.candidatos.filter((c) => c.choques.length === 0).map((c) => info(c.sku));
  const parecidos = p.candidatos.filter((c) => c.choques.length > 0).map((c) => ({ ...info(c.sku), diferencias: c.choques }));
  const ocupados = new Set(productos.map((x) => x.sku));
  const tentativo = p.crear && p.codigo ? p.codigo : siguienteCodigoLibre(p.candidatos[0]?.sku ?? p.codigo ?? "EQ", ocupados);
  return { error: null, sugerencia: { rasgos: p.rasgos, iguales, parecidos, tentativo } };
}
