import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderizarCotizacionPdf, type CotizacionParaPdf } from "@/lib/pdf/armar-cotizacion";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { quitarPaginasEnBlanco } from "@/lib/pdf/paginas-en-blanco";
import { codigoConVersion } from "@/lib/version-cotizacion";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ?version=1 abre una versión ARCHIVADA de una cotización corregida (0123).
  // Sin el parámetro, la vigente: la final, que es lo que se manda.
  const pedida = Number(new URL(request.url).searchParams.get("version") ?? "");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: cotizacion, error } = await supabase
    .from("cotizaciones")
    .select(
      `codigo, correlativo, serie, moneda, moneda_impresa, tipo_cambio, condiciones, vigencia_dias, entrega_lugar,
       tiempo_entrega, garantia, forma_pago, saldo, cliente_snapshot, created_at, version,
       cotizacion_items(cantidad, precio_unitario, precio_con_igv, descripcion, color, productos(sku, marca, modelo, nombre, capacidad, categoria, ficha, foto_path, logo_path, panel_path)),
       oportunidades!cotizaciones_oportunidad_id_fkey(cuentas(contactos(nombre, telefono, email, es_principal))),
       perfiles!cotizaciones_creada_por_fkey(nombre, cargo, telefono, celular, email_contacto, email_open)`,
    )
    .eq("id", id)
    .maybeSingle();

  // Un fallo de la consulta NO es «no encontrada». El 05-09 la migración 0179
  // agregó una segunda relación entre cotizaciones y oportunidades, PostgREST
  // dejó de saber por cuál embeber, y este endpoint respondió «Cotización no
  // encontrada» a TODAS las descargas: la cotización de Brenda estaba en la
  // base y nadie podía explicar el 404. El error de la consulta se dice y se
  // registra; el 404 queda para lo que de verdad no existe o no le toca ver.
  if (error) {
    console.error(`[cotizacion ${id}] la consulta falló:`, error);
    return NextResponse.json({ error: "No se pudo leer la cotización", detalle: error.message }, { status: 500 });
  }
  if (!cotizacion) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

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
  const { data: archivadas } =
    vigente > 1
      ? await supabase
          .from("cotizacion_versiones")
          .select("version, items, moneda, condiciones, vigencia_dias, entrega_lugar, tiempo_entrega, garantia, forma_pago, saldo, archivada_at")
          .eq("cotizacion_id", id)
          .order("version")
      : { data: [] };
  const nacio = (v: number) => archivadas?.find((a) => Number(a.version) === v - 1)?.archivada_at ?? null;

  let base = { ...(cotizacion as unknown as CotizacionParaPdf), version: vigente, corregida_at: nacio(vigente) };
  if (Number.isInteger(pedida) && pedida >= 1 && pedida < vigente) {
    const vieja = archivadas?.find((a) => Number(a.version) === pedida);
    if (!vieja) return NextResponse.json({ error: `La versión ${pedida} no está archivada` }, { status: 404 });
    base = { ...base, ...(await comoEstaba(supabase, vieja)), version: pedida, corregida_at: nacio(pedida), reemplazada_por: vigente };
  }

  const paraPdf = enMonedaDelDocumento(base);
  const buffer = await renderizarCotizacionPdf(paraPdf);
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

  return new NextResponse(new Uint8Array(limpio), {
    headers: {
      "Content-Type": "application/pdf",
      // "Presu_2195-26, WAYRA INMOBILIARIA.pdf": pedido del área comercial el
      // 24-08 — «cosa que lo que descarga ya está listo para enviar por
      // correo», sin renombrarlo a mano. El borrador todavía no tiene número.
      "Content-Disposition": cabeceraArchivo(
        `${nombreCodigo ?? "Presupuesto BORRADOR"}, ${snapshot.razon_social}`,
      ),
    },
  });
}

/**
 * Una versión archivada, armada como el documento que el cliente tuvo en la
 * mano: sus equipos, precios y condiciones de entonces (0123 los guarda
 * enteros). La ficha técnica sale del catálogo de hoy —la versión archivada
 * guarda el equipo, no su hoja—, y el precio con IGV del renglón (0233) no se
 * archivaba: esos renglones se imprimen con el neto.
 */
async function comoEstaba(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
  }[];
  const ids = items.map((i) => i.producto_id).filter((x): x is string => Boolean(x));
  const { data: productos } = ids.length
    ? await supabase
        .from("productos")
        .select("id, sku, marca, modelo, nombre, capacidad, categoria, ficha, foto_path, logo_path, panel_path")
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
      productos: i.producto_id ? (porId.get(i.producto_id) ?? null) : null,
    })),
  };
}

/**
 * La misma cotización, vista en la moneda del documento.
 *
 * Multiplica los precios unitarios por el tipo de cambio congelado y cambia la
 * moneda que lee el dibujo. No toca la base: es una copia para imprimir.
 */
function enMonedaDelDocumento(c: CotizacionParaPdf): CotizacionParaPdf {
  const tc = Number(c.tipo_cambio ?? 0);
  if (c.moneda_impresa !== "PEN" || !(tc > 0)) return c;
  const items = (c.cotizacion_items as { precio_unitario: number; precio_con_igv?: number | null }[] | null) ?? [];
  return {
    ...c,
    moneda: "PEN",
    cotizacion_items: items.map((i) => ({
      ...i,
      precio_unitario: Math.round(Number(i.precio_unitario) * tc * 100) / 100,
      precio_con_igv: i.precio_con_igv == null ? null : Math.round(Number(i.precio_con_igv) * tc * 100) / 100,
    })),
  };
}
