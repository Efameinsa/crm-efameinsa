"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, PencilLine, TriangleAlert } from "lucide-react";
import { abrirCorreccion, frenosDeCorreccion, type FrenosCorreccion } from "@/lib/acciones/correccion-cotizacion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
  const listo = puede && pin.length === 4 && motivo.trim().length >= 15;

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
          <DialogTitle>Corregir la cotización {codigo ?? ""}</DialogTitle>
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
            <div className="space-y-3">
              <p className="text-sm leading-snug text-muted-foreground">
                <b className="text-foreground">El número no cambia.</b> El cliente ya la tiene con este número y así va
                a quedar — por eso existe esta opción y no simplemente duplicarla. La versión de hoy queda archivada
                entera, por si el banco pregunta qué decía el documento que recibió.
              </p>

              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  ¿Qué está mal?
                </span>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Ej.: el cliente pidió apilable y salió la variante equivocada. Ya está presentada en el banco con este número."
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
                />
                <span className="text-[11px] text-muted-foreground">
                  Es lo que le va a leer a operaciones para pedirle el código, y lo que queda en el registro.
                </span>
              </label>

              <label className="block space-y-1 rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                  <KeyRound className="size-3.5" />
                  Código de autorización
                </span>
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder="4 dígitos"
                  className="w-32 rounded-md border border-primary/40 bg-background px-2 py-1.5 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary"
                />
                <span className="block text-[11px] text-muted-foreground">
                  Pídaselo a <b className="text-foreground">operaciones o a gerencia</b>: lo tienen en su pantalla, dura
                  diez minutos y sirve para esta corrección.
                </span>
              </label>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setAbierto(false)} disabled={enviando}>
                Cancelar
              </Button>
              <Button onClick={confirmar} disabled={enviando || !listo}>
                {enviando ? "Comprobando…" : "Abrir para corregir"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
