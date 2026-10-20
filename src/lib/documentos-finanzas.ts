import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * LIQUIDACIONES Y FACTURAS DE UN PEDIDO (0306, reunión 25-09 11:44).
 *
 * Finanzas sube una liquidación por cada movimiento —el pago a cuenta, el
 * saldo, la factura que llegó después— y Facturación registra la factura. Lo
 * leen Finanzas, Facturación, Central (que las imprime para el expediente
 * físico: «Finanzas, que está en otro edificio, no debería cargar ni imprimir
 * nada»), operaciones y gerencia. El comercial no (la RLS no se las da).
 */

export const ESTADOS_PAGO_LIQUIDACION = [
  ["pendiente_pago", "Pendiente de pago", "Se factura para que el cliente pague: todavía no entró nada."],
  ["pago_parcial", "Pago a cuenta", "Entró una parte; queda saldo."],
  ["cancelado", "Cancelado", "Pagado al 100 %."],
] as const;

export type EstadoPagoLiquidacion = (typeof ESTADOS_PAGO_LIQUIDACION)[number][0] | "sin_dato";

export const etiquetaEstadoPago = (e: string) =>
  ESTADOS_PAGO_LIQUIDACION.find(([v]) => v === e)?.[1] ?? "Sin dato del pago";

export interface LiquidacionFirmada {
  id: string;
  nombre: string;
  url: string | null;
  estadoPago: EstadoPagoLiquidacion;
  facturaNumero: string | null;
  nota: string | null;
  subidaAt: string;
  subidaPor: string | null;
}

export interface FacturaFirmada {
  id: string;
  numero: string;
  fechaEmision: string;
  url: string | null;
  nombre: string | null;
  nota: string | null;
  registradaAt: string;
  registradaPor: string | null;
  /** factura o nota_credito (0552). */
  tipo: "factura" | "nota_credito";
  /** La nota de crédito dice qué factura anula; la factura anulada, cuándo y por qué. */
  anulaA: string | null;
  anuladaAt: string | null;
  motivo: string | null;
}

/** Las facturas que siguen valiendo: ni notas de crédito ni anuladas (0552). */
export function facturasVigentes(d: DocumentosDeFinanzas | undefined): FacturaFirmada[] {
  return (d?.facturas ?? []).filter((f) => f.tipo === "factura" && !f.anuladaAt);
}

export interface DocumentosDeFinanzas {
  liquidaciones: LiquidacionFirmada[];
  facturas: FacturaFirmada[];
  /** Solo para Central: las constancias de los abonos que confirmó Finanzas. */
  constancias?: ConstanciaDePago[];
}

export interface ConstanciaDePago {
  id: string;
  monto: number;
  moneda: string;
  fechaAbono: string;
  operacion: string;
  medio: string;
  url: string | null;
  registradoPor: string | null;
}

/**
 * LAS CONSTANCIAS DE PAGO, PARA EL EXPEDIENTE FÍSICO (buzón Jhon 19-10,
 * VIDAWASI PED-0035-2026): «Central no puede ver la constancia de pago para
 * que la pueda imprimir y adjuntar al expediente».
 *
 * Los abonos (pagos_pedido) y sus capturas (finanzas/…) siguen cerrados por
 * RLS para todos menos Finanzas y gerencia: acá se leen con la cuenta de
 * servicio, solo de los pedidos que la página ya le mostró a Central con su
 * sesión, y se firman por una hora. Se agregan al mapa de documentosDeFinanzas
 * (un pedido con solo constancias también entra).
 */
export async function agregarConstanciasDePago(
  admin: SupabaseClient,
  mapa: Map<string, DocumentosDeFinanzas>,
  servicioIds: string[],
): Promise<void> {
  const ids = [...new Set(servicioIds.filter(Boolean))];
  if (ids.length === 0) return;
  const filas: Fila[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const { data } = await admin
      .from("pagos_pedido")
      .select("id, servicio_id, monto, moneda, fecha_abono, operacion, medio, captura_path, created_at, perfiles!pagos_pedido_registrado_por_fkey(nombre)")
      .in("servicio_id", ids.slice(i, i + 50))
      .order("created_at", { ascending: true });
    filas.push(...((data ?? []) as Fila[]));
  }
  const rutas = filas.map((f) => f.captura_path as string | null).filter(Boolean) as string[];
  const urls = new Map<string, string>();
  if (rutas.length) {
    const { data: firmadas } = await admin.storage.from("adjuntos").createSignedUrls(rutas, 3600);
    for (const x of firmadas ?? []) if (x.path && x.signedUrl) urls.set(x.path, x.signedUrl);
  }
  for (const f of filas) {
    const id = f.servicio_id as string;
    let d = mapa.get(id);
    if (!d) mapa.set(id, (d = { liquidaciones: [], facturas: [] }));
    (d.constancias ??= []).push({
      id: f.id as string,
      monto: Number(f.monto),
      moneda: (f.moneda as string) ?? "USD",
      fechaAbono: f.fecha_abono as string,
      operacion: (f.operacion as string) ?? "",
      medio: (f.medio as string) ?? "",
      url: f.captura_path ? (urls.get(f.captura_path as string) ?? null) : null,
      registradoPor: ((f.perfiles as { nombre?: string } | null)?.nombre ?? null),
    });
  }
}

