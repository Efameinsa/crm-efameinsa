import Link from "next/link";
import { AlertTriangle, CalendarClock, MessageSquareText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Kpi } from "@/components/crm/kpi";
import { ExpedienteCierre } from "@/components/crm/expediente-cierre";
import { AccionesFinanzas } from "@/components/crm/acciones-finanzas";
import { avisosDeCentral, cuentasPorCobrar, diasEntre, formatoMonto, pedidosPorConfirmar, type PedidoFinanzas } from "@/lib/pagos-finanzas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * POR CONFIRMAR — el día de Finanzas (0279).
 *
 * Gerencia, 23-09: John confirma él mismo los pagos. La pantalla responde en
 * este orden lo que él se pregunta al llegar: ¿qué tengo que confirmar?, ¿qué
 * sale primero?, ¿en qué cuenta lo busco?, ¿cuánto tiene que haber entrado?
 * Por eso cada fila trae la serie (Open o Efameinsa = qué estado de cuenta
 * abrir), lo que exige la condición de pago y lo que falta, y el voucher y la
 * OC a un clic, sin salir de la lista. Primero lo que se despacha antes.
 */
export default async function FinanzasPage() {
  await requerirPerfil();
  const supabase = await createClient();
  const hoy = hoyLima();
  const [pedidos, cobrar, avisos] = await Promise.all([pedidosPorConfirmar(supabase), cuentasPorCobrar(supabase), avisosDeCentral(supabase)]);

  const urgentes = pedidos.filter((p) => p.fechaDespacho && diasEntre(hoy, p.fechaDespacho) <= 3);
  const observados = pedidos.filter((p) => p.observadoAt);
  const vencidos = cobrar.filter((p) => (p.diasParaVencer ?? 0) < 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Por confirmar" valor={pedidos.length} sub="Pedidos liberados que esperan su abono" alerta={pedidos.length > 0} />
        <Kpi etiqueta="Salen en 3 días o menos" valor={urgentes.length} sub="Confírmelos primero" alerta={urgentes.length > 0} />
        <Kpi etiqueta="Observados" valor={observados.length} sub="Esperan respuesta del comercial" />
        <Kpi etiqueta="Cobros vencidos" valor={vencidos.length} sub="Ya pasó el plazo de crédito" alerta={vencidos.length > 0} href="/finanzas/cobrar" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <SeccionPanel titulo={`Pagos por confirmar · ${pedidos.length}`}>
          {pedidos.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm font-medium text-foreground">No hay pagos por confirmar.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Cuando Central libere un pedido aparece aquí, y le suena la campana.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {pedidos.map((p) => (
                <FilaPedido key={p.id} p={p} hoy={hoy} />
              ))}
            </ul>
          )}
        </SeccionPanel>

        <SeccionPanel titulo="Avisos de Central">
          {avisos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nada en los últimos 14 días. Lo que Central le derive a Finanzas aparece aquí.</p>
          ) : (
            <ul className="space-y-3">
              {avisos.map((a) => (
                <li key={a.id} className="rounded-lg border border-border p-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <MessageSquareText className="size-3.5 text-muted-foreground" />
                    {a.cliente ?? "Cliente"}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-foreground">{a.detalle}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}
                    {a.servicioId && (
                      <>
                        {" · "}
                        <Link href={`/finanzas/pedidos/${a.servicioId}`} className="text-primary hover:underline">
                          Ver el pedido
                        </Link>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SeccionPanel>
      </div>
    </div>
  );
}

function FilaPedido({ p, hoy }: { p: PedidoFinanzas; hoy: string }) {
  const dias = p.fechaDespacho ? diasEntre(hoy, p.fechaDespacho) : null;
  const cuenta = p.serie === "OPEN" ? "Open Investments" : p.serie === "EFAMEINSA" ? "Efameinsa" : null;
  const esperando = p.liberadoAt ? diasEntre(new Date(p.liberadoAt).toLocaleDateString("en-CA", { timeZone: "America/Lima" }), hoy) : null;

  return (
    <li className={cn("rounded-lg border p-3", p.observadoAt ? "border-amber-300 bg-amber-50/60" : "border-border")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/finanzas/pedidos/${p.id}`} className="text-sm font-semibold text-foreground hover:underline">
              {p.cliente}
            </Link>
            {cuenta && (
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", p.serie === "OPEN" ? "bg-secondary text-foreground" : "bg-primary/10 text-primary")}>
                Cuenta {cuenta}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {p.clienteDoc ? `${p.clienteDoc} · ` : ""}
            {p.codigoCierre ? `Cierre ${p.codigoCierre}` : "Sin cierre"}
            {p.numeroErp ? ` · Pedido ${p.numeroErp}` : ""}
            {p.comercialNombre ? ` · ${p.comercialNombre}` : ""}
          </p>
          {p.equipo && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.equipo.replace(/\s+/g, " ")}</p>}
          {p.solicitadoAt && (
            <p className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              Postventa pidió confirmar el abono ·{" "}
              {new Date(p.solicitadoAt).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}
            </p>
          )}
        </div>
        <div className="text-right">
          {dias != null ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                dias <= 1 ? "bg-destructive/10 text-destructive" : dias <= 3 ? "bg-amber-100 text-amber-800" : "bg-secondary text-muted-foreground",
              )}
            >
              <CalendarClock className="size-3" />
              {dias < 0 ? `Despacho atrasado ${-dias} d` : dias === 0 ? "Sale hoy" : dias === 1 ? "Sale mañana" : `Sale en ${dias} días`}
            </span>
          ) : (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">Sin fecha de despacho</span>
          )}
          {esperando != null && <p className="mt-1 text-[11px] text-muted-foreground">Liberado hace {esperando} d</p>}
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-md bg-secondary/50 p-2 text-xs">
        <div>
          <p className="text-muted-foreground">Debe estar acreditado</p>
          <p className="font-semibold tabular-nums text-foreground">{formatoMonto(p.moneda, p.requerido)}</p>
          <p className="text-[11px] text-muted-foreground">{p.condicion ?? "Sin condición: se exige el total"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Ya confirmado</p>
          <p className="font-semibold tabular-nums text-foreground">{formatoMonto(p.moneda, p.pagado)}</p>
          {p.total != null && <p className="text-[11px] text-muted-foreground">de {formatoMonto(p.moneda, p.total)} en total</p>}
        </div>
        <div>
          <p className="text-muted-foreground">Falta</p>
          <p className={cn("text-base font-bold tabular-nums", p.falta > 0 ? "text-destructive" : "text-[#1E7F4F]")}>{formatoMonto(p.moneda, p.falta)}</p>
        </div>
      </div>

      {p.observadoAt && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 flex-none" />
          <span>
            <b>Observado</b> el {new Date(p.observadoAt).toLocaleDateString("es-PE", { timeZone: "America/Lima" })}: {p.observadoMotivo}
          </span>
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <AccionesFinanzas servicioId={p.id} cliente={p.cliente} moneda={p.moneda} sugerido={p.falta} cuenta={cuenta} compacto />
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
          />
        )}
      </div>
    </li>
  );
}
