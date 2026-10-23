import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarIndustriales, armarLg, type FilaStockGeneral } from "@/lib/stock-general";
import type { FilaAlmacen, FilaContraste, TotalesAlmacen } from "@/components/crm/almacen-por-serie";
import type { LlegadaComercial } from "@/components/crm/inventario-comercial";
import type { MaquinaTabla } from "@/components/crm/almacen-tabla";
import type { Proyeccion } from "@/lib/acciones/inventario";
import type { FilaCarga } from "@/lib/acciones/stock-importaciones";

// Lo que las pantallas del almacén necesitan (reunión Carlos 22-10): las máquinas
// por serie con su pedido, los totales como en la hoja de Importaciones, lo que
// está por llegar y el cotejo con el catálogo. Solo lee.

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const sinRuc = (s: string | null | undefined) => (s ?? "").replace(/^\d{8,11}\s*-\s*/, "").trim() || null;

interface InvFila {
  id: string; serie: string; estado: FilaAlmacen["estado"]; ubicacion: string | null; ingreso_at: string; salida_at: string | null; modelo: string | null;
  descripcion: string | null; empresa: string | null; item_importaciones: string | null; proveedor: string | null; servicio_id: string | null;
  pedido_equipo_id: string | null; reservado_para: string | null; observacion: string | null;
  productos: Uno<{ id: string; sku: string | null; marca: string | null; modelo: string | null; nombre: string; segmento: string | null }>;
}

async function maquinas(supabase: SupabaseClient): Promise<InvFila[]> {
  const { data } = await supabase
    .from("inventario_equipos")
    .select("id, serie, estado, ubicacion, ingreso_at, salida_at, modelo, descripcion, empresa, item_importaciones, proveedor, servicio_id, pedido_equipo_id, reservado_para, observacion, productos(id, sku, marca, modelo, nombre, segmento)")
    .neq("estado", "baja")
    .order("ingreso_at", { ascending: true })
    .limit(3000);
  return (data ?? []) as unknown as InvFila[];
}

const marcaDe = (m: InvFila) => (m.proveedor === "LG" ? "LG" : (uno(m.productos)?.marca ?? null));

