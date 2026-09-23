import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { AccionesFinanzas } from "@/components/crm/acciones-finanzas";
import { cuentasPorCobrar, formatoMonto, type PedidoFinanzas } from "@/lib/pagos-finanzas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * CUENTAS POR COBRAR (0279): lo que ya salió y todavía se debe. El
 * vencimiento es la fecha de salida más los días de crédito del cierre
 * (0232); sin crédito acordado, el saldo vence el mismo día que salió. Lo
 * vencido va arriba y en rojo: es lo que se llama primero.
 */
export default async function CobrarPage() {
  await requerirPerfil();
  const supabase = await createClient();
  const pedidos = await cuentasPorCobrar(supabase);

  const totales = new Map<string, number>();
  for (const p of pedidos) totales.set(p.moneda, (totales.get(p.moneda) ?? 0) + p.saldo);
  const vencidos = pedidos.filter((p) => (p.diasParaVencer ?? 0) < 0);

  return (
    <SeccionPanel
      titulo={`Cuentas por cobrar · ${pedidos.length}`}
      accion={
        <span className="text-xs text-muted-foreground">
          Total por cobrar: {[...totales].map(([m, n]) => formatoMonto(m, n)).join(" + ") || "—"}
          {vencidos.length > 0 && <span className="ml-2 font-semibold text-destructive">{vencidos.length} vencidos</span>}
        </span>
      }
    >
      {pedidos.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nadie debe nada de lo que ya salió.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Cliente</th>
                <th className="py-2 pr-3 font-medium">Salió</th>
                <th className="py-2 pr-3 font-medium">Vence</th>
                <th className="py-2 pr-3 text-right font-medium">Total</th>
                <th className="py-2 pr-3 text-right font-medium">Pagado</th>
                <th className="py-2 pr-3 text-right font-medium">Saldo</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <Fila key={p.id} p={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SeccionPanel>
  );
}

function Fila({ p }: { p: PedidoFinanzas }) {
  const d = p.diasParaVencer ?? 0;
  const estado = d < 0 ? { t: `Vencido hace ${-d} d`, c: "text-destructive font-semibold" } : d === 0 ? { t: "Vence hoy", c: "text-amber-700 font-semibold" } : d <= 7 ? { t: `Vence en ${d} d`, c: "text-amber-700" } : { t: `En ${d} d`, c: "text-muted-foreground" };
  const cuenta = p.serie === "OPEN" ? "Open Investments" : p.serie === "EFAMEINSA" ? "Efameinsa" : null;
  const fecha = (iso: string | null) => (iso ? new Date(iso.length > 10 ? iso : `${iso}T12:00:00-05:00`).toLocaleDateString("es-PE", { timeZone: "America/Lima" }) : "—");
  return (
    <tr className={cn("border-b border-border align-top", d < 0 && "bg-destructive/5")}>
      <td className="py-2.5 pr-3">
        <Link href={`/finanzas/pedidos/${p.id}`} className="font-medium text-foreground hover:underline">
          {p.cliente}
        </Link>
        <p className="text-[11px] text-muted-foreground">
          {p.codigoCierre ? `Cierre ${p.codigoCierre}` : ""}
          {cuenta ? ` · ${cuenta}` : ""}
          {p.condicion ? ` · ${p.condicion}` : ""}
        </p>
      </td>
      <td className="py-2.5 pr-3 text-xs tabular-nums">{fecha(p.despachadoAt)}</td>
      <td className="py-2.5 pr-3 text-xs">
        <span className="tabular-nums">{fecha(p.venceEl)}</span>
        <p className={cn("text-[11px]", estado.c)}>{estado.t}</p>
        {p.creditoDias == null && <p className="text-[11px] text-muted-foreground">Sin crédito acordado</p>}
      </td>
      <td className="py-2.5 pr-3 text-right text-xs tabular-nums">{p.total != null ? formatoMonto(p.moneda, p.total) : "—"}</td>
      <td className="py-2.5 pr-3 text-right text-xs tabular-nums">{formatoMonto(p.moneda, p.pagado)}</td>
      <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{formatoMonto(p.moneda, p.saldo)}</td>
      <td className="py-2.5">
        <AccionesFinanzas servicioId={p.id} cliente={p.cliente} moneda={p.moneda} sugerido={p.saldo} cuenta={cuenta} compacto />
      </td>
    </tr>
  );
}
