"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { borrarBorradorInforme } from "@/lib/acciones/informes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Botón para borrar un cierre que todavía es BORRADOR.
 *
 * Brenda, 31-08: en «Mis cierres» le figuran seis informes y dos son borradores
 * repetidos del mismo cliente, que ensucian su lista y le inflan el conteo.
 * Pidió poder borrarlos y Santos lo autorizó: «no tiene sentido que figuren los
 * borradores».
 *
 * BORRAR NO ES ANULAR, y por eso este botón no se parece al de al lado. Anular
 * (0113) es para un cierre YA EMITIDO: conserva su número, deja rastro de quién
 * lo anuló y por qué, y exige el código del supervisor, porque ese documento ya
 * salió y alguien lo vio. Un borrador nunca salió: no tiene número, no llegó a
 * Central, no cuenta en ningún reporte. Es una hoja a medio llenar, y para
 * tirarla no hace falta permiso de nadie más que su dueño.
 *
 * Los frenos son los que corresponden a eso: se pide confirmar una vez, se dice
 * en la confirmación qué cliente y qué monto se lleva, y la base vuelve a
 * verificar que no esté emitido (la política `informes_borra` solo permite el
 * DELETE cuando `emitido_at is null`, y la acción del servidor lo comprueba
 * otra vez). Si alguien intentara borrar uno emitido, falla en dos sitios.
 */
export function BorrarBorradorBoton({
  informeId,
  cliente,
  monto,
}: {
  informeId: string;
  cliente: string;
  monto?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [borrando, empezar] = useTransition();
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        aria-label={`Borrar el borrador de ${cliente}`}
        title="Borrar este borrador"
        onClick={(e) => {
          // La fila entera es un enlace al PDF: sin esto, borrar abriría el PDF.
          e.preventDefault();
          e.stopPropagation();
          setAbierto(true);
        }}
        className="relative z-10 inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Borrar este borrador?</DialogTitle>
            <DialogDescription className="space-y-2 text-sm">
              <span className="block">
                <b className="text-foreground">{cliente}</b>
                {monto && <span className="text-muted-foreground"> · {monto}</span>}
              </span>
              <span className="block text-muted-foreground">
                Todavía no tiene número ni llegó a Central, así que no deja hueco en la numeración ni
                afecta ningún reporte. No se puede deshacer.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAbierto(false)} disabled={borrando}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={borrando}
              onClick={() =>
                empezar(async () => {
                  const r = await borrarBorradorInforme(informeId);
                  if (r.error) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success("Borrador eliminado.");
                  setAbierto(false);
                  router.refresh();
                })
              }
            >
              {borrando ? "Borrando…" : "Sí, borrarlo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
