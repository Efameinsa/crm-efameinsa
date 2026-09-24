"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, Printer } from "lucide-react";
import { cancelarVisitaPlanta, marcarVisita, marcarVisitaImpresa } from "@/lib/acciones/visitas-planta";
import { CircuitoVisita, CerrarVisitaBoton, ETIQUETA_RESULTADO } from "@/components/crm/circuito-visita";
import { cn } from "@/lib/utils";

export interface VisitaFila {
  id: string;
  empresa: string;
  ruc: string | null;
  persona: string;
  dni: string | null;
  telefono: string | null;
  motivo: string;
  fecha: string;
  hora: string | null;
  registrado_at: string;
  impreso_at: string | null;
  cancelada_at: string | null;
  cancelada_motivo: string | null;
  cuenta_id: string | null;
  showroom?: boolean;
  prender_tv?: boolean;
  infocorp?: boolean;
  cotizacion_ref?: string | null;
  acompanantes?: { nombre: string; dni?: string | null }[] | null;
  equipo_a_ver?: string | null;
  quitar_film?: boolean;
  infocorp_enviado_at?: string | null;
  showroom_listo_at?: string | null;
  film_retirado_at?: string | null;
  tv_listo_at?: string | null;
  llego_at?: string | null;
  no_vino_at?: string | null;
  reembalado_at?: string | null;
  notas_central?: string | null;
  /** El cierre (0256): quién la atendió, cómo terminó. */
  atendida_at?: string | null;
  resultado?: string | null;
  resultado_nota?: string | null;
  cerrada_at?: string | null;
  registradoPor: string;
}

/** Quién ve la lista: Central la gestiona entera; el almacén marca lo suyo; el comercial cierra las suyas; el resto la mira. */
export type ModoVisitas = "central" | "almacen" | "lectura" | "comercial";

const fechaLarga = (iso: string) =>
  new Date(iso + "T12:00:00-05:00").toLocaleDateString("es-PE", { timeZone: "America/Lima", weekday: "long", day: "2-digit", month: "long" });
const hora = (h: string | null) => (h ? h.slice(0, 5) : "sin hora");
const horaDe = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }) : "";

/**
 * La lista de visitas y su lista de checks (0238, 0247).
 *
 * Es el capítulo 1 de la inducción de Catherine puesto en pantalla: el
 * comercial manda quién viene, y «luego se encarga Central»: vigilancia
 * avisada, Infocorp devuelto, lavandería abierta, film retirado, TV listo,
 * llegó (y el CRM le avisa al comercial: «baje a recibirlo»), y después de la
 * visita, que vuelvan a embalar. Cada check dice quién lo marcó y a qué hora.
 */
