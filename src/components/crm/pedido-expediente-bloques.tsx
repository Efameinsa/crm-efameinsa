import Link from "@/components/enlace";
import { FileText, MessageCircle, Paperclip } from "lucide-react";
import type { createClient } from "@/lib/supabase/server";
import { ETIQUETA_ESTADO_PAGO, estadoPago, saldoPendiente, seriesDeTexto, type FotoAlmacen, type ServicioPostventa } from "@/lib/postventa";
import { cn } from "@/lib/utils";

/**
 * LO QUE LA FICHA DEL PEDIDO MUESTRA ALREDEDOR DE LOS PASOS (auditoría 25-09).
 *
 * La ficha nueva (/nuevo/pedido) tenía los pasos, pero no las herramientas de
 * la cabecera (WhatsApp, la apertura, el cierre en PDF), el pago ni los papeles
 * del expediente: había que volver a la ficha de siempre. Acá viven una sola
 * vez, con las mismas reglas: las cifras solo a quien ve precios.
 */

type Cliente = Awaited<ReturnType<typeof createClient>>;

interface AdjuntoCrudo {
  tipo?: string;
  path: string;
  nombre: string;
}

export interface AdjuntoFirmado extends AdjuntoCrudo {
  url: string | null;
}

const ETIQUETA_ADJUNTO: Record<string, string> = {
  cotizacion: "Cotización",
  orden_compra: "Orden de compra",
  voucher: "Voucher",
  acuerdo: "Acuerdo firmado",
  otro: "Documento",
};

/** Firma los papeles del cierre, las fotos del almacén y la captura de Finanzas, y ubica las fichas de las series. */
export async function cargarExpedientePedido(
  supabase: Cliente,
  servicio: ServicioPostventa & { protocolo_fotos?: unknown; salida_fotos?: unknown; agencia_fotos?: unknown },
  adjuntosCierre: AdjuntoCrudo[],
) {
  const fotos: FotoAlmacen[] = [
    ...(((servicio.protocolo_fotos ?? []) as (FotoAlmacen | null)[])),
    ...(((servicio.salida_fotos ?? []) as (FotoAlmacen | null)[])),
    ...(((servicio.agencia_fotos ?? []) as (FotoAlmacen | null)[])),
  ].filter((f): f is FotoAlmacen => Boolean(f && typeof f.path === "string" && f.path));
  const capturaPath = (servicio as { pago_confirmado_captura?: string | null }).pago_confirmado_captura ?? null;
  const rutas = [...fotos.map((f) => f.path), ...adjuntosCierre.map((a) => a.path), ...(capturaPath ? [capturaPath] : [])];
  const url = new Map<string, string>();
  if (rutas.length) {
    const { data } = await supabase.storage.from("adjuntos").createSignedUrls(rutas, 3600);
    for (const x of data ?? []) if (x.path && x.signedUrl) url.set(x.path, x.signedUrl);
  }
  const series = seriesDeTexto(servicio.equipo);
  const { data: fichas } = series.length ? await supabase.from("equipos_instalados").select("id, serie").in("serie", series) : { data: [] };
  return {
    galeria: fotos.map((f) => ({ ...f, url: url.get(f.path) ?? null })),
    adjuntos: adjuntosCierre.map((a) => ({ ...a, url: url.get(a.path) ?? null })) as AdjuntoFirmado[],
    // La captura del abono es de Finanzas y gerencia (0306): para los demás no se firma.
    capturaUrl: capturaPath ? (url.get(capturaPath) ?? null) : null,
    fichaPorSerie: new Map(((fichas ?? []) as { id: string; serie: string }[]).map((e) => [String(e.serie).toUpperCase(), e.id])),
  };
}

