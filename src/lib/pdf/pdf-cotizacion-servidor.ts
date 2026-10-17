import { renderizarCotizacionPdf, type CotizacionParaPdf } from "@/lib/pdf/armar-cotizacion";
import { quitarPaginasEnBlanco } from "@/lib/pdf/paginas-en-blanco";
import { codigoConVersion } from "@/lib/version-cotizacion";
import { renglonEnSoles } from "@/lib/moneda-impresa";
import type { createClient } from "@/lib/supabase/server";

/**
 * EL PDF DE LA COTIZACIÓN, UNO SOLO PARA TODOS.
 *
 * Es el mismo documento que descarga el CRM (/api/cotizaciones/[id]/pdf) y el
 * que ve el cliente en Mi cuenta (/api/portal/pdf, 17-10): las versiones, la
 * moneda impresa y la limpieza de hojas en blanco viven acá para que los dos
 * nunca se separen. Quién puede pedirlo y si van las cifras lo decide cada ruta.
 */

type Lectura = Awaited<ReturnType<typeof createClient>>;

/** Lo que se lee de la cotización para dibujarla. */
export const SELECT_PDF_COTIZACION = `oportunidad_id, codigo, correlativo, serie, moneda, moneda_impresa, tipo_cambio, condiciones, vigencia_dias, entrega_lugar,
       tiempo_entrega, garantia, forma_pago, saldo, notas_pdf, atencion_pdf, tiempo_ejecucion, descuento_escrito, descuento_con_igv, descuento_motivo, cliente_snapshot, created_at, version,
       cotizacion_items(cantidad, precio_unitario, precio_con_igv, precio_impreso, descripcion, color, nombre_impreso, detalle_kit, productos(sku, marca, modelo, nombre, capacidad, categoria, segmento, ficha, foto_path, logo_path, panel_path)),
       oportunidades!cotizaciones_oportunidad_id_fkey(cuentas(contactos(nombre, telefono, email, es_principal))),
       perfiles!cotizaciones_creada_por_fkey(nombre, cargo, telefono, celular, email_contacto, email_open)`;

export type CotizacionGuardada = CotizacionParaPdf & { codigo: string | null; cliente_snapshot: unknown; version?: number | null };

export async function generarPdfCotizacion(
  lectura: Lectura,
  cotizacion: CotizacionGuardada,
  id: string,
  opciones: { pedida?: number; sinMontos: boolean; postventa: boolean },
): Promise<{ pdf: Uint8Array; nombre: string } | { error: string; status: number }> {
  // COTIZAR EN SOLES (0169). Los importes se guardan en dólares —ahí viven el
  // piso de precio, la aprobación de gerencia y todos los tableros—; el papel
  // se imprime en la moneda que eligió el comercial, al tipo de cambio que
  // fijó gerencia y que quedó congelado en el documento. Se convierte acá,
  // una sola vez, antes de dibujar: el PDF ya sabía escribir «S/».
  //
  // CORREGIDA (decisión de gerencia del 23-09: «dejar claro cuál es la
  // cotización final»). Las versiones archivadas dicen cuándo se reemplazó
  // cada una; de ahí sale la fecha de la corrección que produjo la vigente.
  const vigente = Number(cotizacion.version ?? 1);
  const pedida = opciones.pedida ?? NaN;
  const { data: archivadas } =
    vigente > 1
      ? await lectura
          .from("cotizacion_versiones")
          .select("version, items, moneda, condiciones, vigencia_dias, entrega_lugar, tiempo_entrega, garantia, forma_pago, saldo, archivada_at")
          .eq("cotizacion_id", id)
          .order("version")
      : { data: [] };
  const nacio = (v: number) => archivadas?.find((a) => Number(a.version) === v - 1)?.archivada_at ?? null;

  let base = { ...(cotizacion as unknown as CotizacionParaPdf), version: vigente, corregida_at: nacio(vigente) };
  if (Number.isInteger(pedida) && pedida >= 1 && pedida < vigente) {
    const vieja = archivadas?.find((a) => Number(a.version) === pedida);
    if (!vieja) return { error: `La versión ${pedida} no está archivada`, status: 404 };
    base = { ...base, ...(await comoEstaba(lectura, vieja)), version: pedida, corregida_at: nacio(pedida), reemplazada_por: vigente };
  }

  const paraPdf = enMonedaDelDocumento(base);
  // Un expediente de postventa imprime los formatos de repuestos o de
  // mantenimiento que dio Santos el 28-09, no el de equipos.
  const buffer = await renderizarCotizacionPdf(paraPdf, { sinMontos: opciones.sinMontos, postventa: opciones.postventa });
  const snapshot = cotizacion.cliente_snapshot as { razon_social: string };
  const nombreCodigo = cotizacion.codigo
    ? base.reemplazada_por
      ? `${cotizacion.codigo} v${base.version} (REEMPLAZADA)`
      : codigoConVersion(cotizacion.codigo, base.version)
    : null;

  // Red de seguridad: si alguna ficha se pasó del alto por poco, react-pdf deja
  // una hoja con el membrete y nada más. Al cliente no le llega.
  const { pdf: limpio, quitadas } = await quitarPaginasEnBlanco(new Uint8Array(buffer));
  if (quitadas.length > 0) {
    // Se avisa aunque el documento salga bien: cada aviso es una ficha que se
    // pasó del alto y conviene mirarla, no dejarla tapada por la red.
    console.warn(`[cotizacion ${id}] hojas en blanco quitadas: ${quitadas.join(", ")}`);
  }

  return { pdf: limpio, nombre: `${nombreCodigo ?? "Presupuesto BORRADOR"}, ${snapshot.razon_social}` };
}

