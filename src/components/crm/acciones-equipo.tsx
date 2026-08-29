"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, MoreVertical, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { eliminarEquipo, vecesCotizado } from "@/lib/acciones/productos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Lo que se puede hacer con un equipo desde la lista: editarlo, duplicarlo o
 * quitarlo (28-08).
 *
 * VA EN UN MENÚ Y NO EN TRES BOTONES. La tarjeta ya lleva marca, modelo,
 * código, categoría, precio y stock; tres botones más por fila convierten una
 * lista de ciento veinte equipos en una pared de controles. El menú aparece al
 * acercar el mouse, que es cuando hace falta.
 *
 * DUPLICAR ABRE LA HOJA, NO CREA NADA. Un duplicado silencioso es un equipo
 * repetido en el catálogo, que es justo el problema que ya tiene: cinco UT075
 * activas. Se abre la hoja con todo copiado y se guarda cuando esté distinto.
 */
export function AccionesEquipo({
  nombre,
  equipoId,
  onEditar,
  onDuplicar,
}: {
  nombre: string;
  equipoId: string;
  onEditar: () => void;
  onDuplicar: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [cotizado, setCotizado] = useState<number | null>(null);
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  async function abrirConfirmacion() {
    setMenu(false);
    setCotizado(await vecesCotizado(equipoId));
    setConfirmar(true);
  }

  function borrar() {
    empezar(async () => {
      const r = await eliminarEquipo(equipoId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.apagado
          ? `${nombre} quedó fuera del catálogo: el comercial ya no lo encuentra.`
          : `${nombre} se quitó del catálogo.`,
      );
      setConfirmar(false);
      router.refresh();
    });
  }

  return (
    <>
      <span className="relative flex-none" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setMenu(!menu)}
          title="Qué hacer con este equipo"
          className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 data-[abierto=true]:opacity-100"
          data-abierto={menu}
        >
          <MoreVertical className="size-4" />
        </button>

        {menu && (
          <>
            <span className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <span className="absolute right-0 top-full z-20 mt-1 block w-48 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  onEditar();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent"
              >
                <Pencil className="size-3.5 text-muted-foreground" /> Editar la ficha
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  onDuplicar();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent"
              >
                <Copy className="size-3.5 text-muted-foreground" /> Duplicar
              </button>
              <button
                type="button"
                onClick={abrirConfirmacion}
                className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-3.5" /> Quitar del catálogo
              </button>
            </span>
          </>
        )}
      </span>

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Quitar {nombre}</DialogTitle>
          </DialogHeader>

          {cotizado === null ? (
            <p className="text-sm text-muted-foreground">Revisando…</p>
          ) : cotizado > 0 ? (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-snug text-amber-900">
              <TriangleAlert className="mt-0.5 size-4 flex-none" />
              <span>
                Este equipo se cotizó <strong>{cotizado}</strong> {cotizado === 1 ? "vez" : "veces"}, y esas
                cotizaciones ya salieron a clientes. Borrarlo las dejaría sin qué imprimir, así que se{" "}
                <strong>apaga</strong>: queda fuera del catálogo y el comercial deja de encontrarlo.
              </span>
            </p>
          ) : (
            <p className="text-sm leading-snug text-muted-foreground">
              Nunca se cotizó, así que se borra del todo, con su precio. No se puede deshacer.
            </p>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmar(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={borrar} disabled={enviando || cotizado === null}>
              {enviando ? "Quitando…" : cotizado && cotizado > 0 ? "Dejar fuera del catálogo" : "Borrar el equipo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