export function ListaVisitasPlanta({
  visitas,
  hoy,
  pasadas = false,
  modo = "lectura",
}: {
  visitas: VisitaFila[];
  hoy: string;
  pasadas?: boolean;
  modo?: ModoVisitas;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [imprimiendo, setImprimiendo] = useState<VisitaFila | null>(null);

  if (visitas.length === 0) {
    return (
      <p className="vacio-visitas text-sm text-muted-foreground">
        {modo === "comercial"
          ? "No tiene visitas anunciadas. Se anuncian desde la ficha del cliente, con el botón «Viene a la planta»: nombre y DNI de cada persona, fecha, hora y motivo."
          : "No hay visitas registradas para hoy ni para los próximos días. Se registran desde la ficha del cliente («Viene a la planta») por comerciales y postventa."}
      </p>
    );
  }

  function imprimir(v: VisitaFila) {
    setImprimiendo(v);
    setTimeout(() => {
      window.print();
      startTransition(async () => {
        const r = await marcarVisitaImpresa(v.id);
        if (r.error) toast.error(r.error);
        else router.refresh();
      });
    }, 150);
  }

  function marcar(v: VisitaFila, que: string, puesto: boolean) {
    startTransition(async () => {
      const r = await marcarVisita(v.id, que, puesto);
      if (r.error) toast.error(r.error, { duration: 8000 });
      else router.refresh();
    });
  }

  function cancelar(v: VisitaFila) {
    const motivo = window.prompt(`¿Por qué se cancela la visita de ${v.persona} (${v.empresa})?`);
    if (motivo == null) return;
    startTransition(async () => {
      const r = await cancelarVisitaPlanta(v.id, motivo);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Visita cancelada");
        router.refresh();
      }
    });
  }

  // Qué checks ve cada quien. Los que no le tocan salen apagados, para que
  // sepa en qué va la visita sin poder tocarlos.
  const checks = (v: VisitaFila): { clave: string; texto: string; hecho: string | null | undefined; mio: boolean; pedido: boolean }[] => [
    { clave: "impreso", texto: "Vigilancia avisada", hecho: v.impreso_at, mio: modo === "central", pedido: true },
    { clave: "infocorp", texto: "Infocorp enviado", hecho: v.infocorp_enviado_at, mio: modo === "central", pedido: Boolean(v.infocorp) },
    { clave: "showroom", texto: "Lavandería abierta", hecho: v.showroom_listo_at, mio: modo === "central" || modo === "almacen", pedido: Boolean(v.showroom) },
    { clave: "film", texto: `Film retirado${v.equipo_a_ver ? ` · ${v.equipo_a_ver}` : ""}`, hecho: v.film_retirado_at, mio: modo === "central" || modo === "almacen", pedido: Boolean(v.quitar_film) },
    { clave: "tv", texto: "TV listo", hecho: v.tv_listo_at, mio: modo === "central" || modo === "almacen", pedido: Boolean(v.prender_tv) },
    { clave: "llego", texto: "Llegó", hecho: v.llego_at, mio: modo === "central", pedido: true },
    { clave: "reembalado", texto: "Vuelto a embalar", hecho: v.reembalado_at, mio: modo === "central" || modo === "almacen", pedido: Boolean(v.quitar_film || v.showroom) },
  ];

  return (
    <>
      <ul className="divide-y divide-border">
        {visitas.map((v) => {
          const esHoy = v.fecha === hoy;
          const lista = checks(v).filter((c) => c.pedido);
          const acomp = v.acompanantes ?? [];
          return (
            <li key={v.id} className={cn("py-3", v.cancelada_at && "opacity-60")}>
              <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                <div className="w-40 flex-none">
                  <p className={cn("text-sm font-semibold capitalize", esHoy ? "text-primary" : "text-foreground")}>
                    {esHoy ? "Hoy" : fechaLarga(v.fecha)}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">{hora(v.hora)}</p>
                  {v.llego_at && <p className="text-[11px] font-semibold text-[#1E7F4F]">Llegó {horaDe(v.llego_at)}</p>}
                  {v.no_vino_at && <p className="text-[11px] font-semibold text-destructive">No vino</p>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {v.persona}
                    {v.dni && <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">DNI {v.dni}</span>}
                    {acomp.length > 0 && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        + {acomp.map((a) => `${a.nombre}${a.dni ? ` (DNI ${a.dni})` : ""}`).join(", ")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-foreground">
                    {v.empresa}
                    {v.ruc && <span className="ml-1 text-muted-foreground">· RUC {v.ruc}</span>}
                    {v.telefono && <span className="ml-1 text-muted-foreground">· {v.telefono}</span>}
                    {v.cotizacion_ref && <span className="ml-1 text-muted-foreground">· cot. {v.cotizacion_ref}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {v.motivo}
                    {v.equipo_a_ver && <span className="ml-1 font-medium text-foreground">· viene a ver: {v.equipo_a_ver}</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Registró {v.registradoPor}
                    {v.cancelada_at && ` · CANCELADA${v.cancelada_motivo ? `: ${v.cancelada_motivo}` : ""}`}
                  </p>
                  {/* El circuito entero, de un vistazo (0256). */}
                  {!v.cancelada_at && (
                    <div className="mt-1.5">
                      <CircuitoVisita visita={v} compacto />
                    </div>
                  )}
                  {v.resultado && (
                    <p className="mt-1 text-xs">
                      <span className="font-semibold text-[#1E7F4F]">Resultado: {ETIQUETA_RESULTADO[v.resultado] ?? v.resultado}</span>
                      {v.resultado_nota && <span className="text-muted-foreground"> — {v.resultado_nota}</span>}
                    </p>
                  )}
                  {!v.cancelada_at && !v.cerrada_at && (modo === "comercial" || modo === "central" || modo === "lectura") && (v.llego_at || v.fecha <= hoy) && (
                    <div className="mt-1.5">
                      <CerrarVisitaBoton visita={v} compacto />
                    </div>
                  )}
                  {!v.cancelada_at && modo !== "comercial" && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {lista.map((c) => (
                        <button
                          key={c.clave}
                          type="button"
                          disabled={pendiente || !c.mio || pasadas}
                          onClick={() => marcar(v, c.clave, !c.hecho)}
                          title={c.hecho ? `Marcado ${horaDe(c.hecho)}` : c.mio ? "Marcar" : "Lo marca otra área"}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                            c.hecho
                              ? "border-[#1E7F4F]/30 bg-[#1E7F4F]/10 text-[#1E7F4F]"
                              : c.mio && !pasadas
                                ? "border-border text-muted-foreground hover:border-primary hover:text-primary"
                                : "cursor-default border-dashed border-border text-muted-foreground/70",
                          )}
                        >
                          {c.hecho ? <Check className="size-3" /> : <span className="text-[13px] leading-none">○</span>}
                          {c.texto}
                        </button>
                      ))}
                      {modo === "central" && !pasadas && !v.llego_at && !v.no_vino_at && (
                        <button
                          type="button"
                          disabled={pendiente}
                          onClick={() => marcar(v, "no_vino", true)}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-destructive hover:text-destructive"
                        >
                          No vino
                        </button>
                      )}
                    </div>
                  )}
                  {v.notas_central && <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{v.notas_central}</p>}
                </div>
                {!v.cancelada_at && !pasadas && modo === "central" && (
                  <div className="flex flex-none items-center gap-1.5">
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => imprimir(v)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                        v.impreso_at ? "border-[#1E7F4F]/30 bg-[#1E7F4F]/10 text-[#1E7F4F]" : "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                      )}
                    >
                      {v.impreso_at ? <Check className="size-3.5" /> : <Printer className="size-3.5" />}
                      {v.impreso_at ? "Volver a imprimir" : "Imprimir para vigilancia"}
                    </button>
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => cancelar(v)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <Ban className="size-3.5" /> Cancelar
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* La hoja para la puerta. Solo se ve al imprimir. */}
      {imprimiendo && (
        <div className="hoja-visita">
          <h1>EFAMEINSA · Autorización de ingreso a planta</h1>
          <table>
            <tbody>
              <tr><th>Fecha</th><td className="capitalize">{fechaLarga(imprimiendo.fecha)} · {hora(imprimiendo.hora)}</td></tr>
              <tr><th>Empresa</th><td>{imprimiendo.empresa}{imprimiendo.ruc ? ` · RUC ${imprimiendo.ruc}` : ""}</td></tr>
              <tr><th>Persona</th><td>{imprimiendo.persona}{imprimiendo.dni ? ` · DNI ${imprimiendo.dni}` : ""}</td></tr>
              {(imprimiendo.acompanantes ?? []).map((a, i) => (
                <tr key={i}><th>Acompañante</th><td>{a.nombre}{a.dni ? ` · DNI ${a.dni}` : ""}</td></tr>
              ))}
              {imprimiendo.telefono && <tr><th>Teléfono</th><td>{imprimiendo.telefono}</td></tr>}
              {imprimiendo.cotizacion_ref && <tr><th>N° cotización</th><td>{imprimiendo.cotizacion_ref}</td></tr>}
              <tr><th>Motivo</th><td>{imprimiendo.motivo}{imprimiendo.equipo_a_ver ? ` · Viene a ver: ${imprimiendo.equipo_a_ver}` : ""}{imprimiendo.showroom ? " · Abrir lavandería (showroom)" : ""}{imprimiendo.prender_tv ? " · Prender TV" : ""}</td></tr>
              <tr><th>Registró</th><td>{imprimiendo.registradoPor}</td></tr>
            </tbody>
          </table>
          <p className="firma">Vigilancia: ______________________ &nbsp;&nbsp; Hora de ingreso: ________ &nbsp;&nbsp; Hora de salida: ________</p>
        </div>
      )}
      <style>{`
        .hoja-visita { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          .hoja-visita, .hoja-visita * { visibility: visible !important; }
          .hoja-visita { display: block; position: fixed; inset: 0; padding: 24mm 18mm; background: #fff; color: #000; font: 13pt/1.5 Arial, sans-serif; }
          .hoja-visita h1 { font-size: 16pt; margin: 0 0 14pt; border-bottom: 2px solid #8B1510; padding-bottom: 6pt; }
          .hoja-visita table { border-collapse: collapse; width: 100%; }
          .hoja-visita th { text-align: left; width: 28%; padding: 6pt 8pt; border: 1px solid #999; background: #f2f2f2; }
          .hoja-visita td { padding: 6pt 8pt; border: 1px solid #999; }
          .hoja-visita .firma { margin-top: 32pt; font-size: 11pt; }
        }
      `}</style>
    </>
  );
}
