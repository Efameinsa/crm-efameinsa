import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, MessageCircle, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { PedidoPostventa } from "@/components/crm/pedido-postventa";
import { EquipoConSeries } from "@/components/crm/equipo-con-series";
import { fechaCalendario } from "@/lib/fechas";
import {
  queLoFrena,
  saldoPendiente,
  avancePedido,
  etiquetaResponsable,
  puedeVerPrecios,
  sinPrecios,
  estadoPago,
  seriesDeTexto,
  ETIQUETA_ESTADO_PAGO,
  type ServicioPostventa,
} from "@/lib/postventa";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * El expediente del pedido, que hasta hoy era un file de papel.
 *
 * Arriba, lo que contesta la pregunta con la que cualquiera abre esta pantalla:
 * de quién es el cliente, qué máquina es, cuánto pagó y —sobre todo— qué lo
 * está frenando. Abajo, los pasos. Al final, los documentos que subió el
 * comercial, que son los que antes venían impresos dentro del file.
 */

interface Adjunto {
  tipo?: string;
  path: string;
  nombre: string;
}

const ETIQUETA_ADJUNTO: Record<string, string> = {
  cotizacion: "Cotización",
  orden_compra: "Orden de compra",
  voucher: "Voucher",
  acuerdo: "Acuerdo firmado",
  otro: "Documento",
};

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const { data } = await supabase.from("servicios_postventa").select("*").eq("id", id).single();
  if (!data) notFound();

  // Las cifras de la venta se tapan acá, en el servidor, antes de armar la
  // pantalla: al navegador de postventa no le llega ningún monto (Carlos,
  // 27-08). Lo que sí le llega es en qué está el pago, que es lo que necesita
  // para decidir si despacha.
  const verPrecios = puedeVerPrecios(perfil);
  const crudo = data as unknown as ServicioPostventa;
  const servicio = verPrecios ? crudo : sinPrecios(crudo);
  const pago = estadoPago(servicio);

  const { data: informe } = servicio.informe_cierre_id
    ? await supabase
        .from("informes_cierre")
        .select("id, codigo, serie, cliente_nombre, cliente_doc, orden_compra, adjuntos, entrega_direccion, contacto_despacho")
        .eq("id", servicio.informe_cierre_id)
        .single()
    : { data: null };

  // Las series que nombra el equipo, para poder abrir la máquina desde acá: es
  // el eje de la trazabilidad (D6) y hasta hoy era texto muerto en un renglón
  // gris. Se piden solo las de este pedido.
  const seriesDelPedido = seriesDeTexto(servicio.equipo);
  const { data: equiposDelPedido } = seriesDelPedido.length
    ? await supabase.from("equipos_instalados").select("id, serie").in("serie", seriesDelPedido)
    : { data: [] };
  const fichaPorSerie = new Map(
    (equiposDelPedido ?? []).map((e) => [String(e.serie).toUpperCase(), e.id as string]),
  );

  const frena = queLoFrena(servicio);
  const saldo = saldoPendiente(servicio);
  const total = Number(servicio.monto ?? 0);
  const pagado = Number(servicio.monto_pagado ?? 0);
  const avance = avancePedido(servicio);
  const adjuntos = (informe?.adjuntos ?? []) as Adjunto[];

  const contacto = informe?.contacto_despacho as { nombre?: string; telefono?: string } | null;
  const telefono = contacto?.telefono?.replace(/\D/g, "");

  return (
    <div className="space-y-4">
      <Link
        href="/postventa"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Volver a postventa
      </Link>

      {/* Cabecera: quién, qué, cuánto y qué lo frena. */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[240px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold leading-tight text-foreground">
                {servicio.cliente_texto ?? "Cliente sin nombre"}
              </h1>
              {servicio.modalidad && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold capitalize text-foreground">
                  {servicio.modalidad}
                </span>
              )}
            </div>
            <EquipoConSeries texto={servicio.equipo} fichaPorSerie={fichaPorSerie} className="mt-1" />
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {informe?.codigo ? `Cierre Nº ${informe.codigo}` : "Sin informe de cierre"}
              {servicio.numero_pedido_erp && ` · Pedido ERP ${servicio.numero_pedido_erp}`}
              {informe?.orden_compra && ` · OC ${informe.orden_compra}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {telefono && (
              <a
                href={`https://wa.me/51${telefono.slice(-9)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <MessageCircle className="size-3.5" /> WhatsApp
              </a>
            )}
            {informe?.id && (
              <a
                href={`/api/informes/${informe.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <FileText className="size-3.5" /> Cierre en PDF
              </a>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {verPrecios && total > 0 && (
            <>
              <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                {servicio.moneda} {total.toLocaleString("es-PE")}
              </span>
              <span className="h-2 w-32 overflow-hidden rounded-full bg-secondary">
                <span
                  className="block h-full bg-primary"
                  style={{ width: `${Math.min(100, Math.round((pagado / total) * 100))}%` }}
                />
              </span>
              <span className="text-xs text-muted-foreground">
                {pagado > 0 ? `${Math.round((pagado / total) * 100)}% pagado` : "sin pagos registrados"}
                {saldo > 0 && ` · faltan ${servicio.moneda} ${saldo.toLocaleString("es-PE")}`}
              </span>
            </>
          )}
          {/* Sin cifras: el pago dicho como estado. Es lo que decide el
              despacho —«si yo no sé si ha pagado completo o parcial, no voy a
              poder hacer mi trabajo»— sin exponer la venta. */}
          {!verPrecios && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                pago === "completo"
                  ? "bg-[#1E7F4F]/10 text-[#1E7F4F]"
                  : pago === "parcial"
                    ? "bg-amber-500/10 text-amber-800"
                    : "bg-secondary text-muted-foreground",
              )}
            >
              {ETIQUETA_ESTADO_PAGO[pago]}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {avance.hechos} de {avance.total} pasos
          </span>
        </div>

        {/* La única pregunta que importa al abrir la ficha. Y también reparte
            la responsabilidad: un despacho frenado por el saldo no es demora
            de postventa. */}
        {frena && (
          <p
            className={cn(
              "mt-3 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold",
              frena.grave
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-border bg-secondary/60 text-foreground",
            )}
          >
            {frena.grave ? "DETENIDO" : "SIGUIENTE"}
            <span className="font-normal">
              {frena.texto} · {etiquetaResponsable(frena.responsable)}
            </span>
          </p>
        )}
        {!frena && (
          <p className="mt-3 inline-flex rounded-md border border-[#1E7F4F]/30 bg-[#1E7F4F]/10 px-3 py-1.5 text-xs font-semibold text-[#1E7F4F]">
            Pedido completado
          </p>
        )}
      </div>

      {/* Dos columnas (Santos, 01-09: «es muy larga horizontalmente… pon una
          columna derecha donde estén los documentos del expediente»): a la
          izquierda el seguimiento del pedido —el riel, como el tracking de
          una encomienda—, a la derecha los papeles y los datos de entrega,
          que se consultan pero no se recorren. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <PedidoPostventa servicio={servicio} verPrecios={verPrecios} />

        <div className="space-y-4">
          {/* Los documentos del expediente. Antes venían impresos dentro del
              file que Finanzas bajaba; ahora son estos. */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground">
              Documentos del expediente
            </h2>
            {adjuntos.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                El comercial todavía no adjuntó nada al cierre. Acá van la cotización, la orden de compra, los
                vouchers y los acuerdos firmados.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {adjuntos.map((a) => (
                  <li
                    key={a.path}
                    className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-xs"
                  >
                    <Paperclip className="size-3.5 flex-none text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-foreground">
                        {ETIQUETA_ADJUNTO[a.tipo ?? "otro"] ?? "Documento"}
                      </span>
                      <span className="block truncate text-muted-foreground">{a.nombre}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground">Datos de la entrega</h2>
            <dl className="mt-2 space-y-2.5 text-xs">
              <Dato etiqueta="Dirección de entrega">
                {servicio.direccion_entrega ?? informe?.entrega_direccion ?? servicio.ubicacion ?? "—"}
              </Dato>
              <Dato etiqueta="Quien recibe">{servicio.recibe_nombre ?? contacto?.nombre ?? "—"}</Dato>
              <Dato etiqueta="Forma de pago">{servicio.forma_pago ?? "—"}</Dato>
              <Dato etiqueta="Fecha de la venta">{fechaCalendario(servicio.fecha_confirmacion)}</Dato>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}