/**
 * ¿HAY UN ANTICIPO NUEVO POR FACTURAR? (Jhon 14-10, PRODECO PED-0010-2026).
 * Un pedido con pagos a cuenta se factura por partes: el 1.er adelanto con su
 * factura y, cuando entra otro pago, Finanzas sube una liquidación nueva con
 * «factura pendiente». Antes «Por facturar» solo miraba si el pedido tenía
 * alguna factura, así que el 2.º anticipo no le aparecía a Facturación.
 * Devuelve la liquidación vigente cuando dice «factura pendiente» y se subió
 * después de la última factura registrada (o no hay ninguna).
 */
export function liquidacionPorFacturar(d: DocumentosDeFinanzas | undefined): LiquidacionFirmada | null {
  const vigente = d?.liquidaciones[0];
  if (!vigente) return null;
  const vigentes = facturasVigentes(d);
  if (vigentes.length === 0) return vigente;
  if (vigente.facturaNumero) return null;
  const ultima = Math.max(...vigentes.map((f) => Date.parse(f.registradaAt)));
  return Date.parse(vigente.subidaAt) > ultima ? vigente : null;
}

type Fila = Record<string, unknown>;

/**
 * Los documentos de un lote de pedidos, firmados en una sola llamada. Un
 * pedido sin nada no aparece en el mapa. Las liquidaciones, de la más nueva a
 * la más vieja: la primera es la vigente.
 */
export async function documentosDeFinanzas(supabase: SupabaseClient, servicioIds: string[]): Promise<Map<string, DocumentosDeFinanzas>> {
  const mapa = new Map<string, DocumentosDeFinanzas>();
  const ids = [...new Set(servicioIds.filter(Boolean))];
  if (ids.length === 0) return mapa;

  const liq: Fila[] = [];
  const fac: Fila[] = [];
  // De a 50: `.in` con cientos de ids revienta la URL y vuelve vacío sin error.
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const [l, f] = await Promise.all([
      supabase
        .from("liquidaciones_pedido")
        .select("id, servicio_id, path, nombre, estado_pago, factura_numero, nota, subida_at, perfiles!liquidaciones_pedido_subida_por_fkey(nombre)")
        .in("servicio_id", lote)
        .order("subida_at", { ascending: false }),
      supabase
        .from("facturas_pedido")
        .select("id, servicio_id, numero, fecha_emision, path, nombre, nota, created_at, tipo, anula_a, anulada_at, motivo, perfiles!facturas_pedido_registrada_por_fkey(nombre)")
        .in("servicio_id", lote)
        .order("fecha_emision", { ascending: false }),
    ]);
    liq.push(...((l.data ?? []) as Fila[]));
    fac.push(...((f.data ?? []) as Fila[]));
  }

  const rutas = [...liq.map((x) => x.path as string), ...fac.map((x) => x.path as string | null)].filter(Boolean) as string[];
  const urls = new Map<string, string>();
  if (rutas.length) {
    const { data: firmadas } = await supabase.storage.from("adjuntos").createSignedUrls(rutas, 3600);
    for (const x of firmadas ?? []) if (x.path && x.signedUrl) urls.set(x.path, x.signedUrl);
  }
  const nombreDe = (x: Fila) => ((x.perfiles as { nombre?: string } | null)?.nombre ?? null);
  const de = (id: string) => {
    let d = mapa.get(id);
    if (!d) mapa.set(id, (d = { liquidaciones: [], facturas: [] }));
    return d;
  };
  for (const x of liq) {
    de(x.servicio_id as string).liquidaciones.push({
      id: x.id as string,
      nombre: x.nombre as string,
      url: urls.get(x.path as string) ?? null,
      estadoPago: x.estado_pago as EstadoPagoLiquidacion,
      facturaNumero: (x.factura_numero as string | null) ?? null,
      nota: (x.nota as string | null) ?? null,
      subidaAt: x.subida_at as string,
      subidaPor: nombreDe(x),
    });
  }
  for (const x of fac) {
    de(x.servicio_id as string).facturas.push({
      id: x.id as string,
      numero: x.numero as string,
      fechaEmision: x.fecha_emision as string,
      url: x.path ? (urls.get(x.path as string) ?? null) : null,
      nombre: (x.nombre as string | null) ?? null,
      nota: (x.nota as string | null) ?? null,
      registradaAt: x.created_at as string,
      registradaPor: nombreDe(x),
      tipo: ((x.tipo as string | null) ?? "factura") as "factura" | "nota_credito",
      anulaA: (x.anula_a as string | null) ?? null,
      anuladaAt: (x.anulada_at as string | null) ?? null,
      motivo: (x.motivo as string | null) ?? null,
    });
  }
  return mapa;
}

