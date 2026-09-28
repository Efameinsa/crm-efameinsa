import Link from "@/components/enlace";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaCalendario } from "@/lib/fechas";
import { textoCondicionPago } from "@/lib/postventa";
import { cn } from "@/lib/utils";

/**
 * CUENTAS POR COBRAR (0232).
 *
 * Reunión 14-09: la venta a crédito es la normal de la casa («30 % al contado
 * y lo que falta a crédito, o a todo crédito»). Con la condición de pago como
 * dato, el saldo que queda después del despacho ya no es una anomalía que
 * frena la salida: es una cuenta por cobrar con fecha de vencimiento, y acá
 * es donde Finanzas y gerencia la ven.
 *
 * Dos listas: lo que YA salió con saldo (vence a los días de crédito desde el
 * despacho) y lo que todavía no sale y debe algo (para saber qué está por
 * entrar). Se muestran solo pedidos nacidos en el CRM: en las filas del Excel
 * el monto pagado nunca se cargó y el saldo sería inventado.
 */
export interface FilaPorCobrar {
  id: string;
  cliente_texto: string | null;
  numero_pedido_erp: string | null;
  monto: number | string | null;
  monto_pagado: number | string | null;
  moneda: string | null;
  pct_antes_despacho: number | null;
  credito_dias: number | null;
  despachado_at: string | null;
  fecha_despacho: string | null;
  despacho_sin_cancelar_motivo: string | null;
  cerrado_at: string | null;
}

const DIA = 24 * 60 * 60 * 1000;

function vencimiento(f: FilaPorCobrar): Date | null {
  if (!f.despachado_at || f.credito_dias == null) return null;
  return new Date(new Date(f.despachado_at).getTime() + Number(f.credito_dias) * DIA);
}

function dinero(moneda: string | null, n: number): string {
  return `${moneda ?? "USD"} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PorCobrar({ filas }: { filas: FilaPorCobrar[] }) {
  const hoy = Date.now();
  const conSaldo = filas
    .map((f) => ({ ...f, saldo: Math.max(0, Number(f.monto ?? 0) - Number(f.monto_pagado ?? 0)) }))
    .filter((f) => f.saldo > 0.5);
  const despachados = conSaldo.filter((f) => f.despachado_at != null);
  const porSalir = conSaldo.filter((f) => f.despachado_at == null);
  const totalDespachado = despachados.reduce((s, f) => s + f.saldo, 0);
  const vencidos = despachados.filter((f) => {
    const v = vencimiento(f);
    return v != null && v.getTime() < hoy;
  });

  if (conSaldo.length === 0) return null;

  return (
    <SeccionPanel titulo="Cuentas por cobrar">
      <p className="mb-3 text-xs text-muted-foreground">
        Saldos de pedidos nacidos en el CRM. El vencimiento sale de la fecha de despacho más los días de crédito
        acordados en el informe de cierre. Lo que Finanzas confirma como pagado se registra desde el pedido.
      </p>

      {despachados.length > 0 && (
        <>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-sm font-semibold text-foreground">
              Ya despachado con saldo: {dinero("US$", totalDespachado)}
            </span>
            <span className="text-xs text-muted-foreground">{despachados.length} pedidos</span>
            {vencidos.length > 0 && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                {vencidos.length} vencido{vencidos.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1 pr-3 font-semibold">Cliente</th>
                  <th className="py-1 pr-3 font-semibold">Pedido</th>
                  <th className="py-1 pr-3 font-semibold">Condición</th>
                  <th className="py-1 pr-3 text-right font-semibold">Saldo</th>
                  <th className="py-1 pr-3 font-semibold">Despachado</th>
                  <th className="py-1 font-semibold">Vence</th>
                </tr>
              </thead>
              <tbody>
                {despachados.map((f) => {
                  const v = vencimiento(f);
                  const vencido = v != null && v.getTime() < hoy;
                  const dias = v == null ? null : Math.round((v.getTime() - hoy) / DIA);
                  return (
                    <tr key={f.id} className="border-t border-border">
                      <td className="py-1.5 pr-3">
                        <Link href={`/postventa/pedidos/${f.id}`} className="font-medium hover:underline">
                          {f.cliente_texto ?? "Sin nombre"}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs text-muted-foreground">{f.numero_pedido_erp ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-xs text-muted-foreground">
                        {textoCondicionPago(f) ?? (f.despacho_sin_cancelar_motivo ? "Salió con autorización" : "Sin condición cargada")}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{dinero(f.moneda, f.saldo)}</td>
                      <td className="py-1.5 pr-3 text-xs">{fechaCalendario(f.despachado_at)}</td>
                      <td className={cn("py-1.5 text-xs", vencido ? "font-semibold text-destructive" : "")}>
                        {v == null
                          ? "sin plazo"
                          : vencido
                            ? `${fechaCalendario(v.toISOString())} · hace ${Math.abs(dias ?? 0)} días`
                            : `${fechaCalendario(v.toISOString())} · en ${dias} días`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {porSalir.length > 0 && (
        <div className={despachados.length > 0 ? "mt-4" : ""}>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-4">
            <span className="text-sm font-semibold text-foreground">
              Por salir, con saldo: {dinero("US$", porSalir.reduce((s, f) => s + f.saldo, 0))}
            </span>
            <span className="text-xs text-muted-foreground">{porSalir.length} pedidos en preparación</span>
          </div>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
            {porSalir.map((f) => (
              <li key={f.id} className="flex items-baseline justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
                <Link href={`/postventa/pedidos/${f.id}`} className="truncate font-medium hover:underline">
                  {f.cliente_texto ?? "Sin nombre"}
                  {f.numero_pedido_erp && <span className="ml-1 font-mono text-muted-foreground">{f.numero_pedido_erp}</span>}
                </Link>
                <span className="whitespace-nowrap font-mono tabular-nums">{dinero(f.moneda, f.saldo)}</span>
                <span className="whitespace-nowrap text-muted-foreground">{textoCondicionPago(f) ?? "sin condición"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SeccionPanel>
  );
}
