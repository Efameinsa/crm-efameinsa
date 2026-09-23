import Link from "next/link";
import { AlertTriangle, ArrowRight, ClipboardList, Package, PhoneForwarded, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { bloquesPedido, etiquetaResponsable, sinPrecios, type ServicioPostventa } from "@/lib/postventa";
import { ETIQUETA_ETAPA, ETIQUETA_TIPO_ATENCION, type EtapaAtencion, type TipoAtencion } from "@/lib/atenciones";
import { fechaCalendario, fechaHoraLima, fechaLima } from "@/lib/fechas";
import { ETIQUETA_ESTADO_APERTURA, ETIQUETA_TIPO_APERTURA, aQuienLeToca, estadoApertura, type TipoApertura } from "@/lib/aperturas-llamada";
import { cn } from "@/lib/utils";

/**
 * LO QUE ESTÁ PENDIENTE CON ESTE CLIENTE, A UN CLIC.
 *
 * Reunión del 23-09, con Hortifrut en pantalla (dos pedidos para dos sedes; a
 * uno se le pidió la prueba y al otro no): «acá al costado se puede añadir un
 * ítem donde salga pedido registrado, pedido que falta registrar… que cuando
 * le dé clic vaya a hacer su gestión, para que no se vaya otra vez a pedidos
 * y se vuelva a desglosar». Y Carlos: «esta vista es el consolidado… pero no
 * figuran los pedidos o lo que está pendiente por ejecutar con el cliente».
 *
 * La ficha ya contaba la historia; faltaba lo VIVO. Acá va cada pedido abierto
 * con el paso que sigue y quién lo tiene, y cada caso técnico abierto con su
 * etapa. Si no hay nada, el panel no aparece: no se anuncia lo que no existe.
 *
 * Solo lectura y sin montos. El enlace lleva a la pantalla donde se hace la
 * gestión cuando quien mira es del área (postventa, gerencia); el comercial
 * ve el estado —es lo que necesita para contestarle al cliente— sin enlace a
 * una pantalla que no es suya.
 */
export async function PendientesDelCliente({ cuentaId, conEnlace }: { cuentaId: string; conEnlace: boolean }) {
  const supabase = await createClient();
  const [{ data: pedidosData }, { data: atencionesData }, { data: aperturasData }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select("*")
      .eq("cuenta_id", cuentaId)
      .is("cerrado_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("atenciones")
      .select("id, tipo, etapa, equipo_texto, solicitado_at, programada_at")
      .eq("cuenta_id", cuentaId)
      .is("cerrado_at", null)
      .order("solicitado_at", { ascending: false })
      .limit(10),
    // Las aperturas al almacén (0281). El comercial no las lee (RLS): para él
    // simplemente no aparecen.
    supabase
      .from("aperturas_llamada")
      .select("id, tipo, programada_para, equipos, anulada_at, enviada_cliente_at, revisada_at, informe_at, tomada_at")
      .eq("cuenta_id", cuentaId)
      .is("anulada_at", null)
      .is("enviada_cliente_at", null)
      .order("programada_para", { ascending: true })
      .limit(10),
  ]);
  const aperturas = ((aperturasData ?? []) as unknown as (Parameters<typeof estadoApertura>[0] & {
    id: string;
    tipo: TipoApertura;
    programada_para: string;
    equipos: string;
  })[]).filter((a) => aQuienLeToca(estadoApertura(a)) !== null);
  const pedidos = ((pedidosData ?? []) as unknown as ServicioPostventa[]).map(sinPrecios);
  const atenciones = (atencionesData ?? []) as {
    id: string;
    tipo: TipoAtencion;
    etapa: EtapaAtencion;
    equipo_texto: string | null;
    solicitado_at: string;
    programada_at: string | null;
  }[];
  if (pedidos.length === 0 && atenciones.length === 0 && aperturas.length === 0) return null;

  return (
    <div className="rounded-xl border border-primary/30 bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-foreground">
          <ClipboardList className="size-4" /> Pendiente con este cliente
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
            {pedidos.length + atenciones.length + aperturas.length}
          </span>
        </h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Lo que todavía no termina. Cada fila dice qué sigue y quién lo tiene.</p>
      </div>
      <ul className="divide-y divide-border">
        {pedidos.map((s) => {
          const pasos = bloquesPedido(s).flatMap((b) => b.pasos);
          const hechos = pasos.length - pasos.filter((p) => !p.hecho).length;
          const faltan = pasos.filter((p) => !p.hecho);
          const siguiente = faltan[0] ?? null;
          const equipo = (s.equipo ?? "").split("\n")[0].trim() || "Pedido";
          const contenido = (
            <>
              <div className="flex items-start gap-2">
                <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold text-foreground" title={s.equipo ?? undefined}>{equipo}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Pedido{s.numero_pedido_erp ? ` ERP ${s.numero_pedido_erp}` : ""} · {hechos} de {pasos.length} pasos
                    {s.fecha_despacho && !s.despachado_at ? ` · sale el ${fechaCalendario(s.fecha_despacho)}` : ""}
                    {s.despachado_at ? ` · despachado el ${fechaLima(s.despachado_at)}` : ""}
                  </p>
                  {siguiente && (
                    <p className={cn("mt-1 text-xs", siguiente.trabado ? "text-amber-800" : "text-foreground")}>
                      {siguiente.trabado && <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />}
                      Sigue: <b>{siguiente.etiqueta}</b>
                      <span className="text-muted-foreground"> · {etiquetaResponsable(siguiente.responsable)}</span>
                    </p>
                  )}
                  {/* El desglose que pidió Rubí: todo lo que falta, no solo lo
                      que sigue (la prueba no espera al pago, 23-09). */}
                  {faltan.length > 1 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {faltan.slice(1, 6).map((p) => (
                        <span key={p.etiqueta} className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {p.etiqueta}
                        </span>
                      ))}
                      {faltan.length > 6 && <span className="text-[10px] text-muted-foreground">+{faltan.length - 6}</span>}
                    </div>
                  )}
                </div>
                {conEnlace && <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              </div>
            </>
          );
          return (
            <li key={`p-${s.id}`}>
              {conEnlace ? (
                <Link href={`/postventa/pedidos/${s.id}`} className="block px-4 py-2.5 transition-colors hover:bg-accent">
                  {contenido}
                </Link>
              ) : (
                <div className="px-4 py-2.5">{contenido}</div>
              )}
            </li>
          );
        })}
        {atenciones.map((a) => {
          const contenido = (
            <div className="flex items-start gap-2">
              <Wrench className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{ETIQUETA_TIPO_ATENCION[a.tipo] ?? a.tipo}</p>
                <p className="text-[11px] text-muted-foreground">
                  {a.equipo_texto ? `${a.equipo_texto.split("\n")[0]} · ` : ""}desde el {fechaLima(a.solicitado_at)}
                </p>
                <p className="mt-1 text-xs text-foreground">
                  Etapa: <b>{ETIQUETA_ETAPA[a.etapa] ?? a.etapa}</b>
                  {a.programada_at ? <span className="text-muted-foreground"> · programada {fechaLima(a.programada_at)}</span> : null}
                </p>
              </div>
              {conEnlace && <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            </div>
          );
          return (
            <li key={`a-${a.id}`}>
              {conEnlace ? (
                <Link href={`/postventa/atenciones/${a.id}`} className="block px-4 py-2.5 transition-colors hover:bg-accent">
                  {contenido}
                </Link>
              ) : (
                <div className="px-4 py-2.5">{contenido}</div>
              )}
            </li>
          );
        })}
        {aperturas.map((a) => {
          const estado = estadoApertura(a);
          return (
            <li key={`ap-${a.id}`}>
              <Link href={`/aperturas/${a.id}`} className="block px-4 py-2.5 transition-colors hover:bg-accent">
                <div className="flex items-start gap-2">
                  <PhoneForwarded className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{ETIQUETA_TIPO_APERTURA[a.tipo]}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {fechaHoraLima(a.programada_para)} · {a.equipos.split("\n")[0]}
                    </p>
                    <p className="mt-1 text-xs text-foreground">
                      <b>{ETIQUETA_ESTADO_APERTURA[estado]}</b>
                      <span className="text-muted-foreground"> · {aQuienLeToca(estado) === "almacen" ? "Almacén" : "Postventa"}</span>
                    </p>
                  </div>
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
