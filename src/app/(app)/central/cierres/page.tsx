import Link from "next/link";
import { AlertTriangle, CheckCircle2, Package, Truck } from "lucide-react";
import { requerirRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fechaCalendario } from "@/lib/fechas";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ChecksPedidoCentral } from "@/components/crm/checks-pedido-central";
import { ExpedienteCierre } from "@/components/crm/expediente-cierre";
import { firmarAdjuntosDeCierres, type AdjuntoCierre } from "@/lib/adjuntos-cierre";
import { cargarCompendio, oportunidadDelInforme, type Compendio } from "@/lib/compendio-cierre";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Los cierres de venta que llegan a Central.
 *
 * ES UNA COLA DE TRABAJO, no un reporte: lo que falta liberar arriba, lo
 * urgente marcado, y los dos checks a mano. Los borradores del comercial no
 * aparecen: hasta que no se emiten, no son de Central.
 *
 * POR QUÉ DEJÓ DE SER UNA TABLA (28-08). Tenía nueve columnas y cada fila medía
 * media pantalla: la nota de despacho de un cliente ocupa cuatro renglones, el
 * expediente son cinco documentos y el compendio de la gestión son seis hitos
 * más. Con cuatro cierres ya había que hacer scroll horizontal en una laptop;
 * con cuarenta era inmanejable. Y lo que Central hace veinte veces al día
 * —mirar de quién es, cuánto es y marcar los dos checks— quedaba enterrado
 * entre lo que se lee una vez.
 *
 * Ahora la fila muestra lo que se ESCANEA y el modal del expediente guarda lo
 * que se LEE. Y arriba están las tres pestañas que responden la pregunta con la
 * que Central abre esta pantalla: ¿qué me falta liberar?
 */

const PESTANAS = [
  { clave: "por_liberar", etiqueta: "Por liberar" },
  { clave: "liberados", etiqueta: "Liberados" },
  { clave: "todos", etiqueta: "Todos" },
] as const;

type Pestana = (typeof PESTANAS)[number]["clave"];

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
  oportunidad_id: string | null;
  venta_id: string | null;
  adjuntos: AdjuntoCierre[] | null;
  perfiles: { nombre: string; codigo_comercial: string | null } | null;
}

