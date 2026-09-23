import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, BadgeCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ExpedienteCierre } from "@/components/crm/expediente-cierre";
import { AccionesFinanzas } from "@/components/crm/acciones-finanzas";
import { EstadoDelPedido } from "@/components/crm/estado-del-pedido";
import { abonos, formatoMonto, unPedido } from "@/lib/pagos-finanzas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Un pedido visto por Finanzas (0279): las cifras arriba, lo que ya se
 * confirmó con su operación y banco, el expediente (voucher, OC) y, para
 * contexto, en qué paso del circuito va — solo lectura.
 */
export default async function FinanzasPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  await requerirPerfil();
  const { id } = await params;
  const supabase = await createClient();
  const p = await unPedido(supabase, id);
  if (!p) notFound();
  const lista = await abonos(supabase, { servicioId: id, limite: 50 });
  const cuenta = p.serie === "OPEN" ? "Open Investments" : p.serie === "EFAMEINSA" ? "Efameinsa" : null;
  const sugerido = p.despachadoAt ? p.saldo : p.falta > 0 ? p.falta : p.saldo;

  return (
    <div className="space-y-4">
      <Link href="/finanzas" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Volver a Por confirmar
      </Link>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">{p.cliente}</h1>
            <p className="text-xs text-muted-foreground">
              {p.clienteDoc ? `${p.clienteDoc} · ` : ""}
              {p.codigoCierre ? `Cierre ${p.codigoCierre}` : ""}
              {cuenta ? ` · Cuenta ${cuenta}` : ""}
              {p.numeroErp ? ` · Pedido ERP ${p.numeroErp}` : ""}
              {p.comercialNombre ? ` · ${p.comercialNombre}` : ""}
            </p>
            {p.equipo && <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{p.equipo.replace(/\s+/g, " ")}</p>}
          </div>
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

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Cifra etiqueta="Total del cierre" valor={p.total != null ? formatoMonto(p.moneda, p.total) : "—"} />
          <Cifra etiqueta="Antes del despacho" valor={formatoMonto(p.moneda, p.requerido)} ayuda={p.condicion ?? "Sin condición: se exige el total"} />
          <Cifra etiqueta="Confirmado" valor={formatoMonto(p.moneda, p.pagado)} />
          <Cifra
            etiqueta={p.despachadoAt ? "Saldo por cobrar" : "Falta antes del despacho"}
            valor={formatoMonto(p.moneda, p.despachadoAt ? p.saldo : p.falta)}
            fuerte={(p.despachadoAt ? p.saldo : p.falta) > 0}
          />
        </div>

        {p.observadoAt && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 size-3.5 flex-none" />
            <span>
              <b>Pago observado</b> el {new Date(p.observadoAt).toLocaleDateString("es-PE", { timeZone: "America/Lima" })}: {p.observadoMotivo}
            </span>
          </p>
        )}

        <div className="mt-4">
          <AccionesFinanzas servicioId={p.id} cliente={p.cliente} moneda={p.moneda} sugerido={sugerido} cuenta={cuenta} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SeccionPanel titulo={`Abonos confirmados · ${lista.length}`}>
          {lista.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {p.pagoConfirmadoDetalle
                ? `Antes de la cuenta de Finanzas se registró: ${p.pagoConfirmadoDetalle}.`
                : "Todavía no hay abonos confirmados en este pedido."}
            </p>
          ) : (
            <ul className="space-y-2">
              {lista.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-2.5 text-xs">
                  <div>
                    <p className="flex items-center gap-1 font-semibold text-foreground">
                      <BadgeCheck className="size-3.5 text-[#1E7F4F]" />
                      {formatoMonto(a.moneda, a.monto)}
                    </p>
                    <p className="text-muted-foreground">
                      {new Date(`${a.fechaAbono}T12:00:00-05:00`).toLocaleDateString("es-PE", { timeZone: "America/Lima" })} · {a.medio} · op. {a.operacion}
                    </p>
                    {a.nota && <p className="text-muted-foreground">{a.nota}</p>}
                  </div>
                  <div className="text-right text-muted-foreground">
                    <p>{a.registradoPor ?? ""}</p>
                    {a.capturaUrl && (
                      <a href={a.capturaUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        Ver captura
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SeccionPanel>

        {p.cuentaId && (
          <SeccionPanel titulo="En qué va el pedido">
            <EstadoDelPedido cuentaId={p.cuentaId} />
          </SeccionPanel>
        )}
      </div>
    </div>
  );
}

function Cifra({ etiqueta, valor, ayuda, fuerte }: { etiqueta: string; valor: string; ayuda?: string; fuerte?: boolean }) {
  return (
    <div className="rounded-lg bg-secondary/50 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className={cn("mt-0.5 text-lg font-bold tabular-nums", fuerte ? "text-destructive" : "text-foreground")}>{valor}</p>
      {ayuda && <p className="text-[11px] text-muted-foreground">{ayuda}</p>}
    </div>
  );
}
