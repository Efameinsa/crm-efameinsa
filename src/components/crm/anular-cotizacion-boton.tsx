"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, Hash, KeyRound, TriangleAlert } from "lucide-react";
import { anularCotizacion, frenosDeAnulacion, type FrenosAnulacion } from "@/lib/acciones/anular-cotizacion";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Lo mismo que exige la base (`anular_cotizacion`, 0433), anunciado antes. */
const MINIMO_MOTIVO = 15;

/**
 * Anular una cotización que ya salió con número.
 *
 * POR QUÉ (10-10, Rubí con la Presu_1118-26): salió con fallas y preguntó si se
 * podía eliminar. No se elimina —el número ya se gastó y gerencia decidió el
 * 03-09 que los números no se borran ni se rellenan— y tampoco se ignora,
 * porque seguiría viva en los reportes. Se anula: queda en la lista y en
 * Central presupuestos, en rojo, con el motivo.
 *
 * El mismo orden que corregir: primero qué la frena (venta o cierre), después
 * el motivo —lo que se le lee a quien autoriza— y al final el código.
 */
export function AnularCotizacionBoton({ cotizacionId, codigo }: { cotizacionId: string; codigo: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [frenos, setFrenos] = useState<FrenosAnulacion | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  function alAbrir(v: boolean) {
    setAbierto(v);
    if (v) {
      setMotivo("");
      setPin("");
      setFrenos(null);
      empezar(async () => setFrenos(await frenosDeAnulacion(cotizacionId)));
    }
  }

  function confirmar() {
    empezar(async () => {
      const r = await anularCotizacion({ cotizacionId, motivo, pin });
      if (r.error) {
        toast.error(r.error);
        setPin("");
        return;
      }
      toast.success(`${r.codigo ?? "La cotización"} quedó anulada. Autorizó ${r.autorizo}.`);
      setAbierto(false);
      router.refresh();
    });
  }

  const puede = frenos?.puede === true;
  const largoMotivo = motivo.trim().length;
  const motivoOk = largoMotivo >= MINIMO_MOTIVO;
  const listo = puede && pin.length === 4 && motivoOk;

  return (
    <Dialog open={abierto} onOpenChange={alAbrir}>
      <DialogTrigger
        render={
          <button type="button" className="inline-flex items-center gap-1 text-destructive/80 hover:underline">
            <Ban className="size-3" />
            Anular
          </button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Ban className="size-4" />
            </span>
            Anular la cotización
            {codigo && (
              <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-sm font-bold text-foreground">
                {codigo}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {frenos === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Comprobando si se puede anular…</p>
        ) : !puede ? (
          <>
            <div className="flex items-start gap-2 rounded-md border-2 border-amber-400 bg-amber-50 p-3 text-sm leading-snug text-amber-900">
              <TriangleAlert className="mt-0.5 size-4 flex-none" />
              <span>{frenos.motivo}</span>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAbierto(false)}>
                Entendido
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
                <Hash className="mt-0.5 size-4 flex-none text-destructive" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <b className="text-foreground">El número no se borra ni se vuelve a usar.</b> La cotización queda a la
                  vista como <b className="text-destructive">Anulada</b>, con el motivo, y deja de contar en los reportes.
                  Si hay que cotizar de nuevo, se hace una nueva. Si el cliente ya la tiene y solo hay que arreglarla
                  conservando el número, use «Corregir».
                </p>
              </div>

              <Paso numero={1} titulo="¿Por qué se anula?">
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Ej.: salió con la descripción del repuesto repetida; se rehízo como cotización nueva."
                  className={cn(
                    "w-full resize-y rounded-lg border-2 bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70",
                    motivoOk ? "border-emerald-400/60 focus:border-emerald-500" : "border-input focus:border-primary",
                  )}
                />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-xs leading-snug text-muted-foreground">
                    Es lo que le va a leer a operaciones para pedirle el código, y lo que queda en el registro.
                  </span>
                  <span
                    className={cn(
                      "flex-none text-xs font-semibold tabular-nums",
                      motivoOk ? "text-emerald-700" : "text-muted-foreground",
                    )}
                  >
                    {motivoOk ? (
                      <>
                        <Check className="mr-0.5 inline size-3.5" />
                        {largoMotivo} caracteres
                      </>
                    ) : (
                      `${largoMotivo} de ${MINIMO_MOTIVO} caracteres mínimos`
                    )}
                  </span>
                </div>
              </Paso>

              <Paso numero={2} titulo="Código de autorización" icono={KeyRound}>
                <CampoCodigo valor={pin} onChange={setPin} />
                <p className="text-xs leading-snug text-muted-foreground">
                  Pídaselo a <b className="text-foreground">operaciones o a gerencia</b>: lo tienen en su pantalla y sirve
                  para esta anulación.
                </p>
              </Paso>
            </div>

            <DialogFooter className="items-center gap-2">
              <span className="text-xs text-muted-foreground sm:mr-auto">
                {largoMotivo === 0
                  ? `Escriba por qué se anula: mínimo ${MINIMO_MOTIVO} caracteres`
                  : !motivoOk
                    ? `Faltan ${MINIMO_MOTIVO - largoMotivo} caracteres del motivo`
                    : pin.length < 4
                      ? "Falta el código de cuatro dígitos"
                      : "Listo para anular"}
              </span>
              <span className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setAbierto(false)} disabled={enviando}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={confirmar} disabled={enviando || !listo}>
                  {enviando ? "Anulando…" : "Anular cotización"}
                </Button>
              </span>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Paso({
  numero,
  titulo,
  icono: Icono,
  children,
}: {
  numero: number;
  titulo: string;
  icono?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", Icono && "rounded-xl border-2 border-destructive/25 bg-destructive/5 p-3")}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-foreground">
        <span
          className={cn(
            "flex size-5 flex-none items-center justify-center rounded-full text-[11px] font-black",
            Icono ? "bg-destructive text-white" : "bg-secondary text-muted-foreground",
          )}
        >
          {numero}
        </span>
        {Icono && <Icono className="size-3.5 text-destructive" />}
        {titulo}
      </p>
      {children}
    </div>
  );
}
