import Link from "@/components/enlace";
import { ClipboardCheck, FileText, PhoneForwarded, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { etiquetaTipoServicio } from "@/lib/postventa";
import {
  ETIQUETA_ESTADO_APERTURA,
  MOTIVO_APERTURA,
  estadoApertura,
  numeroInforme,
  type TipoApertura,
} from "@/lib/aperturas-llamada";
import { fechaHoraLima } from "@/lib/fechas";
import { AperturaLlamadaBoton } from "@/components/crm/apertura-llamada-boton";
import { cn } from "@/lib/utils";

type Numerado = { correlativo: number | null; anio: number | null; es_prueba: boolean | null };

type Renglon = {
  clave: string;
  fecha: string | null;
  icono: "prueba" | "llamada" | "informe" | "despacho";
  titulo: string;
  numero: string | null;
  detalle: string | null;
  href: string | null;
  /** Enlaces al costado: la hoja para el cliente, el informe numerado. */
  extras: { texto: string; href: string }[];
  apagado?: boolean;
};

const ICONO = { prueba: ClipboardCheck, llamada: PhoneForwarded, informe: FileText, despacho: Truck };

/**
 * TODOS LOS INFORMES DEL PEDIDO, EN UN SOLO LUGAR (reunión 28-09 14:18).
 *
 * Carlos, con el pedido abierto: «ahí está el informe de puesta en marcha.
 * ¿Dónde están los informes? ¿Están todos los informes? De puesta en marcha,
 * de preinstalación… ¿dónde está el informe de prueba y embalaje? … que tenga
 * todos los informes, y cuando le dé clic, abra el informe de detalle… no vas
 * a depender del almacén».
 *
 * Junta lo que hasta hoy estaba desperdigado: el protocolo de prueba y
 * embalaje, la apertura de despacho, cada llamada derivada (preinstalación,
 * puesta en marcha, soporte; también las repetidas y las anuladas) con el
 * número del informe del almacén, y los informes técnicos del pedido. Cada
 * renglón abre su detalle. En orden de fecha, como pasaron.
 */
export async function InformesDelPedido({
  servicio,
  equiposTexto,
}: {
  servicio: {
    id: string;
    cuenta_id?: string | null;
    equipo?: string | null;
    prueba_solicitada_at?: string | null;
    prueba_lista_at?: string | null;
    protocolo_prueba_ref?: string | null;
    preinstalacion_ok_at?: string | null;
    preinstalacion_nota?: string | null;
    apertura_despacho_at?: string | null;
  };
  equiposTexto: string;
}) {
  const supabase = await createClient();
  const [{ data: aperturasData }, { data: casos }, { data: probados }] = await Promise.all([
    supabase
      .from("aperturas_llamada")
      .select(
        "id, tipo, programada_para, solicitada_at, anulada_at, anulada_motivo, enviada_cliente_at, revisada_at, informe_at, tomada_at, informe_cliente, informe_servicio_id, informes_servicio!aperturas_llamada_informe_servicio_id_fkey(correlativo, anio, es_prueba)",
      )
      .eq("servicio_id", servicio.id)
      .order("programada_para"),
    supabase.from("atenciones").select("id").eq("servicio_id", servicio.id).limit(50),
    supabase.from("pedido_equipos").select("prueba_lista_at, protocolo_ref").eq("servicio_id", servicio.id),
  ]);
  const aperturas = (aperturasData ?? []) as unknown as {
    id: string;
    tipo: TipoApertura;
    programada_para: string;
    solicitada_at: string;
    anulada_at: string | null;
    anulada_motivo: string | null;
    enviada_cliente_at: string | null;
    revisada_at: string | null;
    informe_at: string | null;
    tomada_at: string | null;
    informe_cliente: string | null;
    informe_servicio_id: string | null;
    informes_servicio: Numerado | null;
  }[];
  // Los informes técnicos del pedido, de sus casos y de sus llamadas.
  const filtros = [`servicio_id.eq.${servicio.id}`];
  const idsCasos = (casos ?? []).map((c) => c.id as string);
  if (idsCasos.length) filtros.push(`atencion_id.in.(${idsCasos.join(",")})`);
  const idsAperturas = aperturas.map((a) => a.id);
  if (idsAperturas.length) filtros.push(`apertura_id.in.(${idsAperturas.join(",")})`);
  const { data: informesData } = await supabase
    .from("informes_servicio")
    .select("id, correlativo, anio, es_prueba, tipo, modalidad, ejecutado_at, emitido_at, tecnico, apertura_id")
    .or(filtros.join(","))
    .order("ejecutado_at")
    .limit(100);
  const informes = (informesData ?? []) as unknown as (Numerado & {
    id: string;
    tipo: string;
    modalidad: string | null;
    ejecutado_at: string;
    emitido_at: string | null;
    tecnico: string | null;
    apertura_id: string | null;
  })[];
  const informeDeApertura = new Set(aperturas.map((a) => a.informe_servicio_id).filter(Boolean) as string[]);

  const renglones: Renglon[] = [];

  // 1. La prueba y el embalaje (el protocolo del almacén).
  const equiposProbados = (probados ?? []) as { prueba_lista_at: string | null; protocolo_ref: string | null }[];
  const probado = servicio.prueba_lista_at ?? equiposProbados.find((e) => e.prueba_lista_at)?.prueba_lista_at ?? null;
  if (probado || servicio.prueba_solicitada_at) {
    const refs = [...new Set([servicio.protocolo_prueba_ref, ...equiposProbados.map((e) => e.protocolo_ref)].map((r) => r?.trim()).filter(Boolean) as string[])];
    renglones.push({
      clave: "protocolo",
      fecha: probado ?? servicio.prueba_solicitada_at ?? null,
      icono: "prueba",
      titulo: "Prueba y embalaje (protocolo)",
      numero: refs.length ? `N.º ${refs.join(" / ")}` : null,
      detalle: probado ? "Probado y embalado por el almacén" : "Pedida al almacén; todavía no la marca",
      href: `/pedidos/${servicio.id}/protocolo`,
      extras: [],
      apagado: !probado,
    });
  }

  // 2. La apertura de despacho.
  if (servicio.apertura_despacho_at) {
    renglones.push({
      clave: "apertura-despacho",
      fecha: servicio.apertura_despacho_at,
      icono: "despacho",
      titulo: "Apertura de servicio (despacho)",
      numero: null,
      detalle: null,
      href: `/postventa/pedidos/${servicio.id}/apertura`,
      extras: [],
    });
  }

  // 3. Cada llamada derivada, con el informe del almacén que salió de ella.
  for (const a of aperturas) {
    const n = numeroInforme(a.informes_servicio);
    const estado = estadoApertura(a);
    const extras: Renglon["extras"] = [];
    if (a.informe_cliente && a.revisada_at) extras.push({ texto: "Hoja para el cliente", href: `/aperturas/${a.id}/imprimir` });
    if (a.informe_servicio_id) extras.push({ texto: n ? `Informe N.º ${n}` : "Informe del almacén", href: `/postventa/informes/${a.informe_servicio_id}/imprimir` });
    renglones.push({
      clave: `apertura-${a.id}`,
      fecha: a.programada_para,
      icono: "llamada",
      titulo: `Llamada de ${MOTIVO_APERTURA[a.tipo]?.toLowerCase() ?? "soporte"}`,
      numero: n ? `N.º ${n}` : null,
      detalle: estado === "anulada" ? `Anulada${a.anulada_motivo ? `: ${a.anulada_motivo}` : ""}` : ETIQUETA_ESTADO_APERTURA[estado],
      href: `/aperturas/${a.id}`,
      extras,
      apagado: estado === "anulada",
    });
  }

  // 4. Los informes técnicos que no salieron de una llamada (puesta en marcha
  //    en el local, mantenimiento, el cierre de un caso…).
  for (const i of informes) {
    if (informeDeApertura.has(i.id)) continue;
    const n = numeroInforme(i);
    renglones.push({
      clave: `informe-${i.id}`,
      fecha: i.ejecutado_at,
      icono: "informe",
      titulo: `Informe de ${etiquetaTipoServicio(i.tipo).toLowerCase()}`,
      numero: n ? `N.º ${n}` : "Borrador",
      detalle: [i.modalidad === "videollamada" ? "por videollamada" : i.modalidad === "planta" ? "en planta" : null, i.tecnico, !i.emitido_at ? "sin emitir" : null]
        .filter(Boolean)
        .join(" · ") || null,
      href: `/postventa/informes/${i.id}`,
      extras: [{ texto: "Imprimir", href: `/postventa/informes/${i.id}/imprimir` }],
    });
  }

  // 5. La preinstalación registrada a mano (provincia, o antes de las llamadas).
  const hayPreinstalacionPorLlamada = aperturas.some((a) => a.tipo === "videollamada_preinstalacion" && a.revisada_at);
  if (servicio.preinstalacion_ok_at && !hayPreinstalacionPorLlamada) {
    renglones.push({
      clave: "preinstalacion-manual",
      fecha: servicio.preinstalacion_ok_at,
      icono: "informe",
      titulo: "Preinstalación registrada en el pedido",
      numero: null,
      detalle: servicio.preinstalacion_nota ? servicio.preinstalacion_nota.slice(0, 140) : "Sin llamada derivada: se registró lo que confirmó el cliente",
      href: null,
      extras: [],
    });
  }

  renglones.sort((x, y) => (x.fecha ?? "").localeCompare(y.fecha ?? ""));

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="text-[12px] font-bold uppercase tracking-wide text-foreground">Informes del pedido ({renglones.length})</p>
        {/* Otra llamada sobre el mismo pedido, aunque ya haya una hecha (reunión 28-09). */}
        {servicio.cuenta_id && (
          <AperturaLlamadaBoton
            cuentaId={servicio.cuenta_id}
            servicioId={servicio.id}
            equipos={equiposTexto || (servicio.equipo ?? "")}
            tipo="soporte_videollamada"
            etiqueta="Derivar otra llamada"
            compacto
          />
        )}
      </div>
      {renglones.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground">
          Todavía no hay informes: el protocolo de prueba, las llamadas derivadas y los informes técnicos de este pedido van a aparecer acá.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {renglones.map((r) => {
            const Icono = ICONO[r.icono];
            const cuerpo = (
              <>
                <Icono className="mt-0.5 size-4 flex-none text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-foreground">
                    {r.titulo}
                    {r.numero && <span className="ml-1 font-mono text-xs text-primary">{r.numero}</span>}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {r.fecha ? fechaHoraLima(r.fecha) : ""}
                    {r.detalle ? `${r.fecha ? " · " : ""}${r.detalle}` : ""}
                  </span>
                </span>
              </>
            );
            return (
              <li key={r.clave} className={cn("px-4 py-2.5", r.apagado && "opacity-60")}>
                {r.href ? (
                  <Link href={r.href} prefetch={false} className="-mx-2 flex items-start gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent">
                    {cuerpo}
                  </Link>
                ) : (
                  <div className="flex items-start gap-2 py-1">{cuerpo}</div>
                )}
                {r.extras.length > 0 && (
                  <span className="ml-6 flex flex-wrap gap-x-3 gap-y-0.5">
                    {r.extras.map((e) => (
                      <Link key={e.href} href={e.href} prefetch={false} className="text-[11px] font-medium text-primary hover:underline">
                        {e.texto} →
                      </Link>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
