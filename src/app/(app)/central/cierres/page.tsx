import Link from "next/link";
import { FileText, Truck } from "lucide-react";
import { requerirRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fechaCalendario } from "@/lib/fechas";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChecksPedidoCentral } from "@/components/crm/checks-pedido-central";

export const dynamic = "force-dynamic";

// Cierres de venta que llegan a Central.
//
// POR QUÉ EXISTE ESTA PANTALLA: el informe de cierre se le manda a Central
// para que facture, cobre y despache — y hasta ahora era la única que no tenía
// cómo encontrarlo. Su menú tenía "Bandeja" y "Registrar contacto"; para ver
// un informe había que entrar al cliente exacto sabiendo cuál era. La
// destinataria del documento no puede depender de que alguien le avise por
// WhatsApp cuál abrir.
//
// Es una COLA DE TRABAJO, no un reporte: lo más nuevo arriba, lo urgente
// marcado, y el PDF a un clic. Los borradores del comercial no aparecen: hasta
// que no se emiten, no son de Central.

interface FilaInforme {
  id: string;
  codigo: string;
  serie: string;
  fecha: string;
  emitido_at: string;
  asunto: string;
  cliente_nombre: string;
  cliente_doc: string | null;
  monto_total: number;
  moneda: string;
  urgente: boolean;
  entrega_lugar: string | null;
  entrega_fecha: string | null;
  modalidad_pago: string[];
  cuenta_id: string;
  perfiles: { nombre: string; codigo_comercial: string | null } | null;
}

export default async function CierresCentralPage() {
  await requerirRol(["central", "gerencia", "admin"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("informes_cierre")
    .select(
      "id, codigo, serie, fecha, emitido_at, asunto, cliente_nombre, cliente_doc, monto_total, moneda, urgente, entrega_lugar, entrega_fecha, modalidad_pago, cuenta_id, perfiles!informes_cierre_creado_por_fkey(nombre, codigo_comercial)",
    )
    .not("emitido_at", "is", null)
    .order("emitido_at", { ascending: false })
    .limit(200);

  const filas = (data ?? []) as unknown as FilaInforme[];
  const urgentes = filas.filter((f) => f.urgente).length;

  // El estado del pedido de cada cierre: si Central ya lo ejecutó en el ERP, si
  // está liquidado y si postventa acusó recibo. Va en una sola consulta por la
  // lista entera y no una por fila (migración 0087).
  const { data: pedidos } = await supabase
    .from("servicios_postventa")
    .select("informe_cierre_id, numero_pedido_erp, pedido_ejecutado_at, liquidacion_at, aprobado_at")
    .in("informe_cierre_id", filas.map((f) => f.id));
  const pedidoPorInforme = new Map(
    (pedidos ?? []).map((p) => [p.informe_cierre_id as string, p]),
  );

  return (
    <SeccionPanel
      titulo="Cierres de venta"
      accion={
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
          {filas.length} informe{filas.length === 1 ? "" : "s"}
          {urgentes > 0 && <span className="ml-1 text-destructive">· {urgentes} urgente{urgentes === 1 ? "" : "s"}</span>}
        </span>
      }
    >
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no llegó ningún informe de cierre. Aparecen acá en cuanto el comercial lo emite, con todo lo que hace
          falta para facturar y despachar.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Informe</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Comercial</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead>Despacho</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.id} className={f.urgente ? "bg-destructive/5" : undefined}>
                  <TableCell className="whitespace-nowrap align-top">
                    <span className="font-mono text-xs font-semibold text-foreground">Nº {f.codigo}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {f.serie === "OPEN" ? "Open Investments" : "Efameinsa"} · {fechaCalendario(f.fecha)}
                    </span>
                    {f.urgente && (
                      <span className="mt-1 inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                        URGENTE
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[260px] align-top">
                    <Link
                      href={`/gerencia/clientes/${f.cuenta_id}`}
                      className="line-clamp-2 text-sm font-medium text-primary hover:underline"
                    >
                      {f.cliente_nombre}
                    </Link>
                    {f.cliente_doc && (
                      <span className="block font-mono text-[11px] text-muted-foreground">{f.cliente_doc}</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top text-xs text-muted-foreground">
                    {f.perfiles?.codigo_comercial ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right align-top font-semibold tabular-nums text-foreground">
                    {f.moneda} {Number(f.monto_total).toLocaleString("es-PE")}
                  </TableCell>
                  <TableCell className="align-top text-xs text-muted-foreground">
                    {(f.modalidad_pago ?? []).length > 0 ? f.modalidad_pago.join(" + ") : "—"}
                  </TableCell>
                  {/* Lo que Central mira para mover el despacho: adónde va y
                      cuándo. El detalle completo está en el PDF. */}
                  <TableCell className="max-w-[280px] align-top text-xs text-muted-foreground">
                    {f.entrega_lugar ? (
                      <>
                        <span className="line-clamp-2 flex items-start gap-1">
                          <Truck className="mt-0.5 size-3 flex-none" />
                          {f.entrega_lugar}
                        </span>
                        {f.entrega_fecha && <span className="block">Entrega: {f.entrega_fecha}</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  {/* Los dos checks que liberan el pedido a postventa. */}
                  <TableCell className="align-top">
                    <ChecksPedidoCentral
                      informeId={f.id}
                      cliente={f.cliente_nombre}
                      numeroPedido={(pedidoPorInforme.get(f.id)?.numero_pedido_erp as string | null) ?? null}
                      pedidoEjecutado={pedidoPorInforme.get(f.id)?.pedido_ejecutado_at != null}
                      liquidacion={pedidoPorInforme.get(f.id)?.liquidacion_at != null}
                      aprobadoPostventa={pedidoPorInforme.get(f.id)?.aprobado_at != null}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <a
                      href={`/api/informes/${f.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir el informe"
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-foreground hover:bg-accent"
                    >
                      <FileText className="size-3" /> PDF
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </SeccionPanel>
  );
}
