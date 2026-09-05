import Link from "next/link";
import { AlertTriangle, Ban, CheckCircle2, Package, Truck } from "lucide-react";
import { requerirRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fechaCalendario, fechaHoraLima } from "@/lib/fechas";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ChecksPedidoCentral } from "@/components/crm/checks-pedido-central";
import { ExpedienteCierre } from "@/components/crm/expediente-cierre";
import { AnularCierreBoton } from "@/components/crm/anular-cierre-boton";
import { DevolverCierreBoton } from "@/components/crm/devolver-cierre-boton";
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
  { clave: "devueltos", etiqueta: "Devueltos" },
  { clave: "liberados", etiqueta: "Liberados" },
  { clave: "anulados", etiqueta: "Anulados" },
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
  anulado_at: string | null;
  anulado_motivo: string | null;
  perfiles: { nombre: string; codigo_comercial: string | null } | null;
}

export default async function CierresCentralPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  // Operaciones también: es quien anula los cierres que le piden los
  // comerciales (0170). La pantalla tenía su propio candado además del de la
  // sección, y por eso Lesly seguía rebotando después de abrir el layout.
  await requerirRol(["central", "gerencia", "admin", "operaciones"]);
  const sp = await searchParams;
  const pestana: Pestana = (PESTANAS.find((p) => p.clave === sp.ver)?.clave ?? "por_liberar") as Pestana;

  const supabase = await createClient();
  const { data } = await supabase
    .from("informes_cierre")
    .select(
      "id, codigo, serie, fecha, emitido_at, asunto, cliente_nombre, cliente_doc, monto_total, moneda, urgente, entrega_lugar, entrega_fecha, modalidad_pago, cuenta_id, oportunidad_id, venta_id, adjuntos, anulado_at, anulado_motivo, perfiles!informes_cierre_creado_por_fkey(nombre, codigo_comercial)",
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

  // Los números de cierre que no llevan documento y quedaron anulados por
  // gerencia (0164, Carlos 03-09: «todo lo vacío queda anulado; el reporte es
  // el correlativo»). Se listan en la pestaña de anulados para que nadie
  // pregunte qué pasó con el 007.
  const { data: numerosAnulados } = await supabase
    .from("correlativos_anulados")
    .select("clave, numero, motivo")
    .in("clave", ["INFORME-OPEN-2026", "INFORME-EFAMEINSA-2026"])
    .order("clave")
    .order("numero");
  const vaciosAnulados = (numerosAnulados ?? []).map((a) => ({
    serie: (a.clave as string).replace("INFORME-", "").replace("-2026", ""),
    codigo: `${String(a.numero).padStart(3, "0")}-2026`,
    motivo: a.motivo as string,
  }));

  // LO QUE PIDIÓ EL COMERCIAL (0170). Carlos, 04-09: «el comercial manda un
  // clip: necesito anular el pedido, y pone todas sus historias. Le llega al
  // administrador; ingresa, anula». Van arriba de todo porque son incendios:
  // una venta que se cayó con el cierre ya emitido.
  const { data: pedidosAnulacion } = await supabase
    .from("anulaciones_solicitadas")
    .select("id, informe_id, motivo, created_at, perfiles!anulaciones_solicitadas_solicitada_por_fkey(nombre, codigo_comercial)")
    .is("atendida_at", null)
    .order("created_at", { ascending: false });
  const codigoDeInforme = new Map(todas.map((f) => [f.id as string, f.codigo as string | null]));
  // Los que ya están anulados no ofrecen el botón: el pedido queda a la vista
  // hasta que alguien lo cierre, pero la acción ya no aplica.
  const anuladoPorId = new Set(todas.filter((f) => f.anulado_at != null).map((f) => f.id as string));

  // LOS QUE CENTRAL DEVOLVIÓ (0178). Carlos, 05-09: «tendrías que rechazarlo y
  // que lo haga bien». Mientras el comercial no lo corrija, el cierre no está
  // en la cola de Central: está en la de él.
  const { data: devoluciones } = await supabase
    .from("devoluciones_cierre")
    .select("informe_id, motivo, devuelto_at")
    .is("resuelto_at", null);
  const devueltoPorInforme = new Map(
    (devoluciones ?? []).map((d) => [d.informe_id as string, d as { motivo: string; devuelto_at: string }]),
  );

  const liberado = (id: string) => {
    const p = pedidoPorInforme.get(id);
    return p?.pedido_ejecutado_at != null && p?.liquidacion_at != null;
  };
  // Un cierre anulado no es trabajo de nadie: no está por liberar ni liberado.
  // Tiene su propia pestaña para poder encontrarlo cuando alguien pregunte qué
  // pasó con ese número, que es justamente para lo que se anula en vez de
  // borrar (reunión 28-08).
  const anulado = (f: FilaInforme) => f.anulado_at != null;
  // Devuelto al comercial y todavía sin corregir: no es trabajo de Central
  // hasta que vuelva (0178).
  const devuelto = (id: string) => devueltoPorInforme.has(id);
  const porLiberar = todas.filter((f) => !liberado(f.id) && !anulado(f) && !devuelto(f.id));
  const devueltos = todas.filter((f) => devuelto(f.id));
  const anulados = todas.filter(anulado);
  const liberados = todas.filter((f) => liberado(f.id) && !anulado(f));
  const filas =
    pestana === "por_liberar"
      ? porLiberar
      : pestana === "devueltos"
        ? devueltos
        : pestana === "liberados"
          ? liberados
          : pestana === "anulados"
            ? anulados
            : todas;
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
    <>
      {(pedidosAnulacion ?? []).length > 0 && (
        <div className="mb-3 rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-3">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-900">
            <Ban className="size-3.5" /> Piden anular ({(pedidosAnulacion ?? []).length})
          </h3>
          <p className="mt-1 text-[11px] text-amber-900/80">
            La venta se cayó o cambió de precio con el cierre ya emitido. Lo ejecuta operaciones con su código, desde
            el botón «Anular» del cierre. Después el comercial rehace la cotización y el cierre desde cero.
          </p>
          <ul className="mt-2 space-y-1.5">
            {(pedidosAnulacion ?? []).map((p) => {
              const quien = p.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
              return (
                <li key={p.id as string} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-mono text-[11px] font-semibold text-foreground">
                    {codigoDeInforme.get(p.informe_id as string) ?? "Cierre"}
                  </span>
                  <span className="font-medium text-foreground">
                    {quien?.codigo_comercial ? `${quien.codigo_comercial} · ` : ""}
                    {quien?.nombre ?? "Un comercial"}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{fechaHoraLima(p.created_at as string)}</span>
                  <span className="basis-full text-muted-foreground">{p.motivo as string}</span>
                  {/* El botón acá mismo. Lesly entró por la notificación, vio
                      el pedido y el cierre no estaba en la pestaña que abre
                      por defecto —el 011 ya estaba liberado—, así que tenía
                      que ir a buscarlo. Carlos lo dijo en una línea: «ingresa,
                      anula». */}
                  {!anuladoPorId.has(p.informe_id as string) && (
                    <span className="basis-full pt-1">
                      <AnularCierreBoton
                        informeId={p.informe_id as string}
                        codigo={codigoDeInforme.get(p.informe_id as string) ?? "—"}
                      />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    <SeccionPanel
      titulo="Cierres de venta"
      accion={
        <div className="flex flex-wrap items-center gap-1.5">
          {PESTANAS.map((p) => {
            const n =
              p.clave === "devueltos"
                ? devueltos.length
                : p.clave === "por_liberar"
                ? porLiberar.length
                : p.clave === "liberados"
                  ? liberados.length
                  : p.clave === "anulados"
                    ? anulados.length
                    : todas.length;
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

      {(pestana === "anulados" || pestana === "todos") && vaciosAnulados.length > 0 && (
        <div className="mb-3 rounded-md border border-dashed border-border bg-secondary/30 p-2.5 text-xs">
          <p className="font-semibold text-foreground">Números anulados sin documento</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {vaciosAnulados.map((a) => (
              <li key={`${a.serie}-${a.codigo}`}>
                <span className="font-mono font-semibold text-foreground">{a.serie} {a.codigo}</span> · {a.motivo}
              </li>
            ))}
          </ul>
        </div>
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
            const estaAnulado = anulado(f);
            const documentos = adjuntosPorInforme.get(f.id) ?? [];
            return (
              <article
                key={f.id}
                className={cn(
                  "rounded-lg border p-3",
                  estaAnulado
                    ? "border-dashed border-border bg-secondary/30"
                    : f.urgente && !yaLiberado
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border",
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
                      {estaAnulado && (
                        <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                          Anulado
                        </span>
                      )}
                      {f.urgente && !yaLiberado && !estaAnulado && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                          URGENTE
                        </span>
                      )}
                      {yaLiberado && !estaAnulado && (
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
                      {estaAnulado && f.anulado_motivo && (
                        <span className="w-full text-muted-foreground">
                          Anulado: {f.anulado_motivo}
                        </span>
                      )}
                      {documentos.length === 0 && !estaAnulado && (
                        <span className="flex items-center gap-1 font-medium text-amber-700">
                          <Package className="size-3" /> sin documentos adjuntos
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Lo accionable, a la derecha y siempre en el mismo lugar. */}
                  <div className="flex flex-wrap items-center gap-2">
                    {!estaAnulado && <AnularCierreBoton informeId={f.id} codigo={f.codigo} />}
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
                    {!estaAnulado && (
                    <ChecksPedidoCentral
                      informeId={f.id}
                      cliente={f.cliente_nombre}
                      numeroPedido={(pedido?.numero_pedido_erp as string | null) ?? null}
                      pedidoEjecutado={pedido?.pedido_ejecutado_at != null}
                      liquidacion={pedido?.liquidacion_at != null}
                      aprobadoPostventa={pedido?.aprobado_at != null}
                    />
                    )}

                    {/* DEVOLVERLO EN VEZ DE PASARLO IGUAL (0178). Carlos,
                        05-09: «¿para qué le derivas si está mal? Tendrías que
                        rechazarlo y que lo haga bien». */}
                    {devueltoPorInforme.has(f.id) ? (
                      <p className="mt-2 rounded-md border border-amber-400/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-400">
                        <b>Devuelto al comercial</b> el{" "}
                        {fechaHoraLima(devueltoPorInforme.get(f.id)!.devuelto_at)}: {devueltoPorInforme.get(f.id)!.motivo}
                      </p>
                    ) : (
                      !estaAnulado &&
                      !liberado(f.id) && (
                        <div className="mt-2">
                          <DevolverCierreBoton informeId={f.id} codigo={f.codigo} />
                        </div>
                      )
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </SeccionPanel>
    </>
  );
}
