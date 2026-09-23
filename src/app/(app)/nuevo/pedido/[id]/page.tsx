import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowDown, Building2, Check, MapPin, Truck, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { equiposDelPedido as cargarEquiposDelPedido } from "@/lib/acciones/postventa";
import {
  bloquesPedido,
  circuitoDe,
  etiquetaResponsable,
  puedeVerPrecios,
  queLoFrena,
  sinPrecios,
  textoCondicionPago,
  type ServicioPostventa,
} from "@/lib/postventa";
import { ETIQUETA_ESTADO_APERTURA, aperturaAbierta, estadoApertura } from "@/lib/aperturas-llamada";
import { fechaCalendario, fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import { PedidoPostventa } from "@/components/crm/pedido-postventa";
import { EquiposDelPedido } from "@/components/crm/equipos-del-pedido";

export const dynamic = "force-dynamic";

/**
 * LA FICHA DEL PEDIDO, COMO UN ENVÍO (propuesta, 23-09).
 *
 * La de hoy abre con la lista de los diez pasos y hay que recorrerla para
 * saber en qué va. Acá arriba va la línea de avance por fases —como el
 * seguimiento de una encomienda— y, grande, lo único que importa ahora: qué
 * sigue y a quién le toca. Los pasos con sus botones quedan debajo, igual que
 * siempre, para hacerlos sin cambiar de pantalla.
 */
export default async function PedidoNuevoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase.from("servicios_postventa").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const verPrecios = puedeVerPrecios(perfil);
  const servicio = verPrecios ? (data as unknown as ServicioPostventa) : sinPrecios(data as unknown as ServicioPostventa);

  const [{ data: atencionPuesta }, listaEquipos, { data: aperturasData }, { data: informe }, { data: emisor }] = await Promise.all([
    supabase.from("atenciones").select("id, etapa, programada_at, tecnico, cerrado_at").eq("servicio_id", id).eq("tipo", "puesta_en_marcha").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    cargarEquiposDelPedido(id),
    supabase.from("aperturas_llamada").select("id, tipo, programada_para, anulada_at, enviada_cliente_at, revisada_at, informe_at, tomada_at").eq("servicio_id", id).order("programada_para", { ascending: false }),
    servicio.informe_cierre_id
      ? supabase.from("informes_cierre").select("codigo, entrega_direccion, contacto_despacho, forma_pago").eq("id", servicio.informe_cierre_id).maybeSingle()
      : Promise.resolve({ data: null }),
    servicio.apertura_despacho_por ? supabase.from("perfiles").select("nombre").eq("id", servicio.apertura_despacho_por).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const aperturas = ((aperturasData ?? []) as unknown as (Parameters<typeof estadoApertura>[0] & { id: string; tipo: string; programada_para: string })[]).map((a) => ({
    id: a.id,
    tipo: a.tipo,
    programada_para: a.programada_para,
    estado: ETIQUETA_ESTADO_APERTURA[estadoApertura(a)],
    abierta: aperturaAbierta(a),
  }));
  const equiposTexto = listaEquipos.map((e) => `${e.descripcion}${e.serie ? ` · serie ${e.serie}` : ""}`).join("\n");

  const bloques = bloquesPedido(servicio);
  const pasos = bloques.flatMap((b) => b.pasos);
  const siguiente = pasos.find((p) => !p.hecho) ?? null;
  const frena = queLoFrena(servicio);
  const circuito = circuitoDe(servicio);
  const cliente = (servicio.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  const inf = informe as {
    codigo: string | null;
    entrega_direccion: string | null;
    contacto_despacho: { nombre?: string | null; telefono?: string | null; area?: string | null } | string | null;
    forma_pago: string | null;
  } | null;
  // El contacto del despacho viene como objeto en los cierres nuevos y como texto en los viejos.
  const recibe =
    typeof inf?.contacto_despacho === "string"
      ? inf.contacto_despacho
      : [inf?.contacto_despacho?.nombre, inf?.contacto_despacho?.telefono, inf?.contacto_despacho?.area].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {circuito.esRepuesto ? "Pedido de repuesto" : circuito.esServicio ? "Pedido de servicio" : "Pedido de equipo"}
              {servicio.numero_pedido_erp ? ` · ERP ${servicio.numero_pedido_erp}` : ""}
              {inf?.codigo ? ` · cierre ${inf.codigo}` : ""}
              {servicio.modalidad ? ` · ${servicio.modalidad === "provincia" ? "Provincia" : "Lima"}` : ""}
            </p>
            <h1 className="text-xl font-bold text-foreground">
              {servicio.cuenta_id ? (
                <Link href={`/nuevo/cliente/${servicio.cuenta_id}`} className="hover:underline">
                  {cliente}
                </Link>
              ) : (
                cliente
              )}
            </h1>
            <p className="line-clamp-2 text-sm text-muted-foreground">{(servicio.equipo ?? "").split("\n").slice(0, 2).join(" · ")}</p>
          </div>
          <Link href={`/postventa/pedidos/${id}?hoy=1`} className="text-[11px] text-muted-foreground hover:underline">
            Ficha de hoy
          </Link>
        </div>

        {/* LA LÍNEA DE AVANCE: tres fases, cada paso un punto. */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {bloques.map((b) => (
            <div key={b.numero} className={cn("rounded-lg border p-3", b.completo ? "border-[#1E7F4F]/30 bg-[#1E7F4F]/5" : b.enCurso ? "border-primary/40 bg-primary/5" : "border-border")}>
              <p className={cn("flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide", b.completo ? "text-[#1E7F4F]" : b.enCurso ? "text-primary" : "text-muted-foreground")}>
                {b.completo ? <Check className="size-3.5" /> : <span className="flex size-4 items-center justify-center rounded-full border text-[10px]">{b.numero}</span>}
                {b.titulo}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {b.pasos.map((p) => (
                  <span
                    key={p.clave}
                    title={`${p.etiqueta}${p.hecho ? ` · hecho${p.cuando ? ` el ${fechaLima(p.cuando)}` : ""}` : p.trabado ? ` · ${p.trabado}` : ` · le toca a ${etiquetaResponsable(p.responsable)}`}`}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      p.hecho ? "bg-[#1E7F4F]/15 text-[#1E7F4F]" : p === siguiente ? "bg-primary text-primary-foreground" : p.trabado ? "bg-amber-100 text-amber-900" : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {p.hecho ? "✓ " : ""}
                    {p.etiqueta.length > 28 ? `${p.etiqueta.slice(0, 26)}…` : p.etiqueta}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* LO ÚNICO QUE IMPORTA AHORA. */}
      {siguiente ? (
        <a href="#pasos" className={cn("flex items-center gap-4 rounded-xl border p-4 shadow-sm", frena?.grave ? "border-amber-400 bg-amber-50" : "border-primary/30 bg-primary/5")}>
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", frena?.grave ? "bg-amber-200 text-amber-900" : "bg-primary text-primary-foreground")}>
            {frena?.grave ? <AlertTriangle className="size-5" /> : <ArrowDown className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Qué sigue · le toca a {etiquetaResponsable(siguiente.responsable)}</p>
            <p className="text-lg font-bold text-foreground">{siguiente.etiqueta}</p>
            {(siguiente.trabado || siguiente.detalle) && <p className="text-sm text-muted-foreground">{siguiente.trabado ?? siguiente.detalle}</p>}
          </div>
          <span className="hidden text-xs font-medium text-primary sm:block">Hacerlo abajo ↓</span>
        </a>
      ) : (
        <p className="rounded-xl border border-[#1E7F4F]/30 bg-[#1E7F4F]/10 p-4 text-sm font-semibold text-[#1E7F4F]">Pedido completo: no queda nada por hacer.</p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div id="pasos" className="scroll-mt-4">
          <PedidoPostventa
            servicio={servicio}
            atencionPuesta={atencionPuesta as { id: string; etapa: string; programada_at: string | null; tecnico: string | null; cerrado_at: string | null } | null}
            verPrecios={verPrecios}
            puedeDefinirCondicion={["gerencia", "admin", "operaciones"].includes(perfil.rol)}
            emitidoApertura={(emisor as { nombre: string } | null)?.nombre ?? null}
            aperturas={aperturas}
            equiposTexto={equiposTexto}
          />
        </div>
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 text-sm shadow-sm">
            <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-foreground">La entrega</p>
            <p className="flex items-start gap-1.5">
              <Truck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {servicio.despachado_at
                ? `Despachado el ${fechaLima(servicio.despachado_at)}`
                : servicio.fecha_despacho
                  ? `Sale el ${fechaCalendario(servicio.fecha_despacho)}${servicio.despacho_hora ? ` a las ${String(servicio.despacho_hora).slice(0, 5)}` : ""}`
                  : "Sin fecha de despacho"}
            </p>
            {inf?.entrega_direccion && (
              <p className="mt-1 flex items-start gap-1.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {inf.entrega_direccion}
              </p>
            )}
            {recibe && (
              <p className="mt-1 flex items-start gap-1.5">
                <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> Recibe: {recibe}
              </p>
            )}
            <p className="mt-1 flex items-start gap-1.5">
              <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {textoCondicionPago(servicio) ?? inf?.forma_pago ?? "Condición de pago sin registrar"}
            </p>
          </div>
          <EquiposDelPedido servicioId={servicio.id} equipos={listaEquipos} modo="postventa" despachado={Boolean(servicio.despachado_at)} cliente={cliente} />
        </aside>
      </div>
    </div>
  );
}
