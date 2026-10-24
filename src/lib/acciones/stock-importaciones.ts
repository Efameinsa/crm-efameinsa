"use server";

import { revalidatePath } from "next/cache";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  emparejar,
  esCorrelativo,
  revisarSegunExcel,
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
  /** Ya entró al almacén (0588): lo claro entra al leer el Excel; una observación, al resolverla. */
  subida?: boolean;
}

export interface CargaStock {
  id: string;
  archivo: string;
  hojas: string[];
  filas: FilaCarga[];
  ausentes: { serie: string; codigo: string | null }[];
  estado: "revisando" | "subida" | "reemplazada";
  resultado: ResultadoSubida | null;
  /** OPEN o EFAMEINSA: cada Excel es de una empresa y no se mezcla con el de la otra (0596). */
  empresa: "OPEN" | "EFAMEINSA";
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
  ultimaSubidaAt?: string;
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
export async function analizarExcelStock(formData: FormData): Promise<{
  error: string | null;
  id?: string;
  entraron?: number;
  observaciones?: number;
  noEntran?: number;
  /** Cuántas entraron de cada empresa (un Excel puede traer Open y Efameinsa). */
  porEmpresa?: Record<string, number>;
  /** Máquinas de una hoja suelta que Lesly no pasó a la hoja unida: no entraron. */
  soloEnSueltas?: { hoja: string; serie: string; descripcion: string; empresa: string }[];
}> {
  const sinPermiso = await soloOperaciones();
  if (sinPermiso) return { error: sinPermiso };
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elija el Excel de stock" };
  if (!/\.xlsx?$/i.test(archivo.name)) return { error: "Tiene que ser un Excel (.xlsx)" };
  if (archivo.size > 15 * 1024 * 1024) return { error: "El Excel pesa demasiado (más de 15 MB)" };
  // Cada Excel es de una empresa (Santos 23-10: «vamos a subir Efameinsa, que no se vaya a unir»).
  const elegida = String(formData.get("empresa") ?? "").toUpperCase();

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

  // La empresa sale del Excel: de la hoja suelta de donde viene cada máquina (STOCK INDUSTRIALES
  // PROV. OPEN / EFAMEINSA) o de RAZÓN SOCIAL (Lesly 23-10). Un Excel con las dos empresas se
  // reparte en una carga por empresa (Santos 23-10 16:20: «ahí hay Efameinsa y Open»).
  const delExcel = [...new Set(lectura.filas.map((f) => f.empresa).filter(Boolean))] as string[];
  if (delExcel.length === 1 && elegida && elegida !== delExcel[0])
    return { error: `Eligió ${elegida}, pero el Excel dice ${delExcel[0]}. Revise cuál es.` };
  const empresaUnica = delExcel.length === 1 ? delExcel[0] : delExcel.length === 0 ? elegida : null;
  if (delExcel.length === 0 && empresaUnica !== "OPEN" && empresaUnica !== "EFAMEINSA") return { error: "Elija de qué empresa es el Excel: Open o Efameinsa" };
  if (delExcel.length > 1) {
    const sinEmpresa = lectura.filas.filter((f) => !f.empresa);
    if (sinEmpresa.length)
      return {
        error: `El Excel trae máquinas de Open y de Efameinsa, pero ${sinEmpresa.length} fila${sinEmpresa.length === 1 ? " no dice" : "s no dicen"} de cuál ${sinEmpresa.length === 1 ? "es" : "son"} (RAZÓN SOCIAL vacía): ${sinEmpresa
          .slice(0, 5)
          .map((f) => `${f.hoja} fila ${f.fila}${f.serie ? ` (serie ${f.serie})` : ""}`)
          .join(", ")}${sinEmpresa.length > 5 ? "…" : ""}.`,
      };
  }

  const [productos, ocupadas] = await Promise.all([productosParaComparar(), seriesOcupadas()]);
  // Manda el Excel de Lesly (Santos 21-10): el CRM no corrige sus códigos.
  const propuestas = revisarSegunExcel(lectura.filas, productos, ocupadas);
  const filas: FilaCarga[] = propuestas.map((p) => ({
    ...p,
    // Lo que el CRM confirma o encontró sin dudas queda marcado para subir; una
    // serie que ya está con un cliente viene como «no subir» (Lesly 21-10: «ese
    // tengo que sacarlo, pasarlo a vendido»); lo demás, que lo decida Lesly.
    // Un código nuevo que Lesly ya escribió en su Excel es decisión suya: viene marcado para subir.
    decision: p.ocupada
      ? "no_subir"
      : p.estado === "ok" || p.estado === "nuevo"
        ? "subir"
        : "pendiente",
    // El sugerido del CRM queda escrito en la casilla, pero la máquina no entra hasta el visto bueno de Lesly.
    codigoFinal: p.codigo ?? p.sugerido ?? null,
    // La empresa de la máquina: la que diga su fila (si el Excel trae la columna) o la del Excel.
    empresa: p.empresa ?? empresaUnica,
  }));

  const supabase = await createClient();
  // Un correlativo de caja (1, 2, 3…) solo es la misma máquina dentro de su código (0595).
  const clave = (serie: string, codigo: string | null | undefined) => (esCorrelativo(serie) ? `${codigo ?? ""}|${serie.toUpperCase()}` : serie.toUpperCase());
  type Alm = { serie: string; productos: { sku: string | null } | { sku: string | null }[] | null };
  const skuDe = (a: Alm) => (Array.isArray(a.productos) ? a.productos[0] : a.productos)?.sku ?? null;

  // Una carga por empresa: cada una con sus máquinas y sus «ausentes» (las que están disponibles
  // en el almacén de ESA empresa y no vinieron en el Excel; el de Efameinsa nunca da por salidas
  // las de Open).
  const empresas = [...new Set(filas.map((f) => f.empresa))].filter((e): e is "OPEN" | "EFAMEINSA" => e === "OPEN" || e === "EFAMEINSA");
  let id: string | undefined;
  let entraron = 0;
  let observaciones = 0;
  const porEmpresa: Record<string, number> = {};
  for (const empresa of empresas) {
    const propias = filas.filter((f) => f.empresa === empresa);
    const enExcel = new Set(propias.filter((f) => f.serie).map((f) => clave(f.serie!, f.codigoFinal)));
    const { data: almacen } = await supabase.from("inventario_equipos").select("serie, productos(sku)").eq("estado", "disponible").eq("empresa", empresa);
    const ausentes = ((almacen ?? []) as unknown as Alm[])
      .filter((a) => !enExcel.has(clave(a.serie, skuDe(a))))
      .map((a) => ({ serie: a.serie, codigo: skuDe(a) }));

    const { data: idCarga, error } = await supabase.rpc("stock_carga_guardar", {
      p_archivo: archivo.name,
      p_hojas: lectura.hojas,
      p_filas: propias,
      p_ausentes: ausentes,
      p_empresa: empresa,
    });
    if (error) return { error: limpiarError(error.message) };
    id ??= idCarga as string;

    // Lo claro ENTRA al almacén en el acto (0588; Santos 22-10: «que todas suban en automático y
    // solo señale las observaciones»). La carga queda abierta solo por las observaciones.
    const { data: res, error: errorSubir } = await supabase.rpc("stock_carga_subir", { p_carga: idCarga, p_sacar_ausentes: false, p_indices: null, p_cerrar: false });
    if (errorSubir) return { error: `El Excel se leyó, pero lo de ${empresa} no pudo entrar al almacén: ${limpiarError(errorSubir.message)}` };
    const r = (res ?? {}) as ResultadoSubida;
    porEmpresa[empresa] = (r.cargadas ?? 0) + (r.iguales ?? 0) + (r.movidas ?? 0);
    entraron += porEmpresa[empresa];
    observaciones += r.sinDecidir ?? 0;
  }
  await supabase.rpc("catalogo_cotejar_con_almacen");
  revalidarTodo();
  return {
    error: null,
    id,
    entraron,
    observaciones,
    noEntran: filas.filter((f) => f.decision === "no_subir").length,
    porEmpresa,
    soloEnSueltas: lectura.soloEnSueltas,
  };
}

function revalidarTodo() {
  revalidatePath("/operaciones/stock");
  revalidatePath("/operaciones/catalogo");
  revalidatePath("/comercial/stock");
}

export async function decidirStock(
  cargaId: string,
  indices: number[],
  decision: "pendiente" | "subir" | "no_subir",
  codigo: string | null,
): Promise<{ error: string | null; entraron?: number; bajas?: number }> {
  const sinPermiso = await soloOperaciones();
  if (sinPermiso) return { error: sinPermiso };
  const supabase = await createClient();
  // Decidir «entra» mete esas máquinas al almacén en el acto (0588); «no entra» después de entrar las da de baja.
  const { data, error } = await supabase.rpc("stock_carga_decidir", {
    p_carga: cargaId,
    p_indices: indices,
    p_decision: decision,
    p_codigo: codigo,
  });
  if (error) return { error: limpiarError(error.message) };
  if (decision === "subir") await supabase.rpc("catalogo_cotejar_con_almacen");
  const r = (data ?? {}) as { cargadas?: number; iguales?: number; movidas?: number; bajas?: number };
  revalidarTodo();
  return { error: null, entraron: decision === "subir" ? indices.length : 0, bajas: r.bajas ?? 0 };
}

export async function subirStock(cargaId: string, sacarAusentes: boolean): Promise<{ error: string | null; resultado?: ResultadoSubida }> {
  const sinPermiso = await soloOperaciones();
  if (sinPermiso) return { error: sinPermiso };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stock_carga_subir", { p_carga: cargaId, p_sacar_ausentes: sacarAusentes, p_indices: null, p_cerrar: true });
  if (error) return { error: limpiarError(error.message) };
  // Cotejo con el catálogo (0586, Carlos 22-10): la cifra vieja «(ref.)» de los equipos
  // que no vinieron en el Excel deja de mostrarse. Si falla, la subida ya está hecha.
  await supabase.rpc("catalogo_cotejar_con_almacen");
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