/** Las máquinas por serie con el cliente y el pedido que las tienen (operaciones y gerencia). */
export async function cargarAlmacenPorSerie(supabase: SupabaseClient): Promise<{ filas: FilaAlmacen[]; totales: TotalesAlmacen }> {
  const lista = await maquinas(supabase);
  const admin = createAdminClient();
  const idsServicio = [...new Set(lista.map((m) => m.servicio_id).filter(Boolean))] as string[];
  const idsCuenta = [...new Set(lista.filter((m) => !m.servicio_id && m.reservado_para).map((m) => m.reservado_para))] as string[];
  const [servicios, cuentas, costos] = await Promise.all([
    idsServicio.length ? admin.from("servicios_postventa").select("id, cliente_texto, numero_pedido_erp").in("id", idsServicio) : Promise.resolve({ data: [] }),
    idsCuenta.length ? admin.from("cuentas").select("id, razon_social").in("id", idsCuenta) : Promise.resolve({ data: [] }),
    // Con la sesión de quien mira: la tabla de costos solo la leen operaciones y gerencia (0596).
    supabase.from("inventario_costos").select("inventario_id, costo").limit(5000),
  ]);
  const porCosto = new Map(((costos.data ?? []) as { inventario_id: string; costo: number }[]).map((c) => [c.inventario_id, Number(c.costo)]));
  const porServicio = new Map(((servicios.data ?? []) as { id: string; cliente_texto: string | null; numero_pedido_erp: string | null }[]).map((s) => [s.id, s]));
  const porCuenta = new Map(((cuentas.data ?? []) as { id: string; razon_social: string }[]).map((c) => [c.id, c.razon_social]));

  const filas: FilaAlmacen[] = lista.map((m) => {
    const p = uno(m.productos);
    const s = m.servicio_id ? porServicio.get(m.servicio_id) : null;
    return {
      id: m.id,
      serie: m.serie,
      estado: m.estado,
      codigo: p?.sku ?? null,
      marca: marcaDe(m),
      modelo: m.modelo ?? p?.modelo ?? "",
      descripcion: m.descripcion ?? p?.nombre ?? "",
      ubicacion: m.ubicacion,
      ingreso: m.ingreso_at,
      salida: m.salida_at,
      empresa: m.empresa,
      item: m.item_importaciones,
      proveedor: m.proveedor,
      cliente: sinRuc(s?.cliente_texto) ?? (m.reservado_para ? (porCuenta.get(m.reservado_para) ?? null) : null),
      pedido: s?.numero_pedido_erp ?? null,
      servicioId: m.servicio_id,
      porPedido: !!m.pedido_equipo_id,
      costo: porCosto.get(m.id) ?? null,
      observacion: m.observacion,
    };
  });

  // Los totales, con el mismo motor del PDF: solo lo disponible.
  const generales: FilaStockGeneral[] = lista
    .filter((m) => m.estado === "disponible")
    .map((m) => {
      const p = uno(m.productos);
      const marca = marcaDe(m);
      return {
        item: m.item_importaciones,
        codigo: p?.sku ?? null,
        modelo: m.modelo ?? p?.modelo ?? "",
        descripcion: m.descripcion ?? p?.nombre ?? "",
        serie: m.serie,
        cantidad: 1,
        ubicacion: m.ubicacion,
        marca,
        proveedor: m.proveedor,
        // LG es la marca, no el segmento: un calderín Sidi Mondial «semi-industrial» no es LG.
        esLg: /^LG$/i.test(marca ?? "") || /^LG$/i.test(m.proveedor ?? ""),
      };
    });
  const ind = armarIndustriales(generales);
  const lg = armarLg(generales);
  const totales: TotalesAlmacen = {
    industriales: ind.bloques.map((b) => ({ proveedor: b.proveedor, total: b.total, secciones: b.secciones.map((s) => ({ titulo: s.titulo, total: s.total })) })),
    totalIndustriales: ind.total,
    lg: lg.secciones.map((s) => ({ titulo: s.titulo, total: s.total, modelos: s.modelos.map((m) => ({ modelo: m.modelo, codigo: m.codigo, stock: m.stock })) })),
    totalLg: lg.total,
  };
  return { filas, totales };
}

/** Lo que está por llegar, tal como lo anotó operaciones. */
export async function cargarProyeccion(supabase: SupabaseClient): Promise<Proyeccion[]> {
  const { data } = await supabase
    .from("stock_proyectado")
    .select("id, codigo, descripcion, cantidad, fecha_estimada, proveedor, referencia, nota, estado")
    .eq("estado", "en_camino")
    .order("fecha_estimada", { ascending: true, nullsFirst: false })
    .limit(200);
  return ((data ?? []) as { id: string; codigo: string | null; descripcion: string; cantidad: number; fecha_estimada: string | null; proveedor: string | null; referencia: string | null; nota: string | null; estado: Proyeccion["estado"] }[]).map((p) => ({
    id: p.id,
    codigo: p.codigo,
    descripcion: p.descripcion,
    cantidad: p.cantidad,
    fechaEstimada: p.fecha_estimada,
    proveedor: p.proveedor,
    referencia: p.referencia,
    nota: p.nota,
    estado: p.estado,
  }));
}

/**
 * El cotejo (Carlos 22-10: «¿ya se actualizó el stock que había en el CRM con
 * esto?»): por código, la cifra vieja «(ref.)», lo que trae la carga en
 * revisión y lo que el almacén cuenta por serie.
 */
