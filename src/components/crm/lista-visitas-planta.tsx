"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, Printer } from "lucide-react";
import { cancelarVisitaPlanta, marcarVisitaImpresa } from "@/lib/acciones/visitas-planta";
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
  registradoPor: string;
}

const fechaLarga = (iso: string) =>
  new Date(iso + "T12:00:00-05:00").toLocaleDateString("es-PE", { timeZone: "America/Lima", weekday: "long", day: "2-digit", month: "long" });
const hora = (h: string | null) => (h ? h.slice(0, 5) : "sin hora");

/**
 * La lista de visitas de Central, y la hoja para vigilancia (0238).
 *
 * «Imprimir para vigilancia» abre la hoja de esa visita —empresa, RUC, quién,
 * DNI, motivo, día y hora, quién la registró— con el diálogo de impresión del
 * navegador, y deja marcado que ya se imprimió: la siguiente vez que alguien
 * mire la lista sabe que la puerta ya lo tiene.
 */
export function ListaVisitasPlanta({ visitas, hoy, pasadas = false }: { visitas: VisitaFila[]; hoy: string; pasadas?: boolean }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [imprimiendo, setImprimiendo] = useState<VisitaFila | null>(null);

  if (visitas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay visitas registradas para hoy ni para los próximos días. Se registran desde la ficha del cliente
        («Viene a la planta») por comerciales y postventa.
      </p>
    );
  }

  function imprimir(v: VisitaFila) {
    setImprimiendo(v);
    // La hoja se pinta en un bloque que solo existe al imprimir (ver CSS abajo).
    setTimeout(() => {
      window.print();
      startTransition(async () => {
        const r = await marcarVisitaImpresa(v.id);
        if (r.error) toast.error(r.error);
        else router.refresh();
      });
    }, 150);
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

  return (
    <>
      <ul className="divide-y divide-border">
        {visitas.map((v) => {
          const esHoy = v.fecha === hoy;
          return (
            <li key={v.id} className={cn("flex flex-wrap items-start gap-x-4 gap-y-1 py-2.5", v.cancelada_at && "opacity-60")}>
              <div className="w-40 flex-none">
                <p className={cn("text-sm font-semibold capitalize", esHoy ? "text-primary" : "text-foreground")}>
                  {esHoy ? "Hoy" : fechaLarga(v.fecha)}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">{hora(v.hora)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {v.persona}
                  {v.dni && <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">DNI {v.dni}</span>}
                </p>
                <p className="text-xs text-foreground">
                  {v.empresa}
                  {v.ruc && <span className="ml-1 text-muted-foreground">· RUC {v.ruc}</span>}
                  {v.telefono && <span className="ml-1 text-muted-foreground">· {v.telefono}</span>}
                </p>
                <p className="text-xs text-muted-foreground">{v.motivo}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Registró {v.registradoPor}
                  {v.impreso_at &&
                    ` · impreso el ${new Date(v.impreso_at).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}`}
                  {v.cancelada_at && ` · CANCELADA${v.cancelada_motivo ? `: ${v.cancelada_motivo}` : ""}`}
                </p>
              </div>
              {!v.cancelada_at && !pasadas && (
                <div className="flex flex-none items-center gap-1.5">
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => imprimir(v)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                      v.impreso_at
                        ? "border-[#1E7F4F]/30 bg-[#1E7F4F]/10 text-[#1E7F4F]"
                        : "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
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
              {imprimiendo.telefono && <tr><th>Teléfono</th><td>{imprimiendo.telefono}</td></tr>}
              <tr><th>Motivo</th><td>{imprimiendo.motivo}</td></tr>
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