export default async function CierresCentralPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  await requerirRol(["central", "gerencia", "admin"]);
  const sp = await searchParams;
  const pestana: Pestana = (PESTANAS.find((p) => p.clave === sp.ver)?.clave ?? "por_liberar") as Pestana;

  const supabase = await createClient();
  const { data } = await supabase
    .from("informes_cierre")
    .select(
      "id, codigo, serie, fecha, emitido_at, asunto, cliente_nombre, cliente_doc, monto_total, moneda, urgente, entrega_lugar, entrega_fecha, modalidad_pago, cuenta_id, oportunidad_id, venta_id, adjuntos, perfiles!informes_cierre_creado_por_fkey(nombre, codigo_comercial)",
    )
    .not("emitido_at", "is", null)
    .order("emitido_at", { ascending: false })
    .limit(200);

  const todas = (data ?? []) as unknown as FilaInforme[];

  // El expediente de cada cierre: la OC que mandó el cliente, el voucher, la
  // cotización firmada. Se firma la lista entera de una vez y no un archivo por
  // llamada: son 200 filas (migración 0099).
  const adjuntosPorInforme = await firmarAdjuntosDeCierres(supabase, todas);

  // El estado del pedido de cada cierre: si Central ya lo ejecutó en el ERP, si
  // está liquidado y si postventa acusó recibo. Va en una sola consulta por la
  // lista entera y no una por fila (migración 0087).
  const { data: pedidos } = await supabase
    .from("servicios_postventa")
    .select("informe_cierre_id, numero_pedido_erp, pedido_ejecutado_at, liquidacion_at, aprobado_at")
    .in("informe_cierre_id", todas.map((f) => f.id));
  const pedidoPorInforme = new Map((pedidos ?? []).map((p) => [p.informe_cierre_id as string, p]));

  const liberado = (id: string) => {
    const p = pedidoPorInforme.get(id);
    return p?.pedido_ejecutado_at != null && p?.liquidacion_at != null;
  };
  const porLiberar = todas.filter((f) => !liberado(f.id));
  const filas = pestana === "por_liberar" ? porLiberar : pestana === "liberados" ? todas.filter((f) => liberado(f.id)) : todas;
  const urgentes = porLiberar.filter((f) => f.urgente).length;

  // EL COMPENDIO DE LA GESTIÓN, que es lo que Carlos pidió para que Central
  // pueda dejar el correo. Se arma solo para lo que está en pantalla y en
  // paralelo: en fila tardaba 5,2 s y una cola que tarda cinco segundos en
  // abrir se deja de abrir.
  const compendios = new Map<string, Compendio>(
    (
      await Promise.all(
        filas.slice(0, 20).map(async (f): Promise<[string, Compendio] | null> => {
          const compendio = await cargarCompendio(await oportunidadDelInforme(f));
          return compendio ? [f.id, compendio] : null;
        }),
      )
    ).filter((x): x is [string, Compendio] => x !== null),
  );

  return (
    <SeccionPanel
      titulo="Cierres de venta"
      accion={
        <div className="flex flex-wrap items-center gap-1.5">
          {PESTANAS.map((p) => {
            const n = p.clave === "por_liberar" ? porLiberar.length : p.clave === "todos" ? todas.length : todas.length - porLiberar.length;
            return (
              <Link
                key={p.clave}
                href={`/central/cierres?ver=${p.clave}`}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
                  pestana === p.clave
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {p.etiqueta} {n}
              </Link>
            );
          })}
        </div>
      }
    >
      {pestana === "por_liberar" && urgentes > 0 && (
        <p className="mb-3 flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs font-semibold text-destructive">
          <AlertTriangle className="size-3.5" />
          {urgentes} {urgentes === 1 ? "cierre urgente" : "cierres urgentes"} esperando.
        </p>
      )}

      {filas.length === 0 ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          {pestana === "por_liberar"
            ? "No queda ningún cierre por liberar. Cuando un comercial emita uno, aparece acá con todo lo que adjuntó."
            : "Todavía no hay cierres en esta lista."}
        </p>
      ) : (
        <div className="space-y-2">
          {filas.map((f) => {
            const pedido = pedidoPorInforme.get(f.id);
            const yaLiberado = liberado(f.id);
            const documentos = adjuntosPorInforme.get(f.id) ?? [];
            return (
              <article
                key={f.id}
                className={cn(
                  "rounded-lg border p-3",
                  f.urgente && !yaLiberado ? "border-destructive/40 bg-destructive/5" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  {/* Quién y cuánto: lo que se escanea. */}
                  <div className="min-w-[220px] flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={`/gerencia/clientes/${f.cuenta_id}`}
                        className="text-sm font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        {f.cliente_nombre}
                      </Link>
                      {f.urgente && !yaLiberado && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                          URGENTE
                        </span>
                      )}
                      {yaLiberado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 text-[10px] font-bold text-[#1E7F4F]">
                          <CheckCircle2 className="size-3" />
                          {pedido?.aprobado_at ? "EN POSTVENTA" : "LIBERADO"}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-mono font-semibold text-foreground">N.º {f.codigo}</span>
                      {" · "}
                      {f.serie === "OPEN" ? "Open Investments" : "Efameinsa"}
                      {" · "}
                      {fechaCalendario(f.fecha)}
                      {f.perfiles?.codigo_comercial && ` · ${f.perfiles.codigo_comercial}`}
                      {f.cliente_doc && ` · ${f.cliente_doc}`}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                      <span className="font-semibold tabular-nums text-foreground">
                        {f.moneda} {Number(f.monto_total).toLocaleString("es-PE")}
                      </span>
                      {(f.modalidad_pago ?? []).length > 0 && (
                        <span className="text-muted-foreground">{f.modalidad_pago.join(" + ")}</span>
                      )}
                      {f.entrega_fecha && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Truck className="size-3" /> entrega {fechaCalendario(f.entrega_fecha)}
                        </span>
                      )}
                      {documentos.length === 0 && (
                        <span className="flex items-center gap-1 font-medium text-amber-700">
                          <Package className="size-3" /> sin documentos adjuntos
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Lo accionable, a la derecha y siempre en el mismo lugar. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <ExpedienteCierre
                      informeId={f.id}
                      codigo={f.codigo}
                      cliente={f.cliente_nombre}
                      clienteDoc={f.cliente_doc}
                      serie={f.serie}
                      monto={f.monto_total}
                      moneda={f.moneda}
                      modalidadPago={f.modalidad_pago ?? []}
                      entregaLugar={f.entrega_lugar}
                      entregaFecha={f.entrega_fecha}
                      adjuntos={documentos}
                      compendio={compendios.get(f.id) ?? null}
                    />
                    <ChecksPedidoCentral
                      informeId={f.id}
                      cliente={f.cliente_nombre}
                      numeroPedido={(pedido?.numero_pedido_erp as string | null) ?? null}
                      pedidoEjecutado={pedido?.pedido_ejecutado_at != null}
                      liquidacion={pedido?.liquidacion_at != null}
                      aprobadoPostventa={pedido?.aprobado_at != null}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </SeccionPanel>
  );
}
