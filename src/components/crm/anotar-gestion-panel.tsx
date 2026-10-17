"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { toast } from "sonner";
import { ArrowRight, Loader2, NotebookPen, X } from "lucide-react";
import Link from "@/components/enlace";
import { abrirSeguimiento } from "@/lib/acciones/casos";
import { abrirSeguimientoComercial } from "@/lib/acciones/oportunidades";
import { RegistroRapido, type MotivoRechazo, type ResultadoGestion } from "@/components/crm/registro-rapido";
import { cn } from "@/lib/utils";

/**
 * «ANOTAR GESTIÓN» SIN SALIR DE LA FICHA (17-10, Ariana PV3).
 *
 * «Registrar seguimiento» llevaba al expediente: otra pantalla, otra cabecera,
 * y la vuelta era un enlace chico. Para quien atiende, la ficha y el
 * expediente son lo mismo —el cliente—, así que el salto se leía como «la
 * ficha no muestra todo, hay que apretar para que aparezca el resto».
 *
 * Ahora el formulario de siempre se abre en un panel sobre la ficha. A qué
 * expediente va lo sigue decidiendo la base (expediente_para_seguimiento /
 * expediente_comercial_para_seguimiento), igual que el botón de antes: se
 * dice arriba del panel, con el enlace para abrirlo si se quiere el detalle.
 */
export function AnotarGestionPanel({
  cuentaId,
  comercial = false,
  esPostventa = false,
  resultados,
  motivos,
  expedientes,
}: {
  cuentaId: string;
  /** El comercial dueño de la cartera: anota en SU expediente comercial (0281). */
  comercial?: boolean;
  esPostventa?: boolean;
  resultados: ResultadoGestion[];
  motivos: MotivoRechazo[];
  /** Los expedientes vivos, para decir en cuál cae la gestión. */
  expedientes: { id: string; etiqueta: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [oportunidadId, setOportunidadId] = useState<string | null>(null);
  const [buscando, empezar] = useTransition();

  function abrir() {
    empezar(async () => {
      const r = comercial ? await abrirSeguimientoComercial(cuentaId) : await abrirSeguimiento(cuentaId);
      if (r.error || !r.oportunidadId) {
        toast.error(r.error ?? "No se pudo abrir el expediente", { duration: 8000 });
        return;
      }
      setOportunidadId(r.oportunidadId);
      setAbierto(true);
    });
  }

  const destino = expedientes.find((e) => e.id === oportunidadId);

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        disabled={buscando}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
        title="Anotar una llamada, un WhatsApp o lo que se coordinó, sin salir de la ficha"
      >
        {buscando ? <Loader2 className="size-4 animate-spin" /> : <NotebookPen className="size-4" />}
        Anotar gestión
      </button>

      <DialogPrimitive.Root open={abierto} onOpenChange={setAbierto}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/20 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <DialogPrimitive.Popup
            className={cn(
              "fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-background text-sm shadow-2xl outline-none ring-1 ring-foreground/10",
              "data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right",
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-base font-bold text-foreground">Anotar gestión</DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                  Se guarda en {destino ? <b className="text-foreground">{destino.etiqueta}</b> : "el expediente de seguimiento de este cliente"}.
                  {oportunidadId && (
                    <>
                      {" "}
                      <Link href={`/comercial/oportunidades/${oportunidadId}`} className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
                        Abrir el expediente <ArrowRight className="size-3" />
                      </Link>
                    </>
                  )}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Cerrar">
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {oportunidadId && (
                <RegistroRapido
                  key={oportunidadId}
                  oportunidadId={oportunidadId}
                  resultados={resultados}
                  motivos={motivos}
                  esPostventa={esPostventa}
                  alRegistrar={() => {
                    setAbierto(false);
                    router.refresh();
                  }}
                />
              )}
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