/**
 * La cotización que sostiene cada cierre (la enlazada al informe): «puede
 * haber cotizado veinte; necesita la última, porque está enlazada con el
 * cierre». Devuelve id y código por informe.
 */
export async function cotizacionesDeCierres(
  supabase: SupabaseClient,
  informeIds: string[],
): Promise<Map<string, { id: string; codigo: string }>> {
  const mapa = new Map<string, { id: string; codigo: string }>();
  const ids = [...new Set(informeIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 50) {
    const { data } = await supabase
      .from("informes_cierre")
      .select("id, cotizacion_id, cotizaciones!informes_cierre_cotizacion_id_fkey(id, codigo)")
      .in("id", ids.slice(i, i + 50))
      .not("cotizacion_id", "is", null);
    for (const f of (data ?? []) as Fila[]) {
      const c = f.cotizaciones as { id: string; codigo: string } | null;
      if (c?.id) mapa.set(f.id as string, { id: c.id, codigo: c.codigo });
    }
  }
  return mapa;
}

export interface Congruencia {
  /** Lo que coincide, dicho corto («Misma empresa: Open»). */
  bien: string[];
  /** Lo que no coincide o falta: el facturador lo mira antes de facturar. */
  alertas: string[];
}

/**
 * ¿ESTÁ ALINEADO EL EXPEDIENTE? (reunión 25-09 11:44). Gerencia: «la
 * cotización debe ser de Open, el cierre debe ser de Open, debe estar
 * totalmente alineado… ya nos ha pasado que la orden de compra indica un RUC
 * y la cotización otro». Lo que se puede cruzar solo se cruza acá: empresa,
 * documento del cliente, moneda y monto (la cotización guarda el neto; el
 * cierre, con IGV). La orden de compra es un PDF: se dice si está adjunta y
 * el facturador la lee.
 */
export async function congruenciaDeCierres(
  supabase: SupabaseClient,
  informeIds: string[],
): Promise<Map<string, Congruencia>> {
  const mapa = new Map<string, Congruencia>();
  const ids = [...new Set(informeIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 50) {
    const { data } = await supabase
      .from("informes_cierre")
      .select(
        "id, serie, cliente_doc, moneda, monto_total, adjuntos, cotizacion_id, cotizaciones!informes_cierre_cotizacion_id_fkey(codigo, serie, moneda, cliente_snapshot, cotizacion_items(subtotal))",
      )
      .in("id", ids.slice(i, i + 50));
    for (const f of (data ?? []) as Fila[]) {
      const bien: string[] = [];
      const alertas: string[] = [];
      const empresa = (s: unknown) => (s === "OPEN" ? "Open" : "Efameinsa");
      const c = f.cotizaciones as
        | { codigo: string; serie: string; moneda: string; cliente_snapshot: { num_doc?: string | null } | null; cotizacion_items: { subtotal: number }[] }
        | null;
      const adjuntos = (f.adjuntos as { tipo: string }[] | null) ?? [];
      if (!f.cotizacion_id || !c) {
        alertas.push("El cierre no tiene la cotización enlazada: pídala a Central.");
      } else {
        if (c.serie === f.serie) bien.push(`Misma empresa: ${empresa(f.serie)}`);
        else alertas.push(`La cotización ${c.codigo} es de ${empresa(c.serie)} y el cierre de ${empresa(f.serie)}.`);
        const docCot = (c.cliente_snapshot?.num_doc ?? "").trim();
        const docCierre = String(f.cliente_doc ?? "").trim();
        if (!docCot) alertas.push(`La cotización ${c.codigo} no tiene RUC/DNI del cliente.`);
        else if (docCierre && docCot !== docCierre) alertas.push(`El RUC de la cotización (${docCot}) no es el del cierre (${docCierre}).`);
        else if (docCierre) bien.push(`Mismo RUC/DNI: ${docCierre}`);
        if (c.moneda && f.moneda && c.moneda !== f.moneda) alertas.push(`La cotización está en ${c.moneda} y el cierre en ${f.moneda}.`);
        const neto = (c.cotizacion_items ?? []).reduce((n, it) => n + Number(it.subtotal ?? 0), 0);
        const conIgv = Math.round(neto * 1.18 * 100) / 100;
        const total = Number(f.monto_total ?? 0);
        if (neto > 0 && total > 0) {
          if (Math.abs(conIgv - total) <= 1) bien.push("El monto del cierre es el de la cotización (con IGV)");
          else alertas.push(`La cotización suma ${conIgv.toLocaleString("es-PE", { minimumFractionDigits: 2 })} con IGV y el cierre ${total.toLocaleString("es-PE", { minimumFractionDigits: 2 })}: revise si hubo descuento o flete.`);
        }
      }
      if (adjuntos.some((a) => a.tipo === "orden_compra")) bien.push("Orden de compra adjunta: léala y compare el RUC");
      else alertas.push("No hay orden de compra adjunta en el expediente (si el cliente la mandó, pídala).");
      mapa.set(f.id as string, { bien, alertas });
    }
  }
  return mapa;
}
