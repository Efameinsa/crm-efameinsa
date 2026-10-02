"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { FicharMaquina } from "@/components/crm/fichar-maquina";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * «+ REGISTRAR OTRA MÁQUINA» EN EL CASO (reunión 25-09, Ruby y Lesly).
 *
 * «Hay clientes que en un solo registro tienen varias máquinas, pero acá sale
 * para agregar solamente una… cuando agregues esa serie, ese botón tiene que
 * activarse nuevamente para que agregues otra». El caso ya aceptaba varias
 * máquinas (0253), pero solo las que el cliente tenía en su parque: una
 * segunda máquina nueva no tenía por dónde entrar. Con esto se registra y se
 * suma al caso; el botón vuelve a aparecer para la siguiente.
 *
 * EN UNA VENTANA, NO EN LA COLUMNA (reunión 28-09: «está muy pequeño… ese
 * widget donde se agregan más series tiene que estar mejor maquetado»). La
 * columna de la derecha mide 20rem y el formulario —serie, modelo con
 * sugerencias, fecha de la guía, garantía, dónde está— no cabía: se abre en
 * una ventana ancha, con el mismo formulario que el Paso 1 del circuito.
 */
export function OtraMaquinaDelCaso({ atencionId, cuenta, hayPrincipal }: { atencionId: string; cuenta: { id: string; razonSocial: string }; hayPrincipal: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const titulo = hayPrincipal ? "Otra máquina del mismo caso" : "La máquina del caso";
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/50 px-3 py-2 text-sm font-medium text-primary hover:bg-accent"
      >
        <Plus className="size-4" /> {hayPrincipal ? "Registrar otra máquina del caso" : "Registrar la máquina (todavía no está registrada)"}
      </button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">{titulo}</DialogTitle>
            <DialogDescription>
              {cuenta.razonSocial}. Se ficha en su parque instalado y queda
              {hayPrincipal ? " sumada a este caso" : " como la máquina de este caso, con la garantía verificada"}. Puede
              agregar varias de una vez.
            </DialogDescription>
          </DialogHeader>
          <FicharMaquina atencionId={atencionId} cuenta={cuenta} alTerminar={() => setAbierto(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
