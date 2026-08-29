"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Hash, KeyRound, PencilLine, TriangleAlert } from "lucide-react";
import { abrirCorreccion, frenosDeCorreccion, type FrenosCorreccion } from "@/lib/acciones/correccion-cotizacion";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Lo mínimo que tiene que decir el motivo, y lo mismo que exige la base
 * (`abrir_correccion_cotizacion`, migración 0123). Está acá para poder
 * anunciarlo antes de escribir, en vez de rebotar el intento después.
 */
const MINIMO_MOTIVO = 15;

/**
 * Pedir corregir una cotización que ya salió con su número.
 *
 * POR QUÉ (ing. Carlos, 28-08): «no puedes variar el número, sobre todo mucho
 * ocurre con el banco, que es leasing… Un número más, se demora un mes más en
 * que salga la operación.» Ocurre 5 a 10 veces al año sobre 3.000 cotizaciones,
 * así que esta pantalla la abre alguien que la usó por última vez hace dos
 * meses: tiene que entenderse sola.
 *
 * TRES COSAS, EN EL ORDEN EN QUE OCURREN DE VERDAD.
 *
 * 1. QUÉ LA FRENA, antes de nada. Si esta cotización ya tiene un cierre de
 *    venta emitido no hay corrección posible —hay que anular el cierre
 *    primero—, y eso se dice ANTES de pedir el código: nadie llama a
 *    operaciones para que le autoricen algo que no se va a poder hacer.
 * 2. EL MOTIVO. Va antes del código a propósito: es lo que el comercial le lee
 *    al supervisor por teléfono para pedírselo. Escribirlo primero es
 *    prepararse la llamada, no llenar un campo.
 * 3. EL CÓDIGO, que abre y no guarda. Dura diez minutos y elegir el equipo
 *    correcto toma más: validarlo acá deja la corrección autorizada media hora
 *    (migración 0123). Una autorización, una corrección.
 */
export function CorregirCotizacionBoton({
  cotizacionId,
  codigo,
  volverHref,
  variante = "boton",
}: {
  cotizacionId: string;
  codigo: string | null;
  /** A dónde vive la cotización: de ahí cuelga la ruta de corrección. */
  volverHref: string;
  /** «boton» en la pantalla de confirmación; «enlace» en las listas. */
  variante?: "boton" | "enlace";
}) {
  const [abierto, setAbierto] = useState(false);
  const [frenos, setFrenos] = useState<FrenosCorreccion | null>(null);
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
      empezar(async () => setFrenos(await frenosDeCorreccion(cotizacionId)));
    }
  }

  function confirmar() {
    empezar(async () => {
      const r = await abrirCorreccion({ cotizacionId, motivo, pin });
      if (r.error) {
        toast.error(r.error);
        setPin("");
        return;
      }
      toast.success(`${r.autorizo} autorizó la corrección. Tiene media hora para guardarla.`);
      setAbierto(false);
      router.push(`${volverHref}/cotizar/${cotizacionId}/corregir`);
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
          variante === "boton" ? (
            <Button variant="outline">
              <PencilLine className="size-4" />
              Corregir esta cotización
            </Button>
          ) : (
            <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:underline">
              <PencilLine className="size-3" />
              Corregir
            </button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PencilLine className="size-4" />
            </span>
            Corregir la cotización
            {codigo && (
              // El número, en el mismo tipo con el que sale impreso: acá se está
              // tocando un documento que el cliente ya tiene en la mano.
              <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-sm font-bold text-foreground">
                {codigo}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {frenos === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Comprobando si se puede corregir…</p>
        ) : !puede ? (
          <>
            {/* No es un error del comercial: es el procedimiento. Se dice qué
                hacer, no solo que no se puede. */}
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
              {/* La regla de la casa, y el motivo por el que esta pantalla
                  existe. Va destacada: es lo primero que hay que entender antes
                  de tocar nada. */}
              <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
                <Hash className="mt-0.5 size-4 flex-none text-primary" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <b className="text-foreground">El número no cambia.</b> El cliente ya la tiene con este número y así
                  va a quedar — por eso existe esta opción y no simplemente duplicarla. La versión de hoy queda
                  archivada entera, por si el banco pregunta qué decía el documento que recibió.
                </p>
              </div>

              <Paso numero={1} titulo="¿Qué está mal?">
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Ej.: el cliente pidió apilable y salió la variante equivocada. Ya está presentada en el banco con este número."
                  className={cn(
                    "w-full resize-y rounded-lg border-2 bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70",
                    motivoOk ? "border-emerald-400/60 focus:border-emerald-500" : "border-input focus:border-primary",
                  )}
                />
                {/* Cuántos caracteres faltan, dicho antes de que el botón se
                    niegue a funcionar (gerencia, 29-08: «debe decir cuántos
                    caracteres debe tener la razón por la que se corrige»). El
                    mínimo lo pone la base —15, migración 0123—: tres palabras
                    no alcanzan para entender qué pasó dentro de seis meses. */}
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

              <Paso numero={2} titulo="Código de autorización" icono={KeyRound} destacado>
                <CampoCodigo valor={pin} onChange={setPin} />
                <p className="text-xs leading-snug text-muted-foreground">
                  Pídaselo a <b className="text-foreground">operaciones o a gerencia</b>: lo tienen en su pantalla, dura
                  diez minutos y sirve para esta corrección.
                </p>
              </Paso>
            </div>

            <DialogFooter className="items-center gap-2">
              {/* Un botón apagado sin decir por qué se lee como una falla del
                  sistema. Acá dice qué falta. */}
              <span className="text-xs text-muted-foreground sm:mr-auto">
                {largoMotivo === 0
                  ? `Escriba qué está mal: mínimo ${MINIMO_MOTIVO} caracteres`
                  : !motivoOk
                    ? `Faltan ${MINIMO_MOTIVO - largoMotivo} caracteres del motivo`
                    : pin.length < 4
                      ? "Falta el código de cuatro dígitos"
                      : "Listo para abrirla"}
              </span>
              <span className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setAbierto(false)} disabled={enviando}>
                  Cancelar
                </Button>
                <Button onClick={confirmar} disabled={enviando || !listo}>
                  {enviando ? "Comprobando…" : "Abrir para corregir"}
                </Button>
              </span>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Un paso del trámite, numerado.
 *
 * El orden no es estético: el motivo va antes que el código porque es lo que el
 * comercial le lee al supervisor por teléfono para pedírselo. Numerarlo lo dice
 * sin tener que explicarlo, para quien abre esta pantalla dos veces al año.
 */
function Paso({
  numero,
  titulo,
  icono: Icono,
  destacado,
  children,
}: {
  numero: number;
  titulo: string;
  icono?: React.ComponentType<{ className?: string }>;
  /** El paso que necesita a otra persona: se enmarca para que no se pase por alto. */
  destacado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", destacado && "rounded-xl border-2 border-primary/30 bg-primary/5 p-3")}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-foreground">
        <span
          className={cn(
            "flex size-5 flex-none items-center justify-center rounded-full text-[11px] font-black",
            destacado ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
          )}
        >
          {numero}
        </span>
        {Icono && <Icono className="size-3.5 text-primary" />}
        {titulo}
      </p>
      {children}
    </div>
  );
}