export async function cargarContraste(supabase: SupabaseClient, cargaEnRevision: FilaCarga[] | null): Promise<FilaContraste[]> {
  const [{ data: productos }, { data: stock }] = await Promise.all([
    supabase
      .from("productos")
      .select("id, sku, nombre, activo, segmento, ref:ficha->>stock_referencia, faltaFicha:ficha->>falta_ficha")
      .in("segmento", ["industrial", "semi_industrial"])
      .not("sku", "is", null),
    supabase.rpc("stock_por_producto"),
  ]);
  const enAlmacen = new Map(((stock ?? []) as { producto_id: string; disponibles: number }[]).map((x) => [x.producto_id, x.disponibles]));
  const enCarga = new Map<string, number>();
  for (const f of cargaEnRevision ?? []) {
    if (f.decision !== "subir") continue;
    const sku = (f.codigoFinal ?? f.codigo ?? "").toUpperCase();
    if (!sku) continue;
    enCarga.set(sku, (enCarga.get(sku) ?? 0) + (f.serie ? 1 : f.cantidad));
  }
  type P = { id: string; sku: string; nombre: string; activo: boolean; ref: string | null; faltaFicha: string | null };
  const filas: FilaContraste[] = [];
  for (const p of (productos ?? []) as unknown as P[]) {
    const sku = p.sku.toUpperCase();
    const ref = Number(p.ref ?? 0) || 0;
    const almacen = enAlmacen.get(p.id) ?? 0;
    const carga = enCarga.get(sku) ?? 0;
    if (ref === 0 && almacen === 0 && carga === 0) continue;
    filas.push({
      sku,
      nombre: p.nombre,
      ficha: p.activo ? "activa" : p.faltaFicha === "true" ? "en preparación" : "retirada",
      ref,
      almacen,
      carga,
    });
  }
  // Códigos nuevos de la carga que todavía no existen en el catálogo.
  for (const [sku, carga] of enCarga) {
    if (!filas.some((f) => f.sku === sku) && !((productos ?? []) as unknown as P[]).some((p) => p.sku.toUpperCase() === sku)) {
      filas.push({ sku, nombre: "(código nuevo: se crea al subir)", ficha: "en preparación", ref: 0, almacen: 0, carga });
    }
  }
  return filas.sort((a, b) => a.sku.localeCompare(b.sku));
}

/** Lo que ve el comercial: máquinas en planta sin costo, sin fecha de ingreso ni dueño de la reserva (Carlos 22-10). */
export async function cargarInventarioComercial(supabase: SupabaseClient): Promise<{ filas: MaquinaTabla[]; llegadas: LlegadaComercial[] }> {
  const [lista, proyeccion] = await Promise.all([maquinas(supabase), cargarProyeccion(supabase)]);
  const filas: MaquinaTabla[] = lista
    .filter((m) => m.estado === "disponible" || m.estado === "reservado")
    .map((m) => {
      const p = uno(m.productos);
      return {
        id: m.id,
        serie: m.serie,
        estado: m.estado,
        codigo: p?.sku ?? null,
        marca: marcaDe(m),
        modelo: m.modelo ?? p?.modelo ?? "",
        descripcion: m.descripcion ?? p?.nombre ?? "",
        ubicacion: m.ubicacion,
        // Lo que el comercial no ve no viaja al navegador.
        ingreso: "",
        salida: null,
        empresa: m.empresa,
        item: null,
        proveedor: m.proveedor,
        cliente: null,
        pedido: null,
        servicioId: null,
        porPedido: false,
      };
    });
  const llegadas: LlegadaComercial[] = proyeccion.map((p) => ({ id: p.id, codigo: p.codigo, descripcion: p.descripcion, cantidad: p.cantidad, fechaEstimada: p.fechaEstimada }));
  return { filas, llegadas };
}

/** Cuántas máquinas disponibles tiene cada empresa (un resumen general por empresa, 23-10). */
export async function contarPorEmpresa(supabase: SupabaseClient): Promise<Record<"OPEN" | "EFAMEINSA", number>> {
  const { data } = await supabase.from("inventario_equipos").select("empresa").eq("estado", "disponible").limit(5000);
  const r = { OPEN: 0, EFAMEINSA: 0 };
  for (const f of (data ?? []) as { empresa: string | null }[]) r[f.empresa === "EFAMEINSA" ? "EFAMEINSA" : "OPEN"]++;
  return r;
}
