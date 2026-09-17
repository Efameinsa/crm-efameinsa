import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { RegistroNoDisponible } from "@/components/crm/registro-no-disponible";
import { PedidoAlmacen } from "@/components/crm/pedido-almacen";
import { GaleriaAlmacen } from "@/components/crm/galeria-almacen";
import { bloquesPedido, circuitoDe, ETIQUETA_TIPO_PEDIDO, sinPrecios, type FotoAlmacen, type ServicioPostventa } from "@/lib/postventa";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Un pedido visto desde el almacén (0246): lo que tiene que saber para
 * probar, embalar y despachar, y lo que le toca marcar. Sin cifras. El riel
 * de los tres bloques va como referencia de en qué está el circuito entero.
 */
export default async function PedidoAlmacenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase.from("servicios_postventa").select("*").eq("id", id).maybeSingle();
  if (!data) return <RegistroNoDisponible volverHref="/almacen/pedidos" volverTexto="Volver a los pedidos" />;
  const servicio = sinPrecios(data as unknown as ServicioPostventa);
  const bloques = bloquesPedido(servicio);
  const circuito = circuitoDe(servicio);
  const cliente = (servicio.cliente_texto ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");

  const fotos: FotoAlmacen[] = [
    ...((servicio.protocolo_fotos ?? []) as FotoAlmacen[]),
    ...((servicio.salida_fotos ?? []) as FotoAlmacen[]),
    ...((servicio.agencia_fotos ?? []) as FotoAlmacen[]),
  ];
  const { data: firmadas } = fotos.length
    ? await supabase.storage.from("adjuntos").createSignedUrls(fotos.map((f) => f.path), 3600)
    : { data: null };
  const galeria = fotos.map((f, i) => ({ ...f, url: firmadas?.[i]?.signedUrl ?? null }));

  return (
    <div className="space-y-4">
      <Link href="/almacen/pedidos" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Volver a los pedidos
      </Link>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {ETIQUETA_TIPO_PEDIDO[circuito.tipo]}{circuito.entregaEnPlanta ? " · el cliente recoge en planta" : ""}{servicio.modalidad === "provincia" ? " · provincia" : " · Lima"}
          {!servicio.informe_cierre_id ? " · anterior al circuito" : ""}
        </p>
        <h1 className="mt-0.5 text-lg font-bold leading-tight text-foreground">{cliente}</h1>
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{servicio.equipo}</p>
        <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          {(servicio.direccion_entrega || servicio.ubicacion) && (
            <p className="inline-flex items-start gap-1"><MapPin className="mt-0.5 size-3.5 flex-none" /> {servicio.direccion_entrega ?? servicio.ubicacion}</p>
          )}
          {servicio.fecha_despacho && <p>Despacho programado: <b className="text-foreground">{servicio.fecha_despacho}</b>{servicio.despacho_nota ? ` · ${servicio.despacho_nota}` : ""}</p>}
          {servicio.recibe_nombre && <p>Recibe: {servicio.recibe_nombre}{servicio.recibe_telefono ? ` · ${servicio.recibe_telefono}` : ""}</p>}
          {servicio.numero_pedido_erp && <p>Pedido ERP: {servicio.numero_pedido_erp}</p>}
          {servicio.apertura_despacho_at && <p>Apertura de despacho emitida el {fechaHoraLima(servicio.apertura_despacho_at)}</p>}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <PedidoAlmacen servicio={servicio} />

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-foreground">El circuito entero</h2>
            {bloques.map((b) => (
              <div key={b.numero} className="mt-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{"①②③"[b.numero - 1]} {b.titulo}</p>
                <ul className="mt-1 space-y-0.5">
                  {b.pasos.map((p) => (
                    <li key={p.clave} className={cn("flex items-start gap-1.5 text-xs", p.hecho ? "text-muted-foreground" : "text-foreground")}>
                      <span className={cn("mt-0.5 inline-block size-3 flex-none rounded-full border", p.hecho ? "border-[#1E7F4F] bg-[#1E7F4F]" : "border-border")} />
                      <span>
                        {p.etiqueta}
                        {p.trabado && !p.hecho && <span className="block text-[11px] text-destructive">{p.trabado}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {galeria.length > 0 && <GaleriaAlmacen fotos={galeria} />}
        </div>
      </div>
    </div>
  );
}
