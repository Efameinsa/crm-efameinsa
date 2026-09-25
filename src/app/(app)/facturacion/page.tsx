import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ExpedienteCierre } from "@/components/crm/expediente-cierre";
import { DocumentosFinanzasLista } from "@/components/crm/documentos-finanzas-lista";
import { ObservarExpediente, RegistrarFactura } from "@/components/crm/acciones-facturacion";
import { formatoMonto, pedidosConLiquidacion, type PedidoFinanzas } from "@/lib/pagos-finanzas";
import {
  congruenciaDeCierres,
  cotizacionesDeCierres,
  documentosDeFinanzas,
  etiquetaEstadoPago,
  type Congruencia,
  type DocumentosDeFinanzas,
} from "@/lib/documentos-finanzas";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * POR FACTURAR (0306, reunión 25-09 11:44).
 *
 * Gerencia: «todo el expediente va a las manos del facturador: cotización,
 * orden de compra, orden de servicio, hasta el cierre y el pedido. Si está
 * mal, para; si está bien, continúa: factura, sube y cierra su tema». Entra
 * acá todo pedido al que Finanzas ya le subió liquidación y que todavía no
 * tiene factura. Cada fila trae lo que el sistema puede cruzar solo (empresa,
 * RUC, moneda, monto, OC adjunta) para que el facturador lea lo demás.
 * Arriba, lo observado: está parado hasta que Central lo corrija.
 */
export default async function PorFacturarPage() {
  await requerirPerfil();
  const supabase = await createClient();
  const pedidos = await pedidosConLiquidacion(supabase, 400);
  const [docs, cotizaciones, congruencia] = await Promise.all([
    documentosDeFinanzas(supabase, pedidos.map((p) => p.id)),
    cotizacionesDeCierres(supabase, pedidos.map((p) => p.informeId ?? "")),
    congruenciaDeCierres(supabase, pedidos.map((p) => p.informeId ?? "")),
  ]);
  const sinFactura = pedidos.filter((p) => (docs.get(p.id)?.facturas.length ?? 0) === 0);
  const observados = sinFactura.filter((p) => p.facturacionObservadaAt);
  // Lo más viejo primero: es lo que lleva más tiempo esperando la factura.
  const porFacturar = sinFactura.filter((p) => !p.facturacionObservadaAt).reverse();

  const fila = (p: PedidoFinanzas) => (
    <FilaPorFacturar
      key={p.id}
      p={p}
      docs={docs.get(p.id)}
      cotizacion={p.informeId ? (cotizaciones.get(p.informeId) ?? null) : null}
      congruencia={p.informeId ? congruencia.get(p.informeId) : undefined}
    />
  );

  return (
    <div className="space-y-4">
      {observados.length > 0 && (
        <SeccionPanel titulo={`Observados · ${observados.length}`}>
          <p className="mb-2 text-xs text-muted-foreground">
            Los paró usted porque el expediente no estaba alineado. Central recibió el motivo; cuando corrija, el pedido vuelve a «Por facturar».
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border">{observados.map(fila)}</ul>
        </SeccionPanel>
      )}
      <SeccionPanel titulo={`Por facturar · ${porFacturar.length}`}>
        <p className="mb-2 text-xs text-muted-foreground">
          Finanzas ya subió la liquidación. Abra el expediente —cotización, orden de compra, cierre y pedido—, revise que estén alineados y registre la
          factura. Si algo no cuadra, obsérvelo: le llega a Central con el motivo.
        </p>
        {porFacturar.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No hay pedidos esperando factura.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">{porFacturar.map(fila)}</ul>
        )}
      </SeccionPanel>
    </div>
  );
}

function FilaPorFacturar({
  p,
  docs,
  cotizacion,
  congruencia,
}: {
  p: PedidoFinanzas;
  docs: DocumentosDeFinanzas | undefined;
  cotizacion: { id: string; codigo: string } | null;
  congruencia: Congruencia | undefined;
}) {
  const vigente = docs?.liquidaciones[0];
  const empresa = p.serie === "OPEN" ? "Open" : "Efameinsa";
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{p.cliente}</p>
          <p className="text-xs text-muted-foreground">
            {p.clienteDoc ? `${p.clienteDoc} · ` : ""}
            {p.codigoCierre ? `Cierre ${empresa} ${p.codigoCierre}` : ""}
            {p.numeroErp ? ` · Pedido ${p.numeroErp}` : ""}
            {p.comercialNombre ? ` · ${p.comercialNombre}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-foreground">
            Total {p.total != null ? formatoMonto(p.moneda, p.total) : "—"} · confirmado {formatoMonto(p.moneda, p.pagado)}
            {vigente && (
              <>
                {" · "}
                <b>Liquidación: {etiquetaEstadoPago(vigente.estadoPago)}</b>
                {vigente.facturaNumero ? ` (factura ${vigente.facturaNumero})` : " (factura pendiente)"}
              </>
            )}
          </p>
          {p.facturacionObservadaAt && (
            <p className="mt-1 flex items-start gap-1 text-[11px] font-medium text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 flex-none" />
              Observado el {fechaHoraLima(p.facturacionObservadaAt)}: {p.facturacionObservadaMotivo}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.informeId && p.codigoCierre && (
            <ExpedienteCierre
              informeId={p.informeId}
              codigo={p.codigoCierre}
              cliente={p.cliente}
              clienteDoc={p.clienteDoc}
              serie={p.serie ?? "EFAMEINSA"}
              monto={p.total ?? 0}
              moneda={p.moneda}
              modalidadPago={p.modalidadPago}
              entregaLugar={p.entregaLugar}
              entregaFecha={p.entregaFecha}
              adjuntos={p.adjuntos}
              compendio={null}
              cotizacion={cotizacion}
              pedidoId={p.id}
              soloLectura
            >
              <div className="rounded-md border border-border p-3">
                <DocumentosFinanzasLista docs={docs} />
              </div>
            </ExpedienteCierre>
          )}
          <RegistrarFactura servicioId={p.id} cliente={p.cliente} />
          {!p.facturacionObservadaAt && <ObservarExpediente servicioId={p.id} cliente={p.cliente} />}
        </div>
      </div>
      {congruencia && (congruencia.alertas.length > 0 || congruencia.bien.length > 0) && (
        <ul className="flex flex-wrap gap-1.5 text-[11px]">
          {congruencia.alertas.map((a) => (
            <li key={a} className="inline-flex items-start gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-amber-900">
              <AlertTriangle className="mt-px size-3 flex-none" /> {a}
            </li>
          ))}
          {congruencia.bien.map((b) => (
            <li key={b} className={cn("inline-flex items-center gap-1 rounded-md bg-[#1E7F4F]/10 px-2 py-0.5 text-[#1E7F4F]")}>
              <CheckCircle2 className="size-3 flex-none" /> {b}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
