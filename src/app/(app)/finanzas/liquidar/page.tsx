import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { SubirLiquidacion } from "@/components/crm/subir-liquidacion";
import { fechaHoraLima } from "@/lib/fechas";

export const dynamic = "force-dynamic";

const sinRuc = (s: string | null) => (s ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");

/**
 * PEDIDOS POR LIQUIDAR (0290; Carlos, 23-09 14:58: «y acá faltarían más bien
 * los pedidos»). Los pedidos que Central ya generó —con su número y sus
 * series— y que esperan la liquidación de Finanzas. Finanzas abre el pedido,
 * sube el PDF de la liquidación, y Central la acepta o se la devuelve con el
 * motivo (0295). Finanzas mira el cierre junto al pedido, porque el pedido es
 * su anexo (Carlos, 23-09 17:24: «tengo que ver el cierre… cierre y el pedido»).
 */
export default async function PedidosPorLiquidarPage() {
  await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase
    .from("servicios_postventa")
    .select("id, cliente_texto, numero_pedido_erp, monto, moneda, informe_cierre_id, liquidacion_at, liquidacion_adjunto, liquidacion_subida_at, liquidacion_rechazada_at, liquidacion_rechazada_motivo, created_at")
    .not("numero_pedido_erp", "is", null)
    .not("informe_cierre_id", "is", null)
    .is("liquidacion_at", null)
    .is("cerrado_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  const filas = (data ?? []) as {
    id: string; cliente_texto: string | null; numero_pedido_erp: string; monto: number | null; moneda: string | null; informe_cierre_id: string;
    liquidacion_adjunto: { path: string; nombre: string } | null; liquidacion_subida_at: string | null;
    liquidacion_rechazada_at: string | null; liquidacion_rechazada_motivo: string | null;
  }[];
  const ids = [...new Set(filas.map((f) => f.informe_cierre_id))];
  const { data: informes } = ids.length ? await supabase.from("informes_cierre").select("id, codigo, serie, anulado_at").in("id", ids) : { data: [] };
  const inf = new Map(((informes ?? []) as { id: string; codigo: string; serie: string; anulado_at: string | null }[]).map((i) => [i.id, i]));
  const vivas = filas.filter((f) => !inf.get(f.informe_cierre_id)?.anulado_at);
  const porSubir = vivas.filter((f) => !f.liquidacion_adjunto);
  const subidas = vivas.filter((f) => f.liquidacion_adjunto);
  const { data: firmadas } = subidas.length
    ? await supabase.storage.from("adjuntos").createSignedUrls(subidas.map((f) => f.liquidacion_adjunto!.path), 3600)
    : { data: [] };

  const Fila = ({ f, url }: { f: (typeof vivas)[number]; url?: string | null }) => {
    const i = inf.get(f.informe_cierre_id);
    return (
      <li className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{sinRuc(f.cliente_texto)}</p>
          <p className="text-xs text-muted-foreground">
            Pedido <b className="font-mono text-foreground">{f.numero_pedido_erp}</b>
            {i ? ` · cierre ${i.serie === "OPEN" ? "Open" : "Efameinsa"} ${i.codigo}` : ""}
            {f.monto != null ? ` · ${f.moneda ?? ""} ${Number(f.monto).toLocaleString("es-PE", { minimumFractionDigits: 2 })}` : ""}
          </p>
          {f.liquidacion_rechazada_at && !f.liquidacion_adjunto && (
            <p className="text-[11px] font-medium text-destructive">
              Central la rechazó el {fechaHoraLima(f.liquidacion_rechazada_at)}: {f.liquidacion_rechazada_motivo}. Suba la corregida.
            </p>
          )}
          {f.liquidacion_subida_at && (
            <p className="text-[11px] text-[#1E7F4F]">
              Liquidación subida el {fechaHoraLima(f.liquidacion_subida_at)} · esperando que Central la marque
              {url && (
                <>
                  {" · "}
                  <a href={url} target="_blank" rel="noreferrer" className="font-semibold underline">
                    ver
                  </a>
                </>
              )}
            </p>
          )}
        </div>
        <a href={`/api/informes/${f.informe_cierre_id}/pdf`} target="_blank" rel="noreferrer" className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
          Ver el cierre
        </a>
        <a href={`/pedidos/${f.id}/imprimir`} target="_blank" rel="noreferrer" className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
          Ver el pedido
        </a>
        <SubirLiquidacion servicioId={f.id} yaSubida={Boolean(f.liquidacion_adjunto)} />
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <SeccionPanel titulo={`Pedidos por liquidar · ${porSubir.length}`}>
        <p className="mb-2 text-xs text-muted-foreground">
          Central ya generó el pedido con sus series. Mire el cierre y el pedido (su anexo), suba el PDF de la liquidación y Central la acepta o
          se la devuelve con el motivo: ya no hace falta pasar el papel.
        </p>
        {porSubir.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No hay pedidos esperando liquidación.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {porSubir.map((f) => (
              <Fila key={f.id} f={f} />
            ))}
          </ul>
        )}
      </SeccionPanel>
      {subidas.length > 0 && (
        <SeccionPanel titulo={`Subidas, esperando a Central · ${subidas.length}`}>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {subidas.map((f, k) => (
              <Fila key={f.id} f={f} url={firmadas?.[k]?.signedUrl ?? null} />
            ))}
          </ul>
        </SeccionPanel>
      )}
    </div>
  );
}