/** WhatsApp al contacto del despacho, la apertura (prepararla o verla) y el cierre en PDF. */
export function HerramientasPedido({
  servicioId,
  aperturaEmitida,
  informeId,
  telefono,
}: {
  servicioId: string;
  aperturaEmitida: boolean;
  informeId: string | null;
  telefono: string | null;
}) {
  const tel = telefono?.replace(/\D/g, "") ?? "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tel.length >= 9 && (
        <a
          href={`https://wa.me/51${tel.slice(-9)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <MessageCircle className="size-3.5" /> WhatsApp
        </a>
      )}
      <Link
        href={`/postventa/pedidos/${servicioId}/apertura`}
        className={
          aperturaEmitida
            ? "inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
            : "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
        }
      >
        <FileText className="size-3.5" />
        {aperturaEmitida ? "Apertura de servicio" : "Preparar la apertura"}
      </Link>
      {informeId && (
        <a
          href={`/api/informes/${informeId}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <FileText className="size-3.5" /> Cierre en PDF
        </a>
      )}
    </div>
  );
}

/** La forma de pago y, según quién mira, el monto con su avance o el estado del pago sin cifras. */
export function PagoDelPedido({ servicio, verPrecios, modalidadPago }: { servicio: ServicioPostventa; verPrecios: boolean; modalidadPago: string[] | null }) {
  const total = Number(servicio.monto ?? 0);
  const pagado = Number(servicio.monto_pagado ?? 0);
  const saldo = saldoPendiente(servicio);
  const pago = estadoPago(servicio);
  const forma = modalidadPago && modalidadPago.length > 0 ? modalidadPago.join(" · ") : servicio.forma_pago;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {forma && (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-foreground">
          <span className="font-semibold">Forma de pago:</span> {forma}
        </span>
      )}
      {verPrecios && total > 0 ? (
        <>
          <span className="font-mono text-sm font-bold tabular-nums text-foreground">
            {servicio.moneda} {total.toLocaleString("es-PE")}
          </span>
          <span className="h-2 w-32 overflow-hidden rounded-full bg-secondary">
            <span className="block h-full bg-primary" style={{ width: `${Math.min(100, Math.round((pagado / total) * 100))}%` }} />
          </span>
          <span className="text-xs text-muted-foreground">
            {pagado > 0 ? `${Math.round((pagado / total) * 100)}% pagado` : "sin pagos registrados"}
            {saldo > 0 && ` · faltan ${servicio.moneda} ${saldo.toLocaleString("es-PE")}`}
          </span>
        </>
      ) : (
        !verPrecios && (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
              pago === "completo" ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : pago === "parcial" ? "bg-amber-500/10 text-amber-800" : "bg-secondary text-muted-foreground",
            )}
          >
            {ETIQUETA_ESTADO_PAGO[pago]}
          </span>
        )
      )}
    </div>
  );
}

/** Los papeles del expediente (OC, voucher, cotización firmada, acuerdos), para abrirlos. */
export function DocumentosExpedientePedido({ adjuntos, verPrecios }: { adjuntos: AdjuntoFirmado[]; verPrecios: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground">Documentos del expediente</h2>
      {!verPrecios && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">La OC y el voucher pueden traer montos; en el CRM las cifras siguen ocultas.</p>}
      {adjuntos.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          El comercial todavía no adjuntó nada al cierre. Acá van la cotización, la orden de compra, los vouchers y los acuerdos firmados.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {adjuntos.map((a) => {
            const cuerpo = (
              <>
                <Paperclip className="size-3.5 flex-none text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block font-semibold text-foreground">{ETIQUETA_ADJUNTO[a.tipo ?? "otro"] ?? "Documento"}</span>
                  <span className="block truncate text-muted-foreground">{a.nombre}</span>
                </span>
              </>
            );
            return (
              <li key={a.path}>
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" title={`Abrir ${a.nombre}`} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-xs hover:bg-accent">
                    {cuerpo}
                  </a>
                ) : (
                  <span title="El archivo no se encontró en el almacenamiento" className="flex items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-xs">
                    {cuerpo}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
