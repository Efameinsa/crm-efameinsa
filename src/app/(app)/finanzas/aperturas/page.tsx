import Link from "next/link";
import { CheckCircle2, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ConfirmarGuiaBoton } from "@/components/crm/confirmar-guia-boton";
import {
  formatoMonto,
  pedidosPorId,
  type PedidoFinanzas,
} from "@/lib/pagos-finanzas";
import { fechaHoraLima } from "@/lib/fechas";

export const dynamic = "force-dynamic";

type FilaAp = {
  id: string;
  apertura_despacho_at: string;
  apertura_enviada_almacen_at: string | null;
  fecha_despacho: string | null;
  guia_confirmada_at: string | null;
  guia_confirmada_nota: string | null;
  despachado_at: string | null;
};

/**
 * APERTURAS POR CONFIRMAR (0308, audio de gerencia 25-09 14:20).
 *
 * Postventa emite la apertura de despacho y la envía: al almacén para que
 * prepare, a Finanzas para que verifique y confirme que el almacén puede
 * emitir la guía de salida. Antes eso viajaba por correo; ahora llega el
 * aviso y se confirma acá, con la hoja y el estado del pago a la vista.
 */
export default async function AperturasPorConfirmarPage() {
  await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase
    .from("servicios_postventa")
    .select(
      "id, apertura_despacho_at, apertura_enviada_almacen_at, fecha_despacho, guia_confirmada_at, guia_confirmada_nota, despachado_at",
    )
    .not("apertura_despacho_at", "is", null)
    .is("cerrado_at", null)
    .order("apertura_despacho_at", { ascending: false })
    .limit(150);
  const filas = (data ?? []) as FilaAp[];
  const porConfirmar = filas.filter(
    (f) => !f.guia_confirmada_at && !f.despachado_at,
  );
  const confirmadas = filas.filter((f) => f.guia_confirmada_at).slice(0, 30);
  const pedidos = new Map(
    (
      await pedidosPorId(
        supabase,
        [...porConfirmar, ...confirmadas].map((f) => f.id),
      )
    ).map((p) => [p.id, p]),
  );

  return (
    <div className="space-y-4">
      <SeccionPanel titulo={`Aperturas por confirmar · ${porConfirmar.length}`}>
        <p className="mb-2 text-xs text-muted-foreground">
          Postventa emitió la apertura de despacho. Revise la hoja y el pago y
          confirme: el almacén recibe el aviso y emite la guía de salida.
        </p>
        {porConfirmar.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No hay aperturas esperando su confirmación.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {porConfirmar.map((f) => (
              <FilaApertura key={f.id} f={f} p={pedidos.get(f.id)} />
            ))}
          </ul>
        )}
      </SeccionPanel>
      {confirmadas.length > 0 && (
        <SeccionPanel titulo={`Confirmadas · ${confirmadas.length}`}>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {confirmadas.map((f) => (
              <FilaApertura key={f.id} f={f} p={pedidos.get(f.id)} />
            ))}
          </ul>
        </SeccionPanel>
      )}
    </div>
  );
}

function FilaApertura({ f, p }: { f: FilaAp; p: PedidoFinanzas | undefined }) {
  const falta = p ? (p.despachadoAt ? p.saldo : p.falta) : 0;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {p?.cliente ?? "Pedido"}
        </p>
        <p className="text-xs text-muted-foreground">
          {p?.numeroErp ? `Pedido ${p.numeroErp} · ` : ""}Apertura del{" "}
          {fechaHoraLima(f.apertura_despacho_at)}
          {f.fecha_despacho ? ` · sale el ${f.fecha_despacho}` : ""}
        </p>
        {p && p.total != null && (
          <p className="mt-0.5 text-xs">
            Total {formatoMonto(p.moneda, p.total)} · confirmado{" "}
            {formatoMonto(p.moneda, p.pagado)} ·{" "}
            {falta > 0 ? (
              <b className="text-destructive">
                falta {formatoMonto(p.moneda, falta)} antes del despacho
              </b>
            ) : (
              <b className="text-[#1E7F4F]">pago cubierto</b>
            )}
          </p>
        )}
        {f.guia_confirmada_at && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-[#1E7F4F]">
            <CheckCircle2 className="size-3.5" /> Guía confirmada el{" "}
            {fechaHoraLima(f.guia_confirmada_at)}
            {f.guia_confirmada_nota ? ` · ${f.guia_confirmada_nota}` : ""}
          </p>
        )}
      </div>
      <a
        href={`/api/postventa/pedidos/${f.id}/apertura/pdf`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
      >
        <FileText className="size-3.5" /> Ver la apertura
      </a>
      <Link
        href={`/finanzas/pedidos/${f.id}`}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
      >
        El pedido
      </Link>
      {!f.guia_confirmada_at && (
        <ConfirmarGuiaBoton
          servicioId={f.id}
          cliente={p?.cliente ?? "Pedido"}
          conSaldo={falta > 0}
        />
      )}
    </li>
  );
}