/**
 * Una versión archivada, armada como el documento que el cliente tuvo en la
 * mano: sus equipos, precios y condiciones de entonces (0123 los guarda
 * enteros). La ficha técnica sale del catálogo de hoy —la versión archivada
 * guarda el equipo, no su hoja—, y el precio con IGV del renglón (0233) no se
 * archivaba: esos renglones se imprimen con el neto.
 */
async function comoEstaba(
  supabase: Lectura,
  v: {
    items: unknown;
    moneda: string;
    condiciones: string | null;
    vigencia_dias: number | null;
    entrega_lugar: string | null;
    tiempo_entrega: string | null;
    garantia: string | null;
    forma_pago: string | null;
    saldo: string | null;
  },
): Promise<Partial<CotizacionParaPdf>> {
  const items = (Array.isArray(v.items) ? v.items : []) as {
    producto_id: string | null;
    descripcion: string | null;
    cantidad: number;
    precio_unitario: number;
    color: string | null;
    nombre_impreso?: string | null;
  }[];
  const ids = items.map((i) => i.producto_id).filter((x): x is string => Boolean(x));
  const { data: productos } = ids.length
    ? await supabase
        .from("productos")
        .select("id, sku, marca, modelo, nombre, capacidad, categoria, segmento, ficha, foto_path, logo_path, panel_path")
        .in("id", ids)
    : { data: [] };
  const porId = new Map((productos ?? []).map((p) => [p.id as string, p]));
  return {
    moneda: v.moneda,
    condiciones: v.condiciones,
    vigencia_dias: v.vigencia_dias ?? 15,
    entrega_lugar: v.entrega_lugar,
    tiempo_entrega: v.tiempo_entrega,
    garantia: v.garantia,
    forma_pago: v.forma_pago,
    saldo: v.saldo,
    cotizacion_items: items.map((i) => ({
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      precio_con_igv: null,
      descripcion: i.descripcion,
      color: i.color,
      nombre_impreso: i.nombre_impreso ?? null,
      productos: i.producto_id ? (porId.get(i.producto_id) ?? null) : null,
    })),
  };
}

/**
 * La misma cotización, vista en la moneda del documento.
 *
 * Imprime en soles lo que el comercial escribió en soles (0366); el resto lo
 * multiplica por el tipo de cambio congelado. Cambia la moneda que lee el
 * dibujo. No toca la base: es una copia para imprimir.
 */
function enMonedaDelDocumento(c: CotizacionParaPdf): CotizacionParaPdf {
  const tc = Number(c.tipo_cambio ?? 0);
  if (c.moneda_impresa !== "PEN" || !(tc > 0)) return c;
  const items = (c.cotizacion_items as { cantidad: number; precio_unitario: number; precio_con_igv?: number | null; precio_impreso?: number | null }[] | null) ?? [];
  return {
    ...c,
    moneda: "PEN",
    // Lo escrito en soles sale tal cual (0366); lo demás se convierte.
    cotizacion_items: items.map((i) => renglonEnSoles(i, tc)),
  };
}
