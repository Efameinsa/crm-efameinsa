import Link from "@/components/enlace";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { abonos, formatoMonto } from "@/lib/pagos-finanzas";

export const dynamic = "force-dynamic";

const esFecha = (s: string | undefined) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

/**
 * CONFIRMADOS (0279): todo abono que Finanzas dio por acreditado, con su N.º
 * de operación y banco. Es el respaldo cuando alguien pregunta «¿ese pago
 * entró?»: se busca por cliente, operación o banco, y se filtra por fecha.
 */
export default async function ConfirmadosPage({ searchParams }: { searchParams: Promise<{ q?: string; desde?: string; hasta?: string }> }) {
  await requerirPerfil();
  const sp = await searchParams;
  const desde = esFecha(sp.desde) ? sp.desde! : "";
  const hasta = esFecha(sp.hasta) ? sp.hasta! : "";
  const q = (sp.q ?? "").trim();
  const supabase = await createClient();
  const lista = await abonos(supabase, { q, desde: desde || undefined, hasta: hasta || undefined });

  const totales = new Map<string, number>();
  for (const a of lista) totales.set(a.moneda, (totales.get(a.moneda) ?? 0) + a.monto);

  return (
    <SeccionPanel
      titulo={`Abonos confirmados · ${lista.length}`}
      accion={<span className="text-xs text-muted-foreground">{[...totales].map(([m, n]) => formatoMonto(m, n)).join(" + ") || ""}</span>}
    >
      <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Cliente, N.º de operación o banco"
          className="h-8 min-w-56 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        />
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Desde
          <input type="date" name="desde" defaultValue={desde} className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground" />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          hasta
          <input type="date" name="hasta" defaultValue={hasta} className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground" />
        </label>
        <button type="submit" className="h-8 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-secondary">
          Filtrar
        </button>
        {(q || desde || hasta) && (
          <Link href="/finanzas/confirmados" className="text-xs text-muted-foreground hover:underline">
            Quitar filtros
          </Link>
        )}
      </form>
      {lista.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {q || desde || hasta ? "Nada con esos filtros." : "Todavía no hay abonos confirmados desde el CRM."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Fecha del abono</th>
                <th className="py-2 pr-3 font-medium">Cliente</th>
                <th className="py-2 pr-3 font-medium">Operación</th>
                <th className="py-2 pr-3 font-medium">Banco</th>
                <th className="py-2 pr-3 text-right font-medium">Monto</th>
                <th className="py-2 font-medium">Respaldo</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.id} className="border-b border-border align-top">
                  <td className="py-2 pr-3 text-xs tabular-nums">
                    {new Date(`${a.fechaAbono}T12:00:00-05:00`).toLocaleDateString("es-PE", { timeZone: "America/Lima" })}
                    <p className="text-[11px] text-muted-foreground">por {a.registradoPor ?? "—"}</p>
                  </td>
                  <td className="py-2 pr-3">
                    <Link href={`/finanzas/pedidos/${a.servicioId}`} className="font-medium text-foreground hover:underline">
                      {a.cliente}
                    </Link>
                    {a.nota && <p className="text-[11px] text-muted-foreground">{a.nota}</p>}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{a.operacion}</td>
                  <td className="py-2 pr-3 text-xs">{a.medio}</td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums">{formatoMonto(a.moneda, a.monto)}</td>
                  <td className="py-2 text-xs">
                    {a.capturaUrl ? (
                      <a href={a.capturaUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        Ver captura
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SeccionPanel>
  );
}
