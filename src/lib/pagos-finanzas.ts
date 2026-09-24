import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluarPagoParaDespacho, textoCondicionPago, type ServicioPostventa } from "@/lib/postventa";
import { firmarAdjuntosDeCierres, type AdjuntoCierre, type AdjuntoCierreFirmado } from "@/lib/adjuntos-cierre";
import { hoyLima } from "@/lib/periodo";

/**
 * LO QUE FINANZAS MIRA DE UN PEDIDO (0279).
 *
 * Gerencia, 23-09: John confirma él mismo los pagos. Lo que importa es lo
 * ACREDITADO en el banco, no el voucher (Carlos, 01-09: «nos mandan
 * vouchers… tipo falso Yape»). Cada fila de sus listas contesta tres cosas
 * sin abrir nada: cuánto debe estar acreditado según la condición de pago,
 * cuánto ya se confirmó y a qué cuenta mirar (Open o Efameinsa).
 */
export interface PedidoFinanzas {
  id: string;
  cuentaId: string | null;
  cliente: string;
  clienteDoc: string | null;
  equipo: string | null;
  moneda: string;
  total: number | null;
  pagado: number;
  requerido: number;
  falta: number;
  saldo: number;
  pct: number | null;
  condicion: string | null;
  creditoDias: number | null;
  fechaDespacho: string | null;
  despachadoAt: string | null;
  venceEl: string | null;
  diasParaVencer: number | null;
  observadoAt: string | null;
  observadoMotivo: string | null;
  /** Postventa pidió confirmar el abono y todavía no hay respuesta (0295; se limpia al contestar, 0296). */
  solicitadoAt: string | null;
  /** La sirena de Central (0298): cuándo fue el último aviso, por qué y cuántos lleva. */
  urgenciaAt: string | null;
  urgenciaMotivo: string | null;
  urgenciaN: number;
  /** La evidencia de la observación (ruta en el bucket). */
  observadoAdjunto: string | null;
  pagoConfirmadoAt: string | null;
  pagoConfirmadoDetalle: string | null;
  liberadoAt: string | null;
  informeId: string | null;
  codigoCierre: string | null;
  serie: "EFAMEINSA" | "OPEN" | null;
  comprobante: string | null;
  modalidadPago: string[];
  entregaLugar: string | null;
  entregaFecha: string | null;
  comercialId: string | null;
  comercialNombre: string | null;
  numeroErp: string | null;
  adjuntos: AdjuntoCierreFirmado[];
}

const COLUMNAS =
  "id, cuenta_id, cliente_texto, equipo, moneda, monto, monto_pagado, pct_antes_despacho, credito_dias, fecha_despacho, despachado_at, pago_observado_at, pago_observado_motivo, pago_observado_adjunto, pago_solicitado_at, urgencia_finanzas_at, urgencia_finanzas_motivo, urgencia_finanzas_n, pago_confirmado_at, pago_confirmado_detalle, pedido_ejecutado_at, liquidacion_at, informe_cierre_id, numero_pedido_erp, cerrado_at, completado, created_at";

const limpiarCliente = (t: string | null) => (t ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");
const dia = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((new Date(hasta + "T12:00:00-05:00").getTime() - new Date(desde + "T12:00:00-05:00").getTime()) / 864e5);
}

