import Link from "@/components/enlace";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Truck, Rocket, Wrench, Video, FileText, Phone, ShieldCheck, ShieldX, CircleDashed } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { estadoGarantia, etiquetaTipoServicio, etiquetaClaseAlmacen } from "@/lib/postventa";
import { ETIQUETA_TIPO_ATENCION } from "@/lib/atenciones";
import { fechaLima, fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Hito = {
  clave: string;
  fecha: string | null;
  titulo: string;
  detalle?: string | null;
  href?: string | null;
  icono: "prueba" | "despacho" | "puesta" | "mantenimiento" | "videollamada" | "informe" | "caso";
  hecho: boolean;
};

const ICONO = {
  prueba: ClipboardCheck,
  despacho: Truck,
  puesta: Rocket,
  mantenimiento: Wrench,
  videollamada: Video,
  informe: FileText,
  caso: Phone,
};

/**
 * TODO LO HECHO EN UNA MÁQUINA, EN ORDEN (Carlos, reunión del 18-09): «este
 * cliente compró una lavadora de 17 kilos. Lo primero que se ha hecho es el
 * protocolo de pruebas. Luego el despacho. Luego el informe de puesta en
 * marcha. Después de cuatro meses el mantenimiento preventivo. Luego una
 * atención técnica por videollamada… todo lo que tenga que ver con informe
 * relacionado a esta máquina. Si no se puso en marcha, aparecerá vacío».
 *
 * Los tres primeros hitos salen del pedido del que nació la máquina; el
 * resto, de los informes y los casos donde estuvo. Lo que no se hizo se
 * muestra igual, en gris, para que se vea el hueco. Sin precios.
 */
export default async function EquipoInformesAlmacenPage({ params }: { params: Promise<{ equipoId: string }> }) {
  await requerirPerfil();
  const { equipoId } = await params;
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("equipos_instalados")
    .select("id, serie, modelo_texto, cuenta_id, cliente_texto, servicio_id, fecha_venta, fecha_despacho, guia_remision, fecha_puesta_marcha, garantia_meses, garantia_hasta, ultimo_mantenimiento, proximo_mantenimiento, ciclos_ultimo, ubicacion, cuentas(razon_social)")
    .eq("id", equipoId)
    .maybeSingle();
  if (!m) notFound();
  const cuenta = m.cuentas as unknown as { razon_social: string } | null;

  const [{ data: pedido }, { data: informes }, { data: enCasos }] = await Promise.all([
    m.servicio_id
      ? supabase
          .from("servicios_postventa")
          .select("id, fecha_confirmacion, prueba_solicitada_at, prueba_lista_at, protocolo_prueba_ref, protocolo_fotos, almacen_listo_at, fecha_despacho, despachado_at, guia, agencia_at, transportista, salida_fotos, puesta_en_marcha, con_instalacion, entrega_en")
          .eq("id", m.servicio_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("informes_servicio")
      .select("id, correlativo, anio, tipo, clase_almacen, modalidad, ejecutado_at, tecnico, detalle, observaciones, pendientes, elevado_a_postventa_at, servicio_id")
      .or(`equipo_id.eq.${equipoId}${m.servicio_id ? `,and(servicio_id.eq.${m.servicio_id},equipo_id.is.null)` : ""}`)
      .not("emitido_at", "is", null)
      .order("ejecutado_at")
      .limit(100),
    supabase.from("atencion_equipos").select("atencion_id").eq("equipo_id", equipoId),
  ]);
  const idsCasos = (enCasos ?? []).map((x) => x.atencion_id as string);
  const { data: casos } = await supabase
    .from("atenciones")
    .select("id, tipo, etapa, solicitado_at, cerrado_at, detalle, tecnico, equipo_id, informe_servicio_id")
    .or(`equipo_id.eq.${equipoId}${idsCasos.length ? `,id.in.(${idsCasos.join(",")})` : ""}`)
    .order("solicitado_at")
    .limit(50);

  // ── la línea de tiempo ──────────────────────────────────────────────────
  const hitos: Hito[] = [];
  const fotosProtocolo = ((pedido?.protocolo_fotos ?? []) as unknown[]).length;
  const fotosSalida = ((pedido?.salida_fotos ?? []) as unknown[]).length;
  hitos.push({
    clave: "prueba",
    fecha: pedido?.prueba_lista_at ?? null,
    titulo: "Protocolo de prueba y embalaje",
    detalle: pedido?.prueba_lista_at
      ? `${pedido.protocolo_prueba_ref ? `Protocolo ${pedido.protocolo_prueba_ref} · ` : ""}${fotosProtocolo} foto${fotosProtocolo === 1 ? "" : "s"}`
      : pedido
        ? pedido.prueba_solicitada_at
          ? "Postventa pidió la prueba; el almacén todavía no la marcó"
          : "No se registró la prueba en el CRM"
        : "Esta máquina no nació de un pedido del circuito (alta a mano o venta anterior)",
    href: pedido ? `/almacen/pedidos/${pedido.id}` : null,
    icono: "prueba",
    hecho: Boolean(pedido?.prueba_lista_at),
  });
  hitos.push({
    clave: "despacho",
    fecha: pedido?.despachado_at ?? m.fecha_despacho ?? null,
    titulo: "Despacho",
    detalle: pedido?.despachado_at
      ? `${pedido.guia ? `Guía ${pedido.guia} · ` : "Sin guía todavía · "}${pedido.transportista ? `${pedido.transportista} · ` : ""}${fotosSalida} foto${fotosSalida === 1 ? "" : "s"} de la salida`
      : m.fecha_despacho
        ? `Salió el ${fechaLima(m.fecha_despacho)}${m.guia_remision ? ` con guía ${m.guia_remision}` : ""} (dato de la ficha)`
        : pedido?.fecha_despacho
          ? `Programado para el ${pedido.fecha_despacho}`
          : "Todavía no sale",
    href: pedido ? `/almacen/pedidos/${pedido.id}` : null,
    icono: "despacho",
    hecho: Boolean(pedido?.despachado_at ?? m.fecha_despacho),
  });
  const informePuesta = (informes ?? []).find((i) => i.tipo === "puesta_en_marcha" || String(i.clase_almacen ?? "").startsWith("puesta_en_marcha"));
  hitos.push({
    clave: "puesta",
    fecha: informePuesta?.ejecutado_at ?? pedido?.puesta_en_marcha ?? m.fecha_puesta_marcha ?? null,
    titulo: "Puesta en marcha",
    detalle: informePuesta
      ? `${etiquetaClaseAlmacen(informePuesta.clase_almacen) ?? "Informe de puesta en marcha"} · N.º ${String(informePuesta.correlativo).padStart(3, "0")}-${informePuesta.anio}${informePuesta.tecnico ? ` · ${informePuesta.tecnico}` : ""}`
      : pedido?.puesta_en_marcha || m.fecha_puesta_marcha
        ? "Con fecha en el pedido, sin informe"
        : "No se hizo puesta en marcha (ni presencial ni por videollamada)",
    href: informePuesta ? `/postventa/informes/${informePuesta.id}` : null,
    icono: "puesta",
    hecho: Boolean(informePuesta ?? pedido?.puesta_en_marcha ?? m.fecha_puesta_marcha),
  });
  for (const i of informes ?? []) {
    if (i.id === informePuesta?.id) continue;
    const esMtto = String(i.tipo).startsWith("mantenimiento") || String(i.clase_almacen ?? "").startsWith("mtto");
    hitos.push({
      clave: `informe-${i.id}`,
      fecha: i.ejecutado_at,
      titulo: etiquetaClaseAlmacen(i.clase_almacen) ?? etiquetaTipoServicio(i.tipo),
      detalle: `N.º ${String(i.correlativo).padStart(3, "0")}-${i.anio}${i.tecnico ? ` · ${i.tecnico}` : ""}${i.modalidad === "videollamada" ? " · videollamada" : i.modalidad === "planta" ? " · en planta" : ""}${i.detalle ? ` — ${String(i.detalle).slice(0, 140)}` : ""}`,
      href: `/postventa/informes/${i.id}`,
      icono: i.modalidad === "videollamada" ? "videollamada" : esMtto ? "mantenimiento" : "informe",
      hecho: true,
    });
  }
  const idsInformesDeCasos = new Set((casos ?? []).map((c) => c.informe_servicio_id).filter(Boolean));
  for (const c of casos ?? []) {
    // Un caso que ya tiene informe se cuenta por el informe; el que no, se
    // muestra como caso (abierto o cerrado sin informe).
    if (c.informe_servicio_id && idsInformesDeCasos.has(c.informe_servicio_id) && (informes ?? []).some((i) => i.id === c.informe_servicio_id)) continue;
    hitos.push({
      clave: `caso-${c.id}`,
      fecha: c.solicitado_at,
      titulo: `Caso: ${ETIQUETA_TIPO_ATENCION[c.tipo as keyof typeof ETIQUETA_TIPO_ATENCION] ?? c.tipo}${c.equipo_id === equipoId ? "" : " (agregada al caso)"}`,
      detalle: `${c.cerrado_at ? `Cerrado el ${fechaLima(c.cerrado_at)}` : `En ${c.etapa}`}${c.tecnico ? ` · ${c.tecnico}` : ""}${c.detalle ? ` — ${String(c.detalle).slice(0, 140)}` : ""}`,
      href: `/postventa/atenciones/${c.id}`,
      icono: "caso",
      hecho: Boolean(c.cerrado_at),
    });
  }
  // Los tres primeros van en su orden fijo; el resto por fecha.
  const fijos = hitos.slice(0, 3);
  const resto = hitos.slice(3).sort((a, b) => String(a.fecha ?? "").localeCompare(String(b.fecha ?? "")));
  const linea = [...fijos, ...resto];
  const g = estadoGarantia(m.garantia_hasta);

  return (
    <div className="space-y-4">
      <Link href={m.cuenta_id ? `/almacen/informes/clientes/${m.cuenta_id}` : "/almacen/informes/clientes"} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Volver al cliente
      </Link>
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{cuenta?.razon_social ?? m.cliente_texto ?? "Cliente sin nombre"}</p>
        <h1 className="mt-0.5 font-mono text-lg font-bold leading-tight text-foreground">{m.serie ?? "Sin serie"}</h1>
        <p className="text-sm text-foreground">{m.modelo_texto ?? "Equipo sin modelo"}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className={cn("inline-flex items-center gap-1 font-semibold", g.vigente ? "text-[#1E7F4F]" : "text-destructive")}>
            {g.vigente ? <ShieldCheck className="size-3.5" /> : <ShieldX className="size-3.5" />} {g.etiqueta}
          </span>
          {m.ultimo_mantenimiento && <span>Último mantenimiento {fechaLima(m.ultimo_mantenimiento)}</span>}
          {m.proximo_mantenimiento && <span>Próximo {fechaLima(m.proximo_mantenimiento)}</span>}
          {m.ciclos_ultimo != null && <span>{Number(m.ciclos_ultimo).toLocaleString("es-PE")} ciclos</span>}
          {m.ubicacion && <span>{m.ubicacion}</span>}
        </div>
      </div>

      <SeccionPanel titulo="Todo lo hecho en esta máquina, en orden">
        <ol className="relative ml-3 border-l border-border pl-6">
          {linea.map((h) => {
            const Icono = h.hecho ? ICONO[h.icono] : CircleDashed;
            const cuerpo = (
              <>
                <span className={cn("absolute -left-[1.85rem] top-0.5 flex size-6 items-center justify-center rounded-full border bg-card", h.hecho ? "border-[#1E7F4F] text-[#1E7F4F]" : "border-border text-muted-foreground")}>
                  <Icono className="size-3.5" />
                </span>
                <span className="block text-[11px] font-mono text-muted-foreground">{h.fecha ? fechaHoraLima(h.fecha).replace(/,? 00:00$/, "") : "—"}</span>
                <span className={cn("block text-sm font-semibold", h.hecho ? "text-foreground" : "text-muted-foreground")}>{h.titulo}</span>
                {h.detalle && <span className={cn("block text-xs", h.hecho ? "text-muted-foreground" : "italic text-muted-foreground/80")}>{h.detalle}</span>}
              </>
            );
            return (
              <li key={h.clave} className="relative pb-4 last:pb-0">
                {h.href ? (
                  <Link href={h.href} className="block rounded-md hover:bg-accent">
                    {cuerpo}
                  </Link>
                ) : (
                  cuerpo
                )}
              </li>
            );
          })}
        </ol>
      </SeccionPanel>
    </div>
  );
}
