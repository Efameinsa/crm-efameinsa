"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2, Check } from "lucide-react";
import { revertirAviso } from "@/lib/acciones/avisos";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Deshacer un aviso que salió a quien no era.
 *
 * El caso, el mismo día que se estrenó el aviso de tres destinos: «era para
 * Finanzas y terminó derivando a todos lados» (Carlos, 04-09 tarde). Y la
 * exigencia: «tiene que revertirse como si nada hubiera pasado; si yo soy
 * gestor, recibo, pero esto no es mío: que no me genere el cliente, que no me
 * genere nada».
 *
 * Central lo hace, pero no sola: pide el código de operaciones o gerencia,
 * como para corregir una derivación. «A alguien le tiene que dar la
 * autorización, o al menos que pida autorización con el PIN.»
 */
export function RevertirAvisoBoton({
  avisoId,
  resumen,
}: {
  avisoId: string;
  /** Qué se está deshaciendo, para que se lea antes de confirmar. */
  resumen: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [deshecho, setDeshecho] = useState<string[] | null>(null);
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  function cerrar() {
    setAbierto(false);
    setPin("");
    setMotivo("");
    setDeshecho(null);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground hover:bg-accent"
      >
        <Undo2 className="size-3" /> Revertir
      </button>

      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{deshecho ? "Aviso revertido" : "Revertir el aviso"}</DialogTitle>
            <DialogDescription>
              {deshecho
                ? "Quedó como si nunca se hubiera derivado."
                : "Se quita del historial del cliente y del pedido de postventa, y el contacto vuelve a la bandeja listo para asignar."}
            </DialogDescription>
          </DialogHeader>

          {!deshecho ? (
            <div className="space-y-3">
              <p className="rounded-md border border-border bg-secondary/40 p-2.5 text-xs text-foreground">{resumen}</p>
              <div>
                <label htmlFor="motivo-revertir" className="mb-1 block text-xs font-medium text-foreground">
                  ¿Por qué se revierte? (opcional)
                </label>
                <input
                  id="motivo-revertir"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="ej. Era solo para Finanzas y salió a los tres"
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-foreground">Código de operaciones o gerencia</p>
                <CampoCodigo valor={pin} onChange={setPin} tono="amber" />
              </div>
            </div>
          ) : (
            <ul className="space-y-1 text-sm text-[#1E7F4F]">
              {deshecho.map((d) => (
                <li key={d} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0" /> {d}
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            {!deshecho ? (
              <>
                <Button variant="outline" size="sm" onClick={cerrar} disabled={enviando}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={enviando || pin.trim().length !== 4}
                  onClick={() =>
                    empezar(async () => {
                      const r = await revertirAviso(avisoId, pin, motivo);
                      if (r.error) {
                        toast.error(r.error);
                        return;
                      }
                      toast.success("Aviso revertido.");
                      setDeshecho(r.deshecho ?? []);
                    })
                  }
                >
                  {enviando ? "Revirtiendo…" : "Revertir"}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={cerrar}>
                Listo, cerrar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