/** Suma un número de días a una fecha AAAA-MM-DD. */
function sumarDias(fecha: string, dias: number): string {
  return new Date(new Date(fecha + "T12:00:00-05:00").getTime() + dias * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

type Fila = Record<string, unknown>;

async function armar(supabase: SupabaseClient, filas: Fila[]): Promise<PedidoFinanzas[]> {
  const idsInforme = [...new Set(filas.map((f) => f.informe_cierre_id as string | null).filter(Boolean))] as string[];
  // De a 50: `.in` con cientos de ids revienta la URL y vuelve vacío sin error.
  const informes: Fila[] = [];
  for (let i = 0; i < idsInforme.length; i += 50) {
    const { data } = await supabase
      .from("informes_cierre")
      .select("id, codigo, serie, comprobante, modalidad_pago, entrega_lugar, entrega_fecha, cliente_doc, creado_por, adjuntos, anulado_at")
      .in("id", idsInforme.slice(i, i + 50));
    informes.push(...((data ?? []) as Fila[]));
  }
  const porInforme = new Map(informes.map((i) => [i.id as string, i]));
  const firmados = await firmarAdjuntosDeCierres(
    supabase,
    informes.map((i) => ({ id: i.id as string, adjuntos: (i.adjuntos as AdjuntoCierre[] | null) ?? [] })),
  );
  const idsComercial = [...new Set(informes.map((i) => i.creado_por as string | null).filter(Boolean))] as string[];
  const { data: perfiles } = idsComercial.length
    ? await supabase.from("perfiles").select("id, nombre, codigo_comercial").in("id", idsComercial)
    : { data: [] as Fila[] };
  const nombre = new Map(((perfiles ?? []) as Fila[]).map((p) => [p.id as string, `${p.codigo_comercial ? `${p.codigo_comercial} · ` : ""}${p.nombre}`]));
  const hoy = hoyLima();

  return filas
    .filter((f) => !porInforme.get(f.informe_cierre_id as string)?.anulado_at)
    .map((f) => {
      const s = f as unknown as ServicioPostventa;
      const pago = evaluarPagoParaDespacho(s);
      const inf = porInforme.get(f.informe_cierre_id as string);
      const total = f.monto == null ? null : Number(f.monto);
      const pagado = Number(f.monto_pagado ?? 0);
      const creditoDias = f.credito_dias == null ? null : Number(f.credito_dias);
      const despachadoAt = (f.despachado_at as string | null) ?? null;
      const venceEl = despachadoAt ? sumarDias(dia(despachadoAt), creditoDias ?? 0) : null;
      return {
        id: f.id as string,
        cuentaId: (f.cuenta_id as string | null) ?? null,
        cliente: limpiarCliente(f.cliente_texto as string | null),
        clienteDoc: (inf?.cliente_doc as string | null) ?? null,
        equipo: (f.equipo as string | null) ?? null,
        moneda: (f.moneda as string | null) ?? "USD",
        total,
        pagado,
        requerido: pago.requerido,
        falta: Math.max(0, Number((pago.requerido - pagado).toFixed(2))),
        saldo: total == null ? 0 : Math.max(0, Number((total - pagado).toFixed(2))),
        pct: pago.pct,
        condicion: textoCondicionPago(s),
        creditoDias,
        fechaDespacho: (f.fecha_despacho as string | null) ?? null,
        despachadoAt,
        venceEl,
        diasParaVencer: venceEl ? diasEntre(hoy, venceEl) : null,
        observadoAt: (f.pago_observado_at as string | null) ?? null,
        observadoMotivo: (f.pago_observado_motivo as string | null) ?? null,
        // Confirmar u observar lo limpian en la base (0296): si está, espera respuesta.
        solicitadoAt: (f.pago_solicitado_at as string | null) ?? null,
        urgenciaAt: (f.urgencia_finanzas_at as string | null) ?? null,
        urgenciaMotivo: (f.urgencia_finanzas_motivo as string | null) ?? null,
        urgenciaN: Number(f.urgencia_finanzas_n ?? 0),
        observadoAdjunto: (f.pago_observado_adjunto as string | null) ?? null,
        pagoConfirmadoAt: (f.pago_confirmado_at as string | null) ?? null,
        pagoConfirmadoDetalle: (f.pago_confirmado_detalle as string | null) ?? null,
        liberadoAt: (f.pedido_ejecutado_at as string | null) ?? null,
        informeId: (f.informe_cierre_id as string | null) ?? null,
        codigoCierre: (inf?.codigo as string | null) ?? null,
        serie: (inf?.serie as "EFAMEINSA" | "OPEN" | null) ?? null,
        comprobante: (inf?.comprobante as string | null) ?? null,
        modalidadPago: (inf?.modalidad_pago as string[] | null) ?? [],
        entregaLugar: (inf?.entrega_lugar as string | null) ?? null,
        entregaFecha: (inf?.entrega_fecha as string | null) ?? null,
        comercialId: (inf?.creado_por as string | null) ?? null,
        comercialNombre: inf?.creado_por ? (nombre.get(inf.creado_por as string) ?? null) : null,
        numeroErp: (f.numero_pedido_erp as string | null) ?? null,
        adjuntos: firmados.get(f.informe_cierre_id as string) ?? [],
      };
    });
}

/**
 * POR CONFIRMAR: pedidos que Central ya liberó (nacieron de un cierre en el
 * CRM), que todavía no salieron y a los que les falta dinero acreditado según
 * su condición de pago. Primero lo que se despacha antes; lo observado va
 * arriba de su grupo porque alguien espera respuesta.
 */
export async function pedidosPorConfirmar(supabase: SupabaseClient): Promise<PedidoFinanzas[]> {
  const { data } = await supabase
    .from("servicios_postventa")
    .select(COLUMNAS)
    .not("informe_cierre_id", "is", null)
    .not("pedido_ejecutado_at", "is", null)
    .is("despachado_at", null)
    .is("cerrado_at", null)
    .eq("completado", false)
    .order("created_at", { ascending: true })
    .limit(300);
  const pedidos = await armar(supabase, (data ?? []) as Fila[]);
  return pedidos
    // A crédito total no se espera ningún abono antes de salir: esos van a
    // Cuentas por cobrar cuando se despachen.
    .filter((p) => p.total != null && p.falta > 0)
    .sort((a, b) => {
      // La sirena de Central va primero de todo (0298): el cliente necesita la
      // factura o quiere despachar. Entre dos, la más reciente arriba.
      if (Boolean(a.urgenciaAt) !== Boolean(b.urgenciaAt)) return a.urgenciaAt ? -1 : 1;
      if (a.urgenciaAt && b.urgenciaAt && a.urgenciaAt !== b.urgenciaAt) return a.urgenciaAt > b.urgenciaAt ? -1 : 1;
      // Lo que postventa está esperando va después (0295).
      if (Boolean(a.solicitadoAt) !== Boolean(b.solicitadoAt)) return a.solicitadoAt ? -1 : 1;
      const fa = a.fechaDespacho ?? "9999-12-31";
      const fb = b.fechaDespacho ?? "9999-12-31";
      if (fa !== fb) return fa < fb ? -1 : 1;
      if (Boolean(a.observadoAt) !== Boolean(b.observadoAt)) return a.observadoAt ? -1 : 1;
      return (a.liberadoAt ?? "") < (b.liberadoAt ?? "") ? -1 : 1;
    });
}

/**
 * CUENTAS POR COBRAR: ya salieron y todavía deben. El vencimiento es la
 * fecha de salida más los días de crédito acordados en el cierre (0232).
 */
export async function cuentasPorCobrar(supabase: SupabaseClient): Promise<PedidoFinanzas[]> {
  const { data } = await supabase
    .from("servicios_postventa")
    .select(COLUMNAS)
    .not("informe_cierre_id", "is", null)
    .not("despachado_at", "is", null)
    .not("monto", "is", null)
    .order("despachado_at", { ascending: true })
    .limit(500);
  const pedidos = await armar(supabase, (data ?? []) as Fila[]);
  return pedidos
    .filter((p) => p.saldo > 0.009)
    .sort((a, b) => (a.diasParaVencer ?? 0) - (b.diasParaVencer ?? 0));
}

export async function unPedido(supabase: SupabaseClient, id: string): Promise<PedidoFinanzas | null> {
  const { data } = await supabase.from("servicios_postventa").select(COLUMNAS).eq("id", id).maybeSingle();
  if (!data) return null;
  const [p] = await armar(supabase, [data as Fila]);
  return p ?? null;
}

export interface AbonoConfirmado {
  id: string;
  servicioId: string;
  cliente: string;
  monto: number;
  moneda: string;
  fechaAbono: string;
  operacion: string;
  medio: string;
  capturaUrl: string | null;
  nota: string | null;
  registradoPor: string | null;
  createdAt: string;
  /** Lo que el banco descontó y su evidencia (0292, 0295). */
  descuentoMonto: number | null;
  descuentoMotivo: string | null;
  descuentoUrl: string | null;
}

export async function abonos(
  supabase: SupabaseClient,
  filtro: { servicioId?: string; desde?: string; hasta?: string; q?: string; limite?: number },
): Promise<AbonoConfirmado[]> {
  let consulta = supabase
    .from("pagos_pedido")
    .select("id, servicio_id, monto, moneda, fecha_abono, operacion, medio, captura_path, nota, registrado_por, created_at, descuento_monto, descuento_motivo, descuento_adjunto, servicios_postventa(cliente_texto), perfiles!pagos_pedido_registrado_por_fkey(nombre)")
    .order("created_at", { ascending: false })
    .limit(filtro.limite ?? 300);
  if (filtro.servicioId) consulta = consulta.eq("servicio_id", filtro.servicioId);
  if (filtro.desde) consulta = consulta.gte("fecha_abono", filtro.desde);
  if (filtro.hasta) consulta = consulta.lte("fecha_abono", filtro.hasta);
  const { data } = await consulta;
  let filas = (data ?? []) as Fila[];
  const q = filtro.q?.trim().toLowerCase();
  if (q) {
    filas = filas.filter((f) =>
      [(f.servicios_postventa as Fila | null)?.cliente_texto, f.operacion, f.medio].some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }
  const rutas = filas.flatMap((f) => [f.captura_path as string | null, f.descuento_adjunto as string | null]).filter(Boolean) as string[];
  const urls = new Map<string, string>();
  if (rutas.length) {
    const { data: firmadas } = await supabase.storage.from("adjuntos").createSignedUrls(rutas, 3600);
    for (const x of firmadas ?? []) if (x.path && x.signedUrl) urls.set(x.path, x.signedUrl);
  }
  return filas.map((f) => ({
    id: f.id as string,
    servicioId: f.servicio_id as string,
    cliente: limpiarCliente(((f.servicios_postventa as Fila | null)?.cliente_texto as string | null) ?? null),
    monto: Number(f.monto),
    moneda: (f.moneda as string) ?? "USD",
    fechaAbono: f.fecha_abono as string,
    operacion: f.operacion as string,
    medio: f.medio as string,
    capturaUrl: f.captura_path ? (urls.get(f.captura_path as string) ?? null) : null,
    nota: (f.nota as string | null) ?? null,
    registradoPor: ((f.perfiles as Fila | null)?.nombre as string | null) ?? null,
    createdAt: f.created_at as string,
    descuentoMonto: f.descuento_monto == null ? null : Number(f.descuento_monto),
    descuentoMotivo: (f.descuento_motivo as string | null) ?? null,
    descuentoUrl: f.descuento_adjunto ? (urls.get(f.descuento_adjunto as string) ?? null) : null,
  }));
}

export interface AvisoAFinanzas {
  id: string;
  detalle: string;
  cliente: string | null;
  servicioId: string | null;
  createdAt: string;
}

/** Lo que Central le mandó a Finanzas (antes solo por WhatsApp y correo). */
export async function avisosDeCentral(supabase: SupabaseClient, dias = 14): Promise<AvisoAFinanzas[]> {
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const { data } = await supabase
    .from("avisos_derivados")
    .select("id, detalle, servicio_id, created_at, leads(nombre, empresa)")
    .eq("a_finanzas", true)
    .is("revertido_at", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(30);
  return ((data ?? []) as Fila[]).map((a) => {
    const lead = a.leads as Fila | null;
    return {
      id: a.id as string,
      detalle: (a.detalle as string) ?? "",
      cliente: ((lead?.empresa as string | null) || (lead?.nombre as string | null)) ?? null,
      servicioId: (a.servicio_id as string | null) ?? null,
      createdAt: a.created_at as string,
    };
  });
}

export const MEDIOS_DE_PAGO = ["BCP", "BBVA", "Interbank", "Scotiabank", "Banco de la Nación", "Yape / Plin", "Efectivo", "Otro"] as const;

export function formatoMonto(moneda: string, n: number): string {
  return `${moneda === "PEN" ? "S/" : "US$"} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
