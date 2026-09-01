"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Wrench } from "lucide-react";
import { programarAtencion } from "@/lib/acciones/atenciones";
import { crearTarea } from "@/lib/acciones/tareas";
import { SelectorHora } from "@/components/crm/selector-hora";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fechaCalendarioLarga } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export interface AtencionPorProgramar {
  id: string;
  cliente: string;
  tipo: string;
  detalle: string | null;
}

/**
 * Agendar algo en un día del calendario del área.
 *
 * POR QUÉ EXISTE. El calendario de postventa nació de una pregunta de Carlos
 * —«¿en postventa no tenemos agenda?… ¿dónde genero mi agenda?»— y se construyó
 * de SOLO LECTURA: mostraba lo que ya estaba programado en otra parte. El 31-08
 * Hever avisó que no podía ponerse nada, y Santos lo verificó mirando la
 * semana: «no veo que se pueda agendar nada el martes ni miércoles ni otros
 * días que vienen». Tenían razón — no había dónde hacer clic.
 *
 * QUÉ SE AGENDA ACÁ, que son las dos cosas reales del área:
 *   · una ATENCIÓN que está esperando fecha (etapa Diagnóstico): se le pone
 *     hora y técnico y entra al calendario. Es el paso de Planificación, hecho
 *     desde el día en vez de desde la ficha — la misma acción, otra puerta.
 *   · una TAREA propia sin cliente: «pedir el repuesto», «llamar al proveedor».
 *
 * No se inventa un «evento suelto»: un evento que no es ni una atención ni una
 * tarea no lo mira nadie después, y el calendario se vuelve un pizarrón.
 */
export function AgendarEnDia({
  fecha,
  porProgramar,
  compacto = false,
}: {
  fecha: string;
  porProgramar: AtencionPorProgramar[];
  /** En la grilla del mes el botón es un «+» y nada más: no hay lugar. */
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [elegida, setElegida] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>("09:00");
  const [tecnico, setTecnico] = useState("");
  const [titulo, setTitulo] = useState("");
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  function cerrar() {
    setAbierto(false);
    setElegida(null);
    setTitulo("");
    setTecnico("");
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAbierto(true);
        }}
        aria-label={`Agendar algo el ${fecha}`}
        title="Agendar algo este día"
        className={cn(
          "cursor-pointer rounded-md border border-dashed border-border text-muted-foreground/70 transition-colors hover:border-primary hover:bg-accent hover:text-primary",
          compacto
            ? "flex w-full items-center justify-center py-0.5 text-[11px]"
            : "mt-1 flex w-full items-center justify-center gap-1 py-1 text-[11px] font-medium",
        )}
      >
        <Plus className="size-3" />
        {!compacto && "Agendar"}
      </button>

      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="capitalize">Agendar el {fechaCalendarioLarga(fecha)}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* ── Programar una atención que espera fecha ─────────────── */}
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Atenciones esperando fecha ({porProgramar.length})
              </p>
              {porProgramar.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay ninguna atención diagnosticada esperando que le pongan día. Aparecen acá apenas se
                  diagnostican.
                </p>
              ) : (
                <>
                  <ul className="max-h-40 space-y-1 overflow-y-auto">
                    {porProgramar.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setElegida(a.id === elegida ? null : a.id)}
                          className={cn(
                            "w-full cursor-pointer rounded-md border p-2 text-left text-xs transition-colors",
                            elegida === a.id
                              ? "border-primary bg-primary/10"
                              : "border-border hover:bg-accent",
                          )}
                        >
                          <b className="text-foreground">{a.cliente}</b>
                          <span className="block text-muted-foreground">
                            {a.tipo}
                            {a.detalle ? ` · ${a.detalle.slice(0, 70)}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {elegida && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                      <SelectorHora valor={hora} onCambiar={setHora} />
                      <input
                        value={tecnico}
                        onChange={(e) => setTecnico(e.target.value)}
                        placeholder="Qué técnico va"
                        className="h-9 min-w-[150px] flex-1 rounded-md border border-input bg-background px-3 text-sm"
                      />
                      <Button
                        size="sm"
                        disabled={enviando || !tecnico.trim()}
                        onClick={() =>
                          empezar(async () => {
                            const r = await programarAtencion({
                              atencionId: elegida,
                              fecha,
                              hora,
                              tecnico,
                            });
                            if (r.error) {
                              toast.error(r.error);
                              return;
                            }
                            toast.success("Atención programada. Ya está en el calendario.");
                            cerrar();
                            router.refresh();
                          })
                        }
                      >
                        <Wrench className="size-3.5" /> Programar
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── O una tarea propia ──────────────────────────────────── */}
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                …o una tarea propia, sin cliente
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="ej. Pedir el repuesto de la Titan Max"
                  className="h-9 min-w-[200px] flex-1 rounded-md border border-input bg-background px-3 text-sm"
                />
                <SelectorHora valor={hora} onCambiar={setHora} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={enviando || !titulo.trim()}
                  onClick={() =>
                    empezar(async () => {
                      const r = await crearTarea({ titulo, fecha, hora });
                      if (r.error) {
                        toast.error(r.error);
                        return;
                      }
                      toast.success("Tarea agregada a su agenda.");
                      cerrar();
                      router.refresh();
                    })
                  }
                >
                  Agregar tarea
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                La tarea queda en este mismo calendario, en su día, marcada como «Personal».
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
