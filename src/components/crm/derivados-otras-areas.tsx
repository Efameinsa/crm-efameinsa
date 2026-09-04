"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { devolverLeadAComercial } from "@/lib/acciones/leads";
import { Button } from "@/components/ui/button";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { SolicitudLead } from "@/components/crm/solicitud-lead";
import { fechaHoraLima } from "@/lib/fechas";

// Contactos que Central mandó a otra área (servicio técnico, RR. HH.,
// proveedores…).
//
// ⚠️ POR QUÉ EXISTE ESTA PANTALLA. El estado 'derivado_area' se escribía desde
// la primera versión, pero NINGUNA pantalla lo leía. O sea que elegir un área
// distinta de "Comercial" hacía desaparecer el contacto: salía de la bandeja de
// triaje y no había dónde volver a verlo.
//
// El 24-08 pasó de verdad: un prospecto que pedía cotización de equipos de
// lavandería para un autoservicio se registró con área "Otros" y se perdió.
// Central preguntó «¿cuántos minutos se demora para ingreso?» — entraba al
// instante, pero no se veía en ningún lado, así que parecía que no entraba.
//
// Ahora se ven, y si el área quedó mal elegida se devuelven a la cola con un
// clic. Lo que de verdad es de otra área se queda acá como registro: la
// central recibe TODO contacto entrante, no solo los de venta.

const ETIQUETA_AREA: Record<string, string> = {
  servicio_tecnico: "Servicio técnico",
  postventa: "Postventa",
  rrhh: "RR. HH.",
  proveedores: "Proveedores",
  administracion: "Administración",
  finanzas: "Finanzas y Tesorería",
  otros: "Otros",
};

export interface LeadDerivado {
  id: string;
  codigo: string | null;
  canal: string;
  area_destino: string;
  nombre_contacto: string | null;
  razon_social: string | null;
  mensaje: string | null;
  recibido_at: string;
  /**
   * A dónde fue de verdad el aviso (0168). El contacto guarda UN área, pero un
   * aviso puede haber ido a tres: Central miraba esta lista, veía «Finanzas y
   * Tesorería» y concluía que a postventa y al comercial no les había llegado
   * nada (reportado el 04-09 con capturas). Nulo en los avisos anteriores al
   * registro, que es lo mismo que decir «de esos no se guardó el detalle».
   */
  destinos?: { finanzas: boolean; postventa: boolean; comercial: boolean } | null;
}

export function DerivadosOtrasAreas({ leads }: { leads: LeadDerivado[] }) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();

  function devolver(id: string) {
    startTransition(async () => {
      const r = await devolverLeadAComercial(id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Devuelto a la bandeja de triaje comercial");
      router.refresh();
    });
  }

  return (
    <SeccionPanel
      titulo="Derivados a otras áreas"
      accion={
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
          {leads.length}
        </span>
      }
    >
      {leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay contactos derivados a otras áreas. Los que registre como servicio técnico, RR. HH. o proveedores
          aparecerán acá.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Estos contactos no están en la cola comercial. Si alguno era una consulta de venta, devuélvalo.
          </p>
          {leads.map((l) => (
            <div key={l.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-semibold text-foreground">{l.nombre_contacto ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.razon_social ?? "Sin razón social"} ·{" "}
                    <b className="text-foreground">
                      {l.destinos
                        ? [
                            l.destinos.finanzas ? "Finanzas" : null,
                            l.destinos.postventa ? "postventa" : null,
                            l.destinos.comercial ? "el comercial" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : (ETIQUETA_AREA[l.area_destino] ?? l.area_destino)}
                    </b>
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono">{l.codigo}</span>
                  <br />
                  {fechaHoraLima(l.recibido_at)}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={enviando}
                  onClick={() => devolver(l.id)}
                  className="ml-auto"
                >
                  <Undo2 className="size-3.5" />
                  Devolver a comercial
                </Button>
              </div>
              <SolicitudLead mensaje={l.mensaje} />
            </div>
          ))}
        </div>
      )}
    </SeccionPanel>
  );
}
