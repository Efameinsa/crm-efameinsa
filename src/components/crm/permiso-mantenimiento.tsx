"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { permitirCotizarMantenimiento } from "@/lib/acciones/operaciones";
import { Button } from "@/components/ui/button";

/**
 * Abrir y cerrar la vista de mantenimiento de un comercial.
 *
 * Carlos lo actuó en la reunión del 28-08, con esas palabras:
 *
 *   «Administrador, por favor, ¿me puedes dar la vista? Voy a cotizar
 *    mantenimiento. […] ¿Terminaste de cotizar mantenimiento? Sí. Chau.
 *    Desactivado.»
 *
 * Por eso es un botón que dice qué va a pasar y no un interruptor que hay que
 * interpretar: la mitad del valor de este permiso está en CERRARLO, y un
 * interruptor prendido no le pide nada a nadie. Acá el botón del que ya lo
 * tiene dice «Cerrar», que es la acción pendiente.
 */
export function PermisoMantenimiento({
  comercialId,
  nombre,
  abierto,
}: {
  comercialId: string;
  nombre: string;
  abierto: boolean;
}) {
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  function alternar() {
    empezar(async () => {
      const r = await permitirCotizarMantenimiento(comercialId, !abierto);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(
        abierto
          ? `${nombre} ya no ve mantenimiento.`
          : `${nombre} puede cotizar mantenimiento. Ciérrelo cuando termine.`,
      );
      router.refresh();
    });
  }

  return (
    <Button variant={abierto ? "outline" : "default"} size="sm" onClick={alternar} disabled={enviando}>
      {enviando ? "…" : abierto ? "Cerrar" : "Abrir la vista"}
    </Button>
  );
}
